# 示例脚本索引（`packages/repterm/examples`）

## 难度与依赖说明

| 标记 | 含义 |
|------|------|
| ⭐ | 基础 - 无特殊依赖，适合入门 |
| ⭐⭐ | 中级 - 使用高级 API 或需要特定依赖 |
| ⭐⭐⭐ | 高级 - 复杂场景，需要多个依赖 |

## 示例矩阵

| 难度 | 文件 | 覆盖主题 | 依赖 | 运行命令 |
| --- | --- | --- | --- | --- |
| ⭐ | `01-basic-commands.ts` | 基础 `terminal.run`、`CommandResult` 字段、stdout/stderr 断言 | 无 | `bun src/cli/index.ts packages/repterm/examples/01-basic-commands.ts` |
| ⭐ | `02-command-assertions.ts` | 链式断言、否定断言、正则匹配 | 无 | 同上 |
| ⭐⭐ | `03-interactive-commands.ts` | `interactive: true`、`PTYProcess.expect/send/finally` | 无 | `bun src/cli/index.ts packages/repterm/examples/03-interactive-commands.ts` |
| ⭐⭐ | `04-fixtures-with-hooks.ts` | 命名 fixture（`beforeEach('tmpDir')`）、懒加载、清理 | 无 | `bun src/cli/index.ts packages/repterm/examples/04-fixtures-with-hooks.ts` |
| ⭐⭐ | `05-multi-terminal.ts` | `terminal.create()`、pane 间通信 | tmux | `bun src/cli/index.ts packages/repterm/examples/05-multi-terminal.ts` |
| ⭐ | `06-terminal-assertions.ts` | `expect(terminal)` 系列 + `snapshot()` | 无 | `bun src/cli/index.ts packages/repterm/examples/06-terminal-assertions.ts` |
| ⭐⭐ | `07-test-organization.ts` | 嵌套 describe、`test.step`、错误断言 | 无 | `bun src/cli/index.ts packages/repterm/examples/07-test-organization.ts` |
| ⭐⭐⭐ | `08-recording-demos.ts` | `describe(..., { record: true })`、独立录制测试 | asciinema, tmux | `bun src/cli/index.ts --record packages/repterm/examples/08-recording-demos.ts` |
| ⭐⭐⭐ | `09-webserver-multi-terminal.ts` | 录制模式下多 pane + 交互式命令 + `terminal.create()` | Python3, curl, asciinema, tmux | `bun src/cli/index.ts --record packages/repterm/examples/09-webserver-multi-terminal.ts` |
| ⭐⭐ | `11-beforeall-afterall.ts` | Playwright 风格 `beforeAll/afterAll`、上下文传递、多层 describe | 无 | `bun src/cli/index.ts packages/repterm/examples/11-beforeall-afterall.ts` |

## 学习路径

### 入门（⭐ 基础）
1. `01-basic-commands.ts` - 了解基础命令执行和结果断言
2. `02-command-assertions.ts` - 掌握各种断言方式
3. `06-terminal-assertions.ts` - 学习终端状态断言

### 进阶（⭐⭐ 中级）
4. `03-interactive-commands.ts` - 处理交互式命令
5. `04-fixtures-with-hooks.ts` - 使用 Fixtures 管理测试资源
6. `07-test-organization.ts` - 组织复杂测试套件
7. `11-beforeall-afterall.ts` - 理解生命周期钩子

### 高级（⭐⭐⭐ 复杂场景）
8. `05-multi-terminal.ts` - 多终端测试
9. `08-recording-demos.ts` - 录制功能
10. `09-webserver-multi-terminal.ts` - 综合实战

## 快速验证命令

```bash
# 基础功能验证（无需额外依赖）
bun src/cli/index.ts packages/repterm/examples/01-basic-commands.ts
bun src/cli/index.ts packages/repterm/examples/02-command-assertions.ts
bun src/cli/index.ts packages/repterm/examples/06-terminal-assertions.ts

# 中级功能验证
bun src/cli/index.ts packages/repterm/examples/03-interactive-commands.ts
bun src/cli/index.ts packages/repterm/examples/04-fixtures-with-hooks.ts
bun src/cli/index.ts packages/repterm/examples/07-test-organization.ts

# 录制功能验证（需要 asciinema + tmux）
bun src/cli/index.ts --record packages/repterm/examples/08-recording-demos.ts
```

## 使用建议

1. **快速冒烟**：先跑 `01-03`，确保基础 API 工作正常
2. **终端/录制调试**：使用 `05` + `08/09` 观察 tmux pane 与 `.cast` 输出是否符合预期
3. **hooks/fixtures**：`04` + `11` 帮助验证 context 继承链
4. **扩展文档**：可在技能中引用这些脚本作为模板（复制命令、结构、断言）
5. **示例自定义**：如需新增示例，请更新本文件并同步 `examples/README.md`

---

## See Also

- [common-patterns.md](common-patterns.md) - 可直接复制的代码模板
- [api-cheatsheet.md](api-cheatsheet.md) - API 速查表
