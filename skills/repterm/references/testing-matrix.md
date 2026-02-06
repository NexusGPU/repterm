# 单元测试矩阵

> 全量：`bun test packages/repterm/tests/unit`  
> 单文件：`bun test packages/repterm/tests/unit/<file>.test.ts`

## 1. 优先级约定

| 标记 | 含义 | 建议 |
| --- | --- | --- |
| 🔴 P0 | 核心回归 | 每次改动都优先跑 |
| 🟡 P1 | 模块回归 | 改到对应模块时跑 |
| 🟢 P2 | 扩展/边界 | 完整回归时跑 |

## 2. 文件矩阵（按当前仓库）

| 优先级 | 文件 | 主要覆盖 |
| --- | --- | --- |
| 🔴 P0 | `terminal.test.ts` | `terminal.run/create/close`、模式切换、输出行为 |
| 🔴 P0 | `expect.test.ts` | 命令结果/终端 matcher 行为 |
| 🔴 P0 | `hooks.test.ts` | fixture 懒加载、before/after 生命周期 |
| 🔴 P0 | `runner-lifecycle.test.ts` | 洋葱模型、suite/context 继承 |
| 🟡 P1 | `config.test.ts` | 配置合并与边界值 |
| 🟡 P1 | `loader.test.ts` | 测试发现、setup 加载、过滤助手 |
| 🟡 P1 | `reporter.test.ts` | 流式输出与汇总展示 |
| 🟡 P1 | `artifacts.test.ts` | run 目录与 cast/log/snapshot 路径 |
| 🟡 P1 | `session.test.ts` | PTY session 生命周期 |
| 🟡 P1 | `recorder.test.ts` | asciinema recorder 生命周期 |
| 🟡 P1 | `registry.test.ts` | suite 注册栈、文件级 suite |
| 🟡 P1 | `describe.test.ts` | describe 嵌套与选项继承 |
| 🟢 P2 | `index.test.ts` | 入口导出完整性 |
| 🟢 P2 | `steps.test.ts` | `test.step` 记录与清理 |
| 🟢 P2 | `describe-steps.test.ts` | describe + step 组合行为 |
| 🟢 P2 | `runner-streaming.test.ts` | `onResult` 流式回调 |
| 🟢 P2 | `parallel-scheduler.test.ts` | 并行调度边界 |
| 🟢 P2 | `scheduler.test.ts` | scheduler 聚合路径 |
| 🟢 P2 | `dependencies.test.ts` | 录制依赖检测 |
| 🟢 P2 | `timing.test.ts` | timer/sleep/formatDuration |
| 🟢 P2 | `output-capture-formula.test.ts` | 录制输出截取公式 |

## 3. 场景化最小回归

### 3.1 终端与录制相关

```bash
bun test packages/repterm/tests/unit/terminal.test.ts \
         packages/repterm/tests/unit/session.test.ts \
         packages/repterm/tests/unit/recorder.test.ts \
         packages/repterm/tests/unit/output-capture-formula.test.ts
```

### 3.2 Runner / CLI / Hooks 相关

```bash
bun test packages/repterm/tests/unit/runner-lifecycle.test.ts \
         packages/repterm/tests/unit/hooks.test.ts \
         packages/repterm/tests/unit/loader.test.ts \
         packages/repterm/tests/unit/reporter.test.ts \
         packages/repterm/tests/unit/artifacts.test.ts
```

### 3.3 DSL / 断言 / 导出相关

```bash
bun test packages/repterm/tests/unit/expect.test.ts \
         packages/repterm/tests/unit/describe.test.ts \
         packages/repterm/tests/unit/steps.test.ts \
         packages/repterm/tests/unit/index.test.ts
```

## 4. 完整回归建议

```bash
bun test packages/repterm/tests/unit
```

若改动涉及 `plugin-kubectl` 文档或类型，建议额外跑一次示例冒烟：

```bash
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [troubleshooting.md](troubleshooting.md)
