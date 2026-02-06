# 示例脚本索引（`packages/repterm/examples`）

## 难度说明

| 标记 | 含义 |
| --- | --- |
| ⭐ | 基础：无额外依赖 |
| ⭐⭐ | 中级：含交互/Hooks/多终端 |
| ⭐⭐⭐ | 高级：录制与复杂协同 |

## 示例矩阵

| 难度 | 文件 | 覆盖主题 | 依赖 | 运行命令 |
| --- | --- | --- | --- | --- |
| ⭐ | `01-basic-commands.ts` | `terminal.run`、`CommandResult` 字段、基础断言 | 无 | `bun run repterm packages/repterm/examples/01-basic-commands.ts` |
| ⭐ | `02-command-assertions.ts` | `toSucceed/toFail/toMatch*` 等断言 | 无 | `bun run repterm packages/repterm/examples/02-command-assertions.ts` |
| ⭐⭐ | `03-interactive-commands.ts` | `interactive: true`、`PTYProcess.expect/send` | 无 | `bun run repterm packages/repterm/examples/03-interactive-commands.ts` |
| ⭐⭐ | `04-fixtures-with-hooks.ts` | `beforeEach('fixture')` 懒加载、清理逻辑 | 无 | `bun run repterm packages/repterm/examples/04-fixtures-with-hooks.ts` |
| ⭐⭐ | `05-multi-terminal.ts` | `terminal.create()` 多终端协作 | 无 | `bun run repterm packages/repterm/examples/05-multi-terminal.ts` |
| ⭐ | `06-terminal-assertions.ts` | `expect(terminal)`、`snapshot` | 无 | `bun run repterm packages/repterm/examples/06-terminal-assertions.ts` |
| ⭐⭐ | `07-test-organization.ts` | 嵌套 describe、`test.step` | 无 | `bun run repterm packages/repterm/examples/07-test-organization.ts` |
| ⭐⭐⭐ | `08-recording-demos.ts` | `{ record: true }` + `--record` 录制流程 | asciinema, tmux | `bun run repterm --record packages/repterm/examples/08-recording-demos.ts` |
| ⭐⭐⭐ | `09-webserver-multi-terminal.ts` | 录制模式 + 多 pane + 服务联调 | Python3, curl, asciinema, tmux | `bun run repterm --record packages/repterm/examples/09-webserver-multi-terminal.ts` |
| ⭐⭐ | `11-beforeall-afterall.ts` | `beforeAll/afterAll` 洋葱模型与 context 继承 | 无 | `bun run repterm packages/repterm/examples/11-beforeall-afterall.ts` |

## 学习路径建议

1. 入门：`01` → `02` → `06`
2. 进阶：`03` → `04` → `07` → `11`
3. 录制专项：`08` → `09`

## 快速命令集

```bash
# 无依赖冒烟
bun run repterm packages/repterm/examples/01-basic-commands.ts
bun run repterm packages/repterm/examples/02-command-assertions.ts
bun run repterm packages/repterm/examples/06-terminal-assertions.ts

# 交互与 hooks
bun run repterm packages/repterm/examples/03-interactive-commands.ts
bun run repterm packages/repterm/examples/04-fixtures-with-hooks.ts

# 录制（需 asciinema + tmux）
bun run repterm --record packages/repterm/examples/08-recording-demos.ts
```

## 补充：Kubectl 插件示例

插件示例在 `packages/plugin-kubectl/examples`，建议先跑：

```bash
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

## See Also

- [api-cheatsheet.md](api-cheatsheet.md)
- [common-patterns.md](common-patterns.md)
- [plugin-kubectl.md](plugin-kubectl.md)
