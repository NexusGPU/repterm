# 终端 / 录制模式速查

## 1. 执行模式
| 模式 | 入口 | 描述 | 何时使用 |
| --- | --- | --- | --- |
| 非录制 + 非交互 | `Terminal.run()` 默认走 `Bun.spawn`（`packages/repterm/src/terminal/terminal.ts`） | 精确 exitCode、stdout/stderr 分离、`CommandResult` 包含 `stdout/stderr/output/duration` | 验证命令输出、管道、状态码 |
| 录制模式 | CLI `--record`，`Terminal` 初始化 `asciinema rec --command "tmux new"` | 每个命令通过 tmux pane 执行，`waitForText/snapshot` 读 `capture-pane`，exitCode 可能为 -1 | 需要生成 `.cast` 或运行 `{ record: true }` 测试 |
| 交互式 | `terminal.run(cmd, { interactive: true })` | 复用 PTY+tmux 流程，返回 `PTYProcessImpl`，可 `expect/send/sendRaw/interrupt` | 需要逐步等待输出、手动输入、长时间运行 |
| silent | `run(cmd, { silent: true })` | 强制使用 `Bun.spawn`，即便在录制模式下也不写入录制流 | 需要解析 JSON/日志且不希望录制 |

## 2. Pane/会话管理
1. `SharedTerminalState` 维护 `paneCount/currentActivePane/paneOutputs`。  
2. `terminal.create()`（`packages/repterm/src/terminal/terminal.ts`）在录制模式下按“奇数水平，偶数垂直”策略分屏：  
   - 写入 `Ctrl+B` 前缀后发送 `"`（水平）或 `%`（垂直）。  
   - 新 pane index = 旧 `paneCount`，并更新 `currentActivePane`。  
3. `selectPane()` 通过 `Ctrl+B o` 循环切换；如当前 pane 已激活则直接返回。  
4. `waitForText`/`snapshot`：录制模式用 `capture-pane -p -t <session>:0.<pane>` 获取指定 pane；非录制模式直接读取 session buffer。  
5. `close()`：  
   - 录制模式：等待 2s → `Ctrl+B d` detach → `session.kill('SIGTERM')` → `tmux kill-session -t <name>`。  
   - 非录制：直接 `session.kill`。  
6. `terminal.create()` 在非录制模式下返回独立 `Terminal`（各自 `TerminalSession`）。  

## 3. 录制文件
1. CLI 中，ArtifactManager (`packages/repterm/src/runner/artifacts.ts`) 为每个测试创建 `<runDir>/<testId>.cast`。  
2. `packages/repterm/src/recording/recorder.ts` 控制 asciinema 进程：  
   - `start()`：`asciinema rec [--cols N --rows M] --command "<cmd>" <cast> --overwrite`。  
   - `stop()`：`Subprocess.kill('SIGTERM')`。  
   - `checkAsciinemaAvailable()`：`which asciinema`。  
3. 若 CLI 检测缺少依赖（`checkDependencies(true)`) 会打印安装指南并退出。  
4. `.cast` 文件默认写入 `/tmp/repterm/<runId>/`；可通过 `--recording-dir` 覆盖。  

## 4. 调试技巧
1. **输出匹配失败**：  
   - 调整 `waitForText(text, { timeout, stripAnsi })`；录制模式 strip 默认为 true。  
   - 使用 `await terminal.snapshot()` 输出当前 buffer。  
2. **Pane 内容错乱**：确保在多 pane 测试中不要在 shell 内切换 tmux；交由 Repterm 控制。  
3. **录制无文件**：检查 CLI 是否运行在 `--record` 且测试标注 `{ record: true }`；留意 ArtifactManager baseDir。  
4. **命令悬挂**：调用 `PTYProcess.interrupt()`（发送 `Ctrl+C`）或 `terminal.close()`，必要时在 afterEach 中强制清理。  
5. **依赖缺失**：在 CI 中无法安装 asciinema/tmux 时，可避开 `--record` 或跳过包含 `{ record: true }` 的 suite。  

## 5. 示例
- 多终端：`packages/repterm/examples/05-multi-terminal.ts` 展示创建第二个终端与文件通信。  
- 录制演示：`packages/repterm/examples/08-recording-demos.ts`（含 `describe(..., { record: true })` 以及独立录制测试）。  
- 交互式：`packages/repterm/examples/03-interactive-commands.ts` 演示 `interactive: true` 与 `PTYProcess.expect`.  

掌握以上差异后，可在调试时快速定位“输出读取 vs. tmux pane vs. asciinema”哪一层出现问题。

---

## See Also

- [architecture.md](architecture.md) - 系统架构图
- [troubleshooting.md](troubleshooting.md) - 问题排查指南
- [examples-catalog.md](examples-catalog.md) - 示例脚本索引
