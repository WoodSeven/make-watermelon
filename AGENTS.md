# make-watermelon 项目指南

这是浏览器里的合成大西瓜，使用 TypeScript、Vite、Pixi.js 和 Box2D；没有后端。

## 入口和结构

- `index.html` 先加载 `public/box2d.min.js`、`public/pixi-6.4.2.min.js`，再加载 `src/main.ts`。页面依赖这两个全局引擎脚本及其加载顺序。
- `src/main.ts` 挂载 canvas、加载水果图片、处理窗口缩放；`src/app.ts` 创建 Pixi Application。
- `src/core/index.ts` 处理投放、刚体、碰撞合成、当前和下一个水果、鼠标和触摸事件。
- `src/config/index.ts` 定义画布尺寸、物理参数和按等级排列的 `Fruits`；图片在 `public/fruits/`。
- `src/pixi.ts`、`src/box2d.ts` 给 `window.PIXI`、`window.b2` 提供类型；`src/b2/` 是随仓库保存的第三方 Box2D 源码。
- 页面样式在 `src/index.css`；没有 React 组件，也没有服务器端入口。

## 命令

以下命令在项目根目录运行。Windows PowerShell 使用 `npm.cmd`，其他环境可以使用 `npm`。

| 用途 | 命令 |
| --- | --- |
| 安装锁定依赖 | `npm.cmd ci --ignore-scripts --no-audit --no-fund` |
| 启动开发服务 | `npm.cmd run dev -- --host 127.0.0.1` |
| 类型检查和生产构建 | `npm.cmd run build` |
| 预览构建产物 | `npm.cmd run preview -- --host 127.0.0.1` |
| 检查应用 TypeScript 的 lint | `npm.cmd exec -- eslint "src/**/*.ts" --ignore-pattern "src/b2/**"` |

`package.json` 只有 `dev`、`build`、`preview` 三个脚本。没有 `npm test`、`npm run lint`、自动化测试套件或 formatter 配置；上面的 lint 是直接调用已安装的 ESLint，不是仓库已有的 npm script。先区分原有诊断和本次引入的问题，不要为了一个小任务全量格式化项目。

## 修改约定

- 应用 TypeScript 使用两个空格缩进、单引号、分号和 LF 换行；沿用现有导出方式及无扩展名的相对 import。Windows 的 Git 自动转换可能产生 CRLF 和 `linebreak-style` 报错，需区分检出差异与代码问题，不要直接全量 `--fix`。
- `Fruits` 的数组下标就是水果等级，必须与图片、半径和碰撞数据一起考虑；当前最高等级判断是 `src/core/index.ts` 中的 `a.type >= 10`。
- 物理坐标与像素坐标通过 `Ratio` 换算。修改位置、尺寸、碰撞时保留相应转换；鼠标和触摸使用不同的坐标换算路径，都需要验证。
- 合成发生在 `world.Step()` 之后的 `doWithContactedFruits()`；碰撞回调先登记待合成对象，不要把删除刚体的操作搬进碰撞回调。

## 修改边界和验证

- 游戏功能优先修改 `src/core/`、`src/config/`、`src/main.ts` 或页面样式。不要直接编辑 `public/*.min.js` 或批量改写 `src/b2/`；它们属于第三方引擎实现。
- `node_modules/`、`dist/` 是依赖或生成内容。依赖没有变更时保留 `package-lock.json`，不要手工编辑锁文件。`.gitignore` 还忽略名为 `scripts` 的目录，新增辅助脚本前检查是否会被忽略。
- `public/` 下的图片和引擎脚本通过根路径引用；不要删除它们或直接双击 `index.html` 作为运行方法，应通过 Vite 服务访问。
- 构建通过只能证明类型检查和打包成功。修改玩法后还要在浏览器检查资源加载、投放、同级合成、最高级水果以及窄屏/触摸表现，并如实报告实际检查过的项目。

## Git 版本记录

- 每完成一项独立的代码、配置或文档修改，检查改动并执行与修改相关的验证，然后自动创建一次本地 commit，以便回退；以完整的小任务为单位保存版本。
- 开始修改前运行 `git status`，保留用户已有的改动。暂存时明确指定本次任务的文件或改动片段，只提交本次任务的内容。
- 使用中文提交说明，描述修改内容，并在提交正文中记录验证结果；未执行的检查说明原因，不能写成已通过。仅修改文档时检查内容和 `git diff --check` 即可。
- 完成后报告 commit ID、提交说明和验证结果。没有实际改动时无需创建空提交；提交失败时保留改动并说明原因。
- 默认保存到本地 Git；用户明确要求上传时再执行 `git push`。

## Subagent 分工

- 页面布局、配色、文字层次、操作提示排版和手机适配任务，委派给项目级 `frontend_layout` Subagent，其定义在 `.codex/agents/frontend_layout.toml`。主 Agent 说明任务目标和文件分工后再委派，并在完成后检查结果。
- `frontend_layout` 主要负责 `index.html`、`src/index.css`；涉及画布缩放时协调 `src/main.ts`，涉及画布外观时协调 `src/app.ts`。物理引擎与玩法逻辑继续按上面的修改边界处理。
- Subagent 返回修改内容和实际验证结果；主 Agent 统一按 Git 版本记录规则创建本地 commit。需要 Subagent 自行提交时，主 Agent 必须明确分配提交任务并避免并发操作 Git。
