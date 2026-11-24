import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync,
  readFileSync, readlinkSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUILD_TIMEOUT_MS = 120_000;
const INPUT_LIMIT = 2 * 1024 * 1024;
const SCHEMA_VERSION = 1;

function execute(program, args, cwd, timeout = 10_000) {
  return spawnSync(program, args, {
    cwd, timeout, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
}

function git(root, args) {
  const result = execute('git', ['-C', root, ...args], root);
  if (result.error || result.status !== 0) {
    throw new Error('Git 检查失败：' + (result.error?.message || result.stderr || result.status));
  }
  return result.stdout;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runtimePaths(root, event) {
  const directory = join(root, 'logs', 'codex-hooks');
  const sessionKey = digest(event.session_id).slice(0, 24);
  mkdirSync(join(directory, 'state'), { recursive: true });
  return {
    directory,
    events: join(directory, 'events.jsonl'),
    baseline: join(directory, 'state', sessionKey + '.baseline.json'),
    post: join(directory, 'state', sessionKey + '.post.json'),
    stop: join(directory, 'state', sessionKey + '.stop.json'),
    cache: join(directory, 'build-cache.json'),
    lock: join(directory, 'build.lock'),
  };
}

function readState(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value.schemaVersion === SCHEMA_VERSION ? value : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function writeState(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify({ ...value, schemaVersion: SCHEMA_VERSION }));
  renameSync(temporary, path);
}

function audit(paths, event, details = {}) {
  const record = {
    time: new Date().toISOString(),
    event: event.hook_event_name,
    session_id: event.session_id,
    turn_id: typeof event.turn_id === 'string' ? event.turn_id : null,
    ...details,
  };
  appendFileSync(paths.events, JSON.stringify(record) + '\n', 'utf8');
}

function isBuildInput(path) {
  if (/^(?:\.codex|\.agents|docs|logs|tests)\//.test(path)) return false;
  if (/^(?:src|public)\//.test(path)) return true;
  if (/^(?:package(?:-lock)?|npm-shrinkwrap|tsconfig(?:\.[^/]+)?)\.json$/.test(path)) return true;
  if (/^vite\.config\.[cm]?[jt]s$/.test(path)) return true;
  return /\.(?:html|css|[cm]?js|[jt]sx?|svg|png|jpe?g|webp|gif|ico|woff2?|mp3|ogg|wav)$/.test(path);
}

function snapshot(root) {
  const names = [...new Set(git(root, [
    'ls-files', '-z', '--cached', '--others', '--exclude-standard',
  ]).split('\0').filter(Boolean))].sort();
  const working = createHash('sha256');
  const build = createHash('sha256').update(process.version);
  for (const name of names) {
    let content;
    try {
      const fullPath = join(root, name);
      content = lstatSync(fullPath).isSymbolicLink()
        ? Buffer.from('symlink:' + readlinkSync(fullPath))
        : readFileSync(fullPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      content = Buffer.from('deleted');
    }
    const entry = name + '\0' + digest(content) + '\0';
    working.update(entry);
    if (isBuildInput(name)) build.update(entry);
  }
  // 暂存区变化也需要重新检查，即使工作区文件内容没有变化。
  working.update(git(root, ['diff', '--cached', '--raw', '-z']));
  return { working: working.digest('hex'), build: build.digest('hex') };
}

function hasUncommittedBuildInputs(root) {
  const names = [
    ...git(root, ['diff', '--name-only', '-z', 'HEAD', '--']).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ];
  return names.some(name => name && isBuildInput(name));
}

function getBaseline(root, paths, event, current) {
  const existing = readState(paths.baseline);
  if (existing) return existing;
  const value = {
    build: event.hook_event_name === 'SessionStart' || !hasUncommittedBuildInputs(root)
      ? current.build : null,
    createdAt: new Date().toISOString(),
  };
  writeState(paths.baseline, value);
  return value;
}

function differenceCheck(root, paths) {
  const diagnostics = [];
  for (const args of [['diff', '--check'], ['diff', '--cached', '--check']]) {
    const result = execute('git', ['-C', root, ...args], root);
    if (result.error || result.status !== 0) {
      diagnostics.push(result.stdout || result.stderr || result.error?.message || 'Git 差异检查失败');
    }
  }
  // git diff 不覆盖未跟踪文件，单独与空文件比较，避免新增文件漏检。
  const empty = join(paths.directory, 'empty');
  writeFileSync(empty, '');
  for (const name of git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0').filter(Boolean)) {
    const fullPath = join(root, name);
    if (!existsSync(fullPath) || lstatSync(fullPath).isSymbolicLink()) continue;
    const result = execute('git', ['diff', '--no-index', '--check', '--', empty, fullPath], root);
    if (result.error || result.status > 1 || (result.status !== 0 && result.stdout.trim())) {
      diagnostics.push(result.stdout || result.stderr || result.error?.message || name);
    }
  }
  return diagnostics.join('\n').slice(-5000);
}

function postTool(root, paths, event, current) {
  const previous = readState(paths.post);
  // 同一诊断只反馈一次，避免读取文件时再次拒绝工具结果，妨碍定位问题。
  if (previous?.fingerprint === current.working) return {};
  const problems = differenceCheck(root, paths);
  writeState(paths.post, { fingerprint: current.working, passed: !problems });
  audit(paths, event, { check: 'diff', status: problems ? 'failed' : 'passed' });
  return problems ? {
    decision: 'block',
    reason: '工具已经执行，以下是编辑后的差异检查反馈，不会撤销修改。请检查本次相关问题：\n' + problems,
  } : {};
}

function failedStop(paths, event, fingerprint, reason) {
  writeState(paths.stop, { fingerprint, status: 'failed', reason });
  if (event.stop_hook_active) {
    return { systemMessage: reason + '\n本轮已自动反馈一次，不再继续循环；最终回复必须如实说明未通过的检查。' };
  }
  return { decision: 'block', reason };
}

function stop(root, paths, event, current, baseline) {
  if (current.build === baseline.build) {
    audit(paths, event, { check: 'build', status: 'skipped_no_source_change' });
    return {};
  }
  const cache = readState(paths.cache);
  if (cache?.fingerprint === current.build) {
    audit(paths, event, { check: 'build', status: 'cached_pass', log: cache.log });
    return {};
  }
  const previous = readState(paths.stop);
  if (event.stop_hook_active && previous?.fingerprint === current.build && previous.status === 'failed') {
    audit(paths, event, { check: 'build', status: 'failed_no_repeat' });
    return failedStop(paths, event, current.build, previous.reason);
  }
  let descriptor;
  try {
    // 构建互斥，防止同一目录的不同会话同时改写 dist。
    if (existsSync(paths.lock) && Date.now() - statSync(paths.lock).mtimeMs > 300_000) {
      unlinkSync(paths.lock);
    }
    try {
      descriptor = openSync(paths.lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      audit(paths, event, { check: 'build', status: 'busy' });
      return failedStop(paths, event, current.build,
        '另一个会话正在构建此项目，当前 Hook 未完成构建检查。请等待其结束后再核对结果。');
    }
    const result = process.platform === 'win32'
      ? execute('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run build'], root, BUILD_TIMEOUT_MS)
      : execute('npm', ['run', 'build'], root, BUILD_TIMEOUT_MS);
    const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
    const log = join('logs', 'codex-hooks', 'build-' + current.build.slice(0, 16) + '.log');
    writeFileSync(join(root, log), output, 'utf8');
    let passed = !result.error && result.status === 0;
    const sourceChanged = snapshot(root).build !== current.build;
    if (sourceChanged) passed = false;
    audit(paths, event, {
      check: 'build', status: passed ? 'passed' : 'failed',
      exit_code: result.status, source_changed_during_build: sourceChanged, log,
    });
    if (!passed) {
      return failedStop(paths, event, current.build,
        (sourceChanged ? '构建期间源码又发生了变化，需要重新核对构建。'
          : '结束前的构建检查失败，请处理与本次任务相关的错误；不要覆盖用户已有改动。')
        + '\n日志：' + log + '\n' + output.slice(-2500));
    }
    writeState(paths.cache, { fingerprint: current.build, log, completedAt: new Date().toISOString() });
    writeState(paths.stop, { fingerprint: current.build, status: 'passed' });
    return {};
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      unlinkSync(paths.lock);
    }
  }
}

export function handleEvent(event) {
  if (!event || typeof event.cwd !== 'string' || typeof event.session_id !== 'string'
      || !event.session_id || typeof event.hook_event_name !== 'string') {
    throw new Error('Hook 输入缺少 cwd、session_id 或 hook_event_name');
  }
  const root = git(resolve(event.cwd), ['rev-parse', '--show-toplevel']).trim();
  const paths = runtimePaths(root, event);
  if (event.hook_event_name === 'SubagentStart' || event.hook_event_name === 'SubagentStop') {
    audit(paths, event, {
      agent_id: typeof event.agent_id === 'string' ? event.agent_id : null,
      agent_type: typeof event.agent_type === 'string' ? event.agent_type : null,
      status: event.hook_event_name === 'SubagentStart' ? 'started' : 'stopped',
    });
    return {};
  }
  const current = snapshot(root);
  const baseline = getBaseline(root, paths, event, current);
  if (event.hook_event_name === 'SessionStart') {
    audit(paths, event, { status: 'baseline_ready' });
    return {};
  }
  if (event.hook_event_name === 'PostToolUse') return postTool(root, paths, event, current);
  if (event.hook_event_name === 'Stop') return stop(root, paths, event, current, baseline);
  throw new Error('未配置的 Hook 事件：' + event.hook_event_name);
}

export async function runCli() {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > INPUT_LIMIT) throw new Error('Hook 输入超过大小限制');
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
    process.stdout.write(JSON.stringify(handleEvent(JSON.parse(input))) + '\n');
  } catch (error) {
    process.stderr.write('项目 Hook 未完成：' + error.message + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}
