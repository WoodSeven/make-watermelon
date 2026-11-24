import assert from 'node:assert/strict';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { handleEvent } from './run.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixturePrefix = 'codex-hook-tests with spaces-';

function command(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), fixturePrefix));
  t.after(() => {
    const insideTemp = relative(resolve(tmpdir()), resolve(root));
    assert.ok(insideTemp && !insideTemp.startsWith('..') && basename(root).startsWith(fixturePrefix));
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.gitignore'), 'logs/\ndist/\nnode_modules/\n');
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 1;\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    private: true, scripts: { build: 'node build.cjs' },
  }) + '\n');
  writeFileSync(join(root, 'build.cjs'), [
    "const fs = require('node:fs');",
    "fs.mkdirSync('logs', {recursive:true});",
    "const n = fs.existsSync('logs/build-count') ? Number(fs.readFileSync('logs/build-count','utf8')) : 0;",
    "fs.writeFileSync('logs/build-count', String(n + 1));",
    "const source = fs.readFileSync('src/game.js','utf8');",
    "if (source.includes('BROKEN')) { console.error('fixture build failed'); process.exit(1); }",
    "if (source.includes('CHANGE_DURING_BUILD')) fs.writeFileSync('src/game.js', 'const value = 99;\\n');",
    "fs.mkdirSync('dist', {recursive:true});",
    "fs.writeFileSync('dist/index.html', 'fixture built');",
    '',
  ].join('\n'));
  command(root, ['init']);
  command(root, ['config', 'core.autocrlf', 'false']);
  command(root, ['add', '.']);
  command(root, ['-c', 'user.name=HookTests', '-c', 'user.email=hooks@example.invalid',
    'commit', '-m', 'seed']);
  return root;
}

function event(root, name, extra = {}) {
  return {
    cwd: root, session_id: 'test-session', turn_id: 'test-turn',
    hook_event_name: name, ...extra,
  };
}

function logs(root) {
  return readFileSync(join(root, 'logs', 'codex-hooks', 'events.jsonl'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line));
}

function buildCount(root) {
  const path = join(root, 'logs', 'build-count');
  return existsSync(path) ? Number(readFileSync(path, 'utf8')) : 0;
}

test('子agent日志保留真实事件字段，不保存会话正文', t => {
  const root = fixture(t);
  const payload = { agent_id: 'agent-123', agent_type: 'frontend_layout',
    last_assistant_message: '不要记录此正文', prompt: '不要记录此 prompt' };
  assert.deepEqual(handleEvent(event(root, 'SubagentStart', payload)), {});
  assert.deepEqual(handleEvent(event(root, 'SubagentStop', payload)), {});
  const records = logs(root);
  assert.deepEqual(records.map(record => [record.event, record.agent_id, record.agent_type]), [
    ['SubagentStart', 'agent-123', 'frontend_layout'],
    ['SubagentStop', 'agent-123', 'frontend_layout'],
  ]);
  assert.ok(!JSON.stringify(records).includes('不要记录'));
  assert.match(records[0].time, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(command(root, ['check-ignore', 'logs/codex-hooks/events.jsonl']).trim(),
    'logs/codex-hooks/events.jsonl');
});

test('编辑后发现空白问题，给出反馈且保留已完成的修改', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  const badContent = 'const value = 2;  \n';
  writeFileSync(join(root, 'src', 'game.js'), badContent);
  const result = handleEvent(event(root, 'PostToolUse', { tool_name: 'apply_patch' }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /trailing whitespace/);
  assert.equal(readFileSync(join(root, 'src', 'game.js'), 'utf8'), badContent);
  const failedLogCount = logs(root).length;
  assert.deepEqual(handleEvent(event(root, 'PostToolUse', { tool_name: 'Bash' })), {});
  assert.equal(logs(root).length, failedLogCount, '后续读取不重复反馈同一诊断');
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 2;\n');
  assert.deepEqual(handleEvent(event(root, 'PostToolUse', { tool_name: 'apply_patch' })), {});
  const count = logs(root).length;
  handleEvent(event(root, 'PostToolUse', { tool_name: 'Bash' }));
  assert.equal(logs(root).length, count, '无文件变化时不重复检查');
});

test('差异检查覆盖新文件，也覆盖工作区已修复但暂存区仍有问题的情况', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  writeFileSync(join(root, 'new-file.md'), 'new content  \n');
  assert.equal(handleEvent(event(root, 'PostToolUse', { tool_name: 'Bash' })).decision, 'block');
  writeFileSync(join(root, 'new-file.md'), 'new content\n');
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 2;  \n');
  command(root, ['add', 'src/game.js']);
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 2;\n');
  const result = handleEvent(event(root, 'PostToolUse', { tool_name: 'Bash' }));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /trailing whitespace/);
});

test('仅修改文档或Agent配置时不构建游戏', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  mkdirSync(join(root, '.codex', 'agents'), { recursive: true });
  writeFileSync(join(root, '.codex', 'agents', 'sample.toml'), 'name = "sample"\n');
  writeFileSync(join(root, 'README.md'), '文档变更\n');
  assert.deepEqual(handleEvent(event(root, 'Stop')), {});
  assert.equal(buildCount(root), 0);
  assert.equal(logs(root).at(-1).status, 'skipped_no_source_change');
});

test('已提交的源码变化仍触发构建，重复启动不覆盖基线，成功结果可复用', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 2;\n');
  command(root, ['add', 'src/game.js']);
  command(root, ['-c', 'user.name=HookTests', '-c', 'user.email=hooks@example.invalid',
    'commit', '-m', 'change']);
  assert.equal(command(root, ['status', '--porcelain']).trim(), '');
  handleEvent(event(root, 'SessionStart', { source: 'fork' }));
  assert.deepEqual(handleEvent(event(root, 'Stop')), {});
  assert.equal(buildCount(root), 1);
  assert.equal(logs(root).at(-1).status, 'passed');
  assert.deepEqual(handleEvent(event(root, 'Stop')), {});
  assert.equal(buildCount(root), 1);
  assert.equal(logs(root).at(-1).status, 'cached_pass');
});

test('构建失败最多反馈续跑一次，修复后可以重新检查通过', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  writeFileSync(join(root, 'src', 'game.js'), 'BROKEN\n');
  const failed = handleEvent(event(root, 'Stop', { stop_hook_active: false }));
  assert.equal(failed.decision, 'block');
  assert.match(failed.reason, /fixture build failed/);
  assert.equal(buildCount(root), 1);
  const repeated = handleEvent(event(root, 'Stop', { stop_hook_active: true }));
  assert.equal(repeated.decision, undefined);
  assert.match(repeated.systemMessage, /不再继续循环/);
  assert.equal(buildCount(root), 1);
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 3;\n');
  assert.deepEqual(handleEvent(event(root, 'Stop', { stop_hook_active: true })), {});
  assert.equal(buildCount(root), 2);
  assert.equal(logs(root).at(-1).status, 'passed');
});

test('构建期间源码变化不能被错误缓存为成功', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  writeFileSync(join(root, 'src', 'game.js'), 'CHANGE_DURING_BUILD\n');
  const result = handleEvent(event(root, 'Stop'));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /源码又发生了变化/);
  assert.equal(logs(root).at(-1).source_changed_during_build, true);
  assert.ok(!existsSync(join(root, 'logs', 'codex-hooks', 'build-cache.json')));
});

test('同目录另一场构建持锁时不重复启动，也不删除别人的锁', t => {
  const root = fixture(t);
  handleEvent(event(root, 'SessionStart'));
  writeFileSync(join(root, 'src', 'game.js'), 'const value = 2;\n');
  const lock = join(root, 'logs', 'codex-hooks', 'build.lock');
  writeFileSync(lock, 'other build');
  const result = handleEvent(event(root, 'Stop'));
  assert.equal(result.decision, 'block');
  assert.equal(buildCount(root), 0);
  assert.equal(readFileSync(lock, 'utf8'), 'other build');
});

test('hooks.json中的启动命令能从含空格的子目录运行并输出合法JSON', t => {
  const root = fixture(t);
  const target = join(root, '.codex', 'hooks');
  mkdirSync(target, { recursive: true });
  copyFileSync(join(scriptDirectory, 'run.mjs'), join(target, 'run.mjs'));
  const cwd = join(root, 'nested folder');
  mkdirSync(cwd);
  const config = JSON.parse(readFileSync(join(scriptDirectory, '..', 'hooks.json'), 'utf8'));
  const output = execSync(config.hooks.SubagentStart[0].hooks[0].command, {
    cwd, input: JSON.stringify(event(cwd, 'SubagentStart', {
      agent_type: 'qa', agent_id: 'agent-from-launcher',
    })), encoding: 'utf8', windowsHide: true, timeout: 15_000,
  });
  assert.deepEqual(JSON.parse(output), {});
  assert.equal(logs(root).at(-1).agent_id, 'agent-from-launcher');
});
