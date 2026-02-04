# 单元测试矩阵

> 运行全部：`bun test packages/repterm/tests`  
> 运行单个文件：`bun test packages/repterm/tests/unit/<file>.test.ts`

## 优先级说明

| 标记 | 含义 | 运行时机 |
|------|------|----------|
| 🔴 P0 | 核心功能 | 每次提交必须通过 |
| 🟡 P1 | 重要功能 | 相关模块修改时运行 |
| 🟢 P2 | 辅助功能 | 完整测试时运行 |

## 测试文件矩阵

| 优先级 | 测试文件 | 覆盖模块/要点 | 常见触发场景 |
| --- | --- | --- | --- |
| 🔴 P0 | `terminal.test.ts` | `Terminal` run/CommandResult、pane 计数、close | 终端执行逻辑变动 |
| 🔴 P0 | `expect.test.ts` | `TerminalExpect` / `CommandResultExpect` / `AssertionError` | 添加新 matcher 或修改 expect 输出 |
| 🔴 P0 | `runner-lifecycle.test.ts` | `runSuite` 洋葱执行顺序、context 传递 | beforeAll/afterAll 行为修改 |
| 🔴 P0 | `hooks.test.ts` | hooksRegistry 各阶段（lazy fixture、beforeAll/afterAll 继承） | 变更 fixture 策略或 onion 逻辑 |
| 🟡 P1 | `config.test.ts` | `loadConfig/getDefaultConfig`，含边界验证（超时、workers） | 修改默认超时/并行策略或 CLI 配置 |
| 🟡 P1 | `loader.test.ts` | `discoverTests/isTestFile/filterSuites/filterTests` | 自定义测试搜索模式、目录支持 |
| 🟡 P1 | `recorder.test.ts` | `Recorder` 生命周期、asciinema 检查 | 录制流程或 recorder API 改动 |
| 🟡 P1 | `session.test.ts` | `TerminalSession` start/write/resize/kill | 变更底层 PTY 实现 |
| 🟡 P1 | `registry.test.ts` | TestRegistry：suite stack、文件级 suite、clear/reset | 改写注册流程 |
| 🟡 P1 | `describe.test.ts` | `describe()` 嵌套 suite、ID 管理、默认 suite 重置 | 修改 describe/registry 行为 |
| 🟡 P1 | `reporter.test.ts` | Reporter 输出、summary、recording path 显示 | 调整 reporter 样式或新增字段 |
| 🟡 P1 | `artifacts.test.ts` | `ArtifactManager` run 目录、cast/log/snapshot 路径、`ensureDir` | 调整 artifacts 结构或新增 artifact 类型 |
| 🟢 P2 | `index.test.ts` | `src/index.ts` 导出完整性、`test.step/describe` 挂载 | 增删公共导出 |
| 🟢 P2 | `dependencies.test.ts` | `checkCommand/checkDependencies` 行为 | 录制依赖检测报错、跨平台命令支持 |
| 🟢 P2 | `steps.test.ts` | `step/getSteps/clearSteps` | step API 行为/错误记录调整 |
| 🟢 P2 | `describe-steps.test.ts` | describe/step 基础示例（虚拟数据） | 初次验证 DSL 输出或示例文档 |
| 🟢 P2 | `runner-streaming.test.ts` | `runSuite` `onResult` 流式回调 | 需要确保 streaming 回调时序 |
| 🟢 P2 | `parallel-scheduler.test.ts` | Scheduler 构造与单 worker 错误 | 并行调度入口改动 |
| 🟢 P2 | `scheduler.test.ts` | Scheduler 分配/聚合占位测试（后续真实实现可扩展） | 更新 scheduler 算法时同步 |
| 🟢 P2 | `timing.test.ts` | `Timer/measure/formatDuration/sleep` | timing util 改动 |

## 快速冒烟命令

```bash
# P0 核心测试（约 10s）
bun test packages/repterm/tests/unit/terminal.test.ts \
         packages/repterm/tests/unit/expect.test.ts \
         packages/repterm/tests/unit/runner-lifecycle.test.ts \
         packages/repterm/tests/unit/hooks.test.ts

# P0 + P1 测试（约 30s）
bun test packages/repterm/tests/unit/{terminal,expect,runner-lifecycle,hooks,config,loader,recorder,session}.test.ts
```

## 场景化运行建议

### 终端/录制相关改动
```bash
bun test packages/repterm/tests/unit/terminal.test.ts \
         packages/repterm/tests/unit/recorder.test.ts \
         packages/repterm/tests/unit/session.test.ts \
         packages/repterm/tests/unit/runner-lifecycle.test.ts
```

### 插件/DSL 改动
```bash
bun test packages/repterm/tests/unit/expect.test.ts \
         packages/repterm/tests/unit/hooks.test.ts \
         packages/repterm/tests/unit/registry.test.ts \
         packages/repterm/tests/unit/index.test.ts
```

### CLI/Runner 改动
```bash
bun test packages/repterm/tests/unit/config.test.ts \
         packages/repterm/tests/unit/loader.test.ts \
         packages/repterm/tests/unit/reporter.test.ts \
         packages/repterm/tests/unit/artifacts.test.ts
```

---

## See Also

- [runner-pipeline.md](runner-pipeline.md) - Runner 执行流程详解
- [troubleshooting.md](troubleshooting.md) - 测试失败排查指南
