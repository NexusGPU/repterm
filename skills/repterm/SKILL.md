---
name: repterm
description: >-
  Skill for maintaining and extending the Repterm CLI/TUI test framework,
  including core components and @repterm/plugin-kubectl plugin.
  Triggers when writing/running Repterm tests, debugging terminal recording/parallel execution,
  or implementing plugins and matchers.
---

# 使用时机
- 需要理解或修改 `packages/repterm` 核心（CLI、runner、terminal、recording、api、utils）。
- 需要运行或修复 `packages/repterm/tests` 单测、`packages/repterm/examples` 示例，或编写新的终端自动化测试。
- 需要接入/扩展插件体系（`packages/repterm/src/plugin/*`、`packages/plugin-kubectl`），含自定义 expect matcher。
- 需要排查录制模式（asciinema + tmux）、多终端 pane、并行调度、artifact/report 输出。

# 速查表

| 任务 | 命令 |
|------|------|
| 安装依赖 | `bun install` |
| 运行全部单测 | `bun test packages/repterm/tests` |
| 运行示例 | `bun src/cli/index.ts packages/repterm/examples/01-basic-commands.ts` |
| 录制模式 | `bun src/cli/index.ts --record <tests>` |
| 并行执行 | `bun src/cli/index.ts --workers 4 <tests>` |
| Kubectl 插件示例 | `bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts` |

# 决策树：我应该看哪个参考文件？

| 需求 | 参考文件 |
|------|----------|
| 理解整体架构 | `references/architecture.md` |
| 调试终端/录制问题 | `references/terminal-modes.md` |
| 理解执行流程 | `references/runner-pipeline.md` |
| 查看测试覆盖 | `references/testing-matrix.md` |
| 编写测试示例 | `references/examples-catalog.md` |
| 开发/使用插件 | `references/plugin-kubectl.md` |
| API 速查 | `references/api-cheatsheet.md` |
| 常见代码模式 | `references/common-patterns.md` |
| 问题排查 | `references/troubleshooting.md` |

# 快速导航
- 根 README：框架目标、安装及 CLI 用法（`README.md`）。
- 需求/故事：`specs/001-tui-test-framework/spec.md`。
- Monorepo 脚本：`package.json`（`bun test packages/repterm/tests`、`npm run example[:record]` 等）。
- 核心源码：`packages/repterm/src`（api、cli、runner、terminal、recording、plugin、utils）。
- 单测：`packages/repterm/tests/unit/*.test.ts`，用于定位功能覆盖。
- 插件示例：`packages/plugin-kubectl`（含 README 与示例脚本）。
- 附加参考：打开 `references/` 下各文件获取架构、测试矩阵、终端模式、runner 流程、示例索引、插件指南。

# 环境与依赖
1. **运行时**：Node.js 20.11 + Bun（`README.md`）。确认 `bun.lock` 与 `package.json` 同步。
2. **安装**：在仓库根执行 `npm install` 或 `bun install`。
3. **可执行脚本**：优先使用 `package.json` 的 npm script：
   - `npm run build` / `npm run build:repterm`。
   - `npm run test`（等价 `bun test packages/repterm/tests`）。
   - `npm run example`、`npm run example:record`。
4. **录制依赖**：
   - `packages/repterm/src/utils/dependencies.ts` 通过 `which` 检查 `asciinema`、`tmux`。
   - 录制模式命令：`bun src/cli/index.ts --record <tests>` 或 `npm run example:record`。
   - 若缺依赖，CLI 会提示安装命令（`brew install` / `apt-get install`）。

# CLI 与测试执行
1. **CLI 入口**：`packages/repterm/src/cli/index.ts`（Bun shebang）。
2. **关键参数**：
   - `--record/-r`：仅运行标注 `{ record: true }` 的测试；需先满足依赖检测。
   - `--workers/-w`：并行 worker 数；>1 时由 scheduler 分配。
   - `--timeout/-t`、`--slow-threshold`、`--verbose/-v`、`--recording-dir`。
3. **执行流程**：解析参数 → `loadConfig` → `createArtifactManager` → `discoverTests` / `loadTestFiles` → suite 过滤 → 选择顺序或 scheduler → reporter 输出。
4. **常用命令**：
   - 运行全部单测：`bun test packages/repterm/tests`.
   - 运行示例：`bun src/cli/index.ts packages/repterm/examples/01-basic-commands.ts`.
   - 录制示例：`bun src/cli/index.ts --record packages/repterm/examples/08-recording-demos.ts`.
5. **报错定位**：查看 reporter 输出与 `artifacts/` 生成文件（`.cast`, `.log` 等）。

# API 与测试 authoring
1. **注册机制** (`packages/repterm/src/api/test.ts`、`describe.ts`、`steps.ts`、`hooks.ts`):
   - `test()`：记录 `TestCase`；支持 `options.record`、`timeout`。
   - `describe()`：创建 `TestSuite`，可设置 `options.record` 继承。
   - `test.step()` / `step()`：组织多阶段操作；失败会把错误写入 step payload。
   - Hooks：`beforeEach/afterEach` 支持命名 fixture（仅请求的参数才执行）；`beforeAll/afterAll` 依 onion 模型合并上下文。
2. **断言系统** (`packages/repterm/src/api/expect.ts`):
   - `expect(terminal)` → `TerminalExpect`: `toContainText`、`toMatchPattern`、`not.*`。
   - `expect(result)` → `CommandResultExpect`: `toSucceed`、`toFail`、`toHaveExitCode`、`toHaveStdout/Stderr`、`toContainInOutput` 等。
   - 支持 `expect.extend()`（插件可注入自定义 matcher）。
3. **示例**：参考 `packages/repterm/examples/*.ts`；详见 `references/examples-catalog.md`。

# 终端与录制
1. **Terminal 类** (`packages/repterm/src/terminal/terminal.ts`):
   - 非录制/非交互：`Bun.spawn`，精确 exitCode，stdout/stderr 分离。
   - 录制或交互：PTY 模式，支持 `expect/send`，exitCode 不可靠；`CommandResult` 由 `PTYProcessImpl` 包装。
   - 多 pane：`terminal.create()` 会在 tmux 中拆分窗口，`selectPane()` 用 `Ctrl+B o` 切换。
   - `waitForText`：录制模式用 `tmux capture-pane` 隔离 pane 输出，默认剥离 ANSI。
   - `snapshot()`：录制时返回 Pane 内容脱 ANSI，非录制返回 session buffer。
2. **Recorder** (`packages/repterm/src/recording/recorder.ts`):
   - 通过 `asciinema rec` + `--command "tmux new"` 录制；`stop()` 发送 SIGTERM。
   - CLI 在 `record` 模式下自动检查依赖并生成 `.cast`。
3. **调试技巧**：若 `terminal.waitForText` 超时，检查 `options.timeout`、`stripAnsi`；可使用 `terminal.snapshot()` 输出当前缓冲。
4. **更多细节**：参阅 `references/terminal-modes.md`。

# Runner、Scheduler、Reporter
1. **Runner** (`packages/repterm/src/runner/runner.ts`):
   - `runSuite`：按 onion 执行 `beforeAll → tests → 子 suite → afterAll`。
   - `runTest`：创建终端、解析 fixtures、执行 steps、超时保护、记录 `RunResult`。
   - `hooksRegistry`：负责 hooks 的懒执行与清理。
2. **Scheduler** (`packages/repterm/src/runner/scheduler.ts` + `worker.ts`):
   - `createScheduler` 仅在 `workers > 1` 使用；fork 子进程运行 suite，事件 `ready/result/done/error`。
   - `ArtifactManager` (`packages/repterm/src/runner/artifacts.ts`) 为每个 run/worker 提供独立目录与 `.cast/.log` 路径。
3. **Reporter** (`packages/repterm/src/cli/reporter.ts`):
   - `onTestStart` 预先打印 suite 标题，`onTestResult` 输出状态符号和耗时。
   - `onRunComplete` 汇总并打印失败详情；可通过 `--slow-threshold` 标记慢测试。
4. **调优**：修改 `packages/repterm/src/runner/config.ts` 的默认超时/并行配置（同时更新 `packages/repterm/tests/unit/config.test.ts`）。
5. **参考**：详见 `references/runner-pipeline.md` 与 `references/testing-matrix.md`。

# 插件与扩展
1. **插件运行时** (`packages/repterm/src/plugin/index.ts`, `withPlugins.ts`):
   - `definePlugin` 返回 `setup()`，可扩展 context、method、hooks。
   - `createTestWithPlugins` / `describeWithPlugins` 封装 `test/describe`，自动初始化插件、执行 hooks。
2. **Kubectl 插件** (`packages/plugin-kubectl`):
   - `src/index.ts` 定义 kubectl 操作（apply/delete/wait/logs/rollout/port-forward 等）与上下文。
   - `src/matchers.ts` 提供 `pod()`、`deployment()` 包装器以及 `expect` matcher（`toBeRunning`、`toHavePhase` 等）。
   - `examples/*.ts` 展示调用方式，`README.md` 列出 API 表。
3. **扩展步骤**：按需复制 Kubectl 插件结构，更新 `matchers.d.ts`、`examples`，并在技能参考 `references/plugin-kubectl.md` 查阅。

# 调试与常见问题
- **依赖缺失**：`checkDependencies(true)` 报错时，优先安装 `asciinema`、`tmux`。若在 CI，需跳过录制测试或模拟命令输出。
- **录制卡死**：确认 tmux session 关闭；`Terminal.close()` 已尝试 `Ctrl+B d` + `tmux kill-session`。
- **并行调度失败**：排查 `config.parallel.workers` 设置，确保 suite 可序列化（不要在 suite 对象中保留不可克隆资源）。
- **测试加载不到**：`discoverTests` 默认匹配 `.ts/.js`；若需自定义 pattern，传递 `LoaderOptions.pattern`。详见 `packages/repterm/tests/unit/loader.test.ts`。
- **Reporter 输出错乱**：确保在自定义代码中调用 `onTestStart` 之前不要插入额外 stdout；可在 `Reporter` 中开启 `verbose` 查看堆栈。

# 参考文件
阅读下列文件获取更细分的流程与表格：
- `references/architecture.md` - 系统架构图
- `references/api-cheatsheet.md` - API 速查表
- `references/common-patterns.md` - 常见代码模式
- `references/troubleshooting.md` - 问题排查指南
- `references/testing-matrix.md` - 单元测试矩阵
- `references/terminal-modes.md` - 终端执行模式
- `references/runner-pipeline.md` - Runner 执行流程
- `references/examples-catalog.md` - 示例脚本索引
- `references/plugin-kubectl.md` - Kubectl 插件指南
