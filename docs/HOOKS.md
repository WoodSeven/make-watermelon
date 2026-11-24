# 项目 Hooks 使用说明

项目在 .codex/hooks.json 注册事件，统一调用 .codex/hooks/run.mjs。脚本使用现有 Node.js、Git 和 npm，不需要新增游戏依赖。

## 已配置的行为

| 事件 | 行为 |
| --- | --- |
| SessionStart | 保存当前源码基线，用来判断本次会话后续是否改动了源码。 |
| SubagentStart 和 SubagentStop | 记录实际收到的子agent启动、结束事件、角色和 ID。 |
| PostToolUse | apply_patch、Edit、Write 或 Bash 完成后，对变化的文件运行差异检查；同时覆盖暂存区和未跟踪文件。文件没有变化时复用检查结果。 |
| Stop | 源码或构建输入相对会话基线发生变化时，按需执行 npm run build；相同内容已通过时复用结果。文档或 Agent 配置变化本身不触发游戏构建。 |

Stop 表示本轮准备结束，不代表整个网站开发完成。检查比较文件内容，因此即使 Agent 已经 commit，仍能发现本次源码变化。

PostToolUse 检查失败会把诊断反馈给 Agent，已经执行的编辑不会被撤销。相同文件与暂存区状态下不重复反馈，便于 Agent 继续读取文件并定位问题；后续改动会重新检查。Stop 构建失败最多自动要求继续处理一次；如果仍然失败，会报告未通过的结果并避免无限续跑。构建最长运行 120 秒，同一项目的并发构建通过本地锁协调。

## 在 Codex 中启用

先检查脚本和配置，再在 Codex 的 Hooks 审阅界面信任本项目的 Hooks。桌面端可在 Review hooks 或 Settings → Hooks 中查看；Codex CLI 的交互会话使用 /hooks。这里的 /hooks 不是 PowerShell 命令。

项目被信任和 Hook 被信任是两件事。非托管的新 Hook 或发生变化的 Hook 定义需要审阅，未信任时可能跳过。建议完成审阅后，在此项目目录新建聊天，以便记录完整会话基线。

本次配置不改变用户或系统级 Hook、权限策略或信任记录。

## 查看实际执行记录

运行日志保存在项目的 logs/codex-hooks/ 中，已由现有 .gitignore 的 logs 规则忽略。

在项目根目录的 PowerShell 中查看最近事件：

    Get-Content -LiteralPath .\logs\codex-hooks\events.jsonl -Tail 20

每条记录有事件、时间、会话 ID、任务 ID 和结果。子agent事件还包含角色及子agent ID。没有收到启动事件时，日志不会虚构子agent启动记录，也不会补记启用前的历史。

构建日志是同目录中的 build-开头文件。state 子目录和 build-cache.json 只用于去重与基线记录。日志不保存用户 prompt、完整工具参数、模型回复或会话正文。

如果事件文件尚未出现，先确认 Hook 已审阅和信任，并且已经发生匹配的事件。检查结果中 passed 表示本次执行通过，cached_pass 表示复用了同内容的成功构建，skipped_no_source_change 表示源码没有变化；跳过不等于重新验证。

## 能检查和不能代替的内容

这些 Hook 记录事件、检查差异并运行构建。它们不自动创建子agent，不自动 commit 或 push，也不能代替 qa 对页面、操作和玩法的实际验收。某些工具路径不触发工具 Hook，因此这不是所有文件操作的完整监控。

新聊天启用前已有源码改动会作为基线；若接手未完成的任务，应由 Agent 按任务要求补做相关检查。已有会话中途加入 Hooks 时，也应重新开始项目聊天或明确复核检查范围。

## 脚本验证

在项目根目录运行：

    node --test .codex/hooks/hooks.test.mjs

测试使用独立临时 Git 仓库及模拟事件，不会在真实项目日志中伪造子agent活动。测试通过只证明脚本行为，不表示用户已经信任 Hooks 或运行时已发送过真实事件。
