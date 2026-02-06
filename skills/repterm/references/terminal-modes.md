# 终端模式与录制模式

## 1. 四种执行路径

| 模式 | 触发条件 | 底层执行 | 关键特征 |
| --- | --- | --- | --- |
| Spawn（默认） | `terminal.run()` 且非 `interactive` 且非 PTY | `Bun.spawn` | `code` 精确、`stdout/stderr` 分离 |
| PTY-only | 测试标记 `{ record: true }` 且 CLI 未带 `--record` | PTY | 无 `.cast`，`code` 通常为 `-1` |
| Recording | CLI `--record` + 测试标记 `{ record: true }` | `asciinema + tmux + PTY` | 生成 `.cast`，打字效果与 pane 录制 |
| Interactive | `terminal.run(cmd, { interactive: true })` | PTY | 可 `expect/send/sendRaw/interrupt` |

补充：`silent: true` 会强制走 `Bun.spawn`（即使当前在 PTY/录制上下文）。

## 2. `--record` 的真实过滤语义

基于 `packages/repterm/src/runner/filter.ts` 当前实现：

1. **不带 `--record`**：运行所有测试（包含 `{ record: true }`）。
2. **带 `--record`**：只运行 `{ record: true }` 测试。

> 注意：CLI help 文本里 “Without --record: Runs tests NOT marked ...” 与实现不一致，以 `filter.ts` 为准。

## 3. `CommandResult` 与断言策略

- `CommandResult` 字段：`code/stdout/stderr/output/duration/command/successful`。
- Spawn 模式下：`code` 可直接断言。
- PTY / Recording / Interactive 路径：`code` 常为 `-1`，优先断言输出文本。
- 需要可靠退出码或干净 JSON：使用 `terminal.run(cmd, { silent: true })`。

## 4. 多终端与 pane 行为

1. `terminal.create()` 在录制模式下通过 tmux split 创建新 pane。
2. pane 输出由内部 `SharedTerminalState` 管理，API 层没有公开 `selectPane(...)`。
3. 非录制模式下，`terminal.create()` 返回独立终端会话，不共享 pane。

## 5. Prompt 行数与输出截取

- CLI 支持 `--prompt-lines <n>`（对应 `config.terminal.promptLineCount`）。
- 默认 `0`：框架自动检测 prompt 占用行数。
- 录制模式下输出捕获依赖 prompt 行数，异常时可手动指定稳定值。

## 6. 常用调试手法

```ts
const result = await terminal.run('some command');
console.log(result.code, result.stdout, result.stderr);

await terminal.waitForText('ready', { timeout: 10_000, stripAnsi: true });
console.log(await terminal.snapshot());

const json = await terminal.run('kubectl get pod x -o json', { silent: true });
console.log(json.stdout);
```

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [troubleshooting.md](troubleshooting.md)
