# Runner / Scheduler / Reporter 工作流

## 1. 执行顺序（单 worker）
1. CLI 调用 `runAllSuites(suites, options)`（`packages/repterm/src/runner/runner.ts`）。  
2. `runSuite(suite)`：
   - `hooksRegistry.runBeforeAllFor(suite, inheritedContext)`：返回合并 context。  
   - `runTestsInSuite` 顺序执行当前 suite 的 `testCase`。  
   - 对 `suite.suites` 递归，继承当前 context。  
   - `hooksRegistry.runAfterAllFor(suite, suiteContext)`，无论测试是否报错都会执行。  
3. `runTest(testCase)`：  
   - 构建 `suitePath`（父 suite 名称链）。  
   - 通过 `ArtifactManager` 判断是否需要录制（`testCase.options.record` > `suite.options.record` > config）。  
   - 创建 `terminal`（记录 `recordingPath`）。  
   - 根据 test 函数参数解析所需 fixture 名称，调用 `hooksRegistry.runBeforeEachFor`，只执行请求的 fixture。  
   - `Promise.race` 将 `testCase.fn(context)` 与 `setTimeout` 包装的超时竞赛。  
   - 记录 `RunResult`（`status/duration/error/recordingPath`）。  
   - finally：`clearSteps()`、`hooksRegistry.runAfterEachFor`（仅已执行 fixture）、`terminal.close()`。

## 2. Hooks/FIXTURES
- `packages/repterm/src/api/hooks.ts`：  
  - beforeEach/afterEach 基于 `name` 与 `suiteId` 作用域，只有测试参数包含相应 key 时才执行。  
  - beforeAll/afterAll 需在 `describe()` 内调用，否则抛出错误。  
  - `hooksRegistry.clear()` 在测试初始化时使用，防止跨 suite 泄露。  
- 单测 `packages/repterm/tests/unit/hooks.test.ts` 验证：  
  - Fixtures 只在请求时运行。  
  - beforeAll 返回值合并到 context，可被子 suite 继承。  
  - afterAll 逆序执行。  
  - 嵌套 suite 的隔离性（parent 不影响 child，除非 child 继承 parent context）。

## 3. Scheduler 多 worker
1. CLI 判断 `config.parallel.workers > 1` 时启用 `createScheduler`。  
2. Scheduler 初始化 worker：  
   - `createWorker`（`packages/repterm/src/runner/worker.ts`）fork `worker-runner.js`，建立 IPC。  
   - Worker `start()` 后向主进程发送 `ready`。  
3. 分发：Scheduler 维护 `pendingSuites`、`activeSuites`，选择闲置 worker，发送 `{ type: 'run', data: { suite, config, artifactBaseDir } }`。  
4. Worker 侧 `worker-runner.ts`：  
   - 为每个 run 建立 `ArtifactManager`，调用 `runSuite`。  
   - 对每个结果触发 `process.send({ type: 'result', data })`。  
   - 全部完成后发 `done`，异常发 `error`。  
5. 主进程聚合 `results`，在 `activeSuites` 清零后停止所有 worker。

## 4. Reporter 与日志
- `Reporter` (`packages/repterm/src/cli/reporter.ts`)：  
  - `onTestStart`：根据 `suitePath` 打印层级标题（使用 cyan 颜色）。  
  - `onTestResult`：立刻输出测试状态符号（✔/✖/…）。  
  - `onRunComplete`：汇总总数，列出失败详情（包含 suitePath、错误信息、期望/实际）。  
  - `slowThreshold`：对超过阈值的测试显示耗时。  
- `packages/repterm/tests/unit/reporter.test.ts` 覆盖：通过 `vi.spyOn(console.log)` 验证输出包含 suite 名称、录制路径、跳过/失败信息。

## 5. Artefact & Recording 协作
1. ArtifactManager (`packages/repterm/src/runner/artifacts.ts`)：  
   - `generateRunId()` 用于 CLI run；scheduler worker 会使用 `worker-<id>-<rand>`。  
   - `getCastPath(testId)` 提供 `.cast` 路径；`getLogPath`/`getSnapshotPath` 类似。  
   - 提供 `createArtifactManagerWithRunId` 以支持 tsx 重新加载。  
2. Runner 在 `shouldRecord` 为 true 时将路径注入 terminal，Reporter 会在结果中附加 `recordingPath`。  
3. 若 `record: enabled` 但没有 `{ record: true }` 测试，CLI 会提示“Use --record to run them”并退出，防止空跑。

## 6. 排错指引
- **before/after 顺序错乱**：对照 `runner-lifecycle.test.ts` 的 `executionOrder` 断言，检查 hooks 注册位置。  
- **Fixture 未执行**：确认测试函数参数命名与 `beforeEach('name')` 一致。  
- **scheduler 报错**：  
  - 确认 `config.parallel.workers` >= 2；  
  - 在 worker 中使用的 suite 必须可序列化（不要存放非 JSON 对象）。  
  - 检查 `worker.on('error')` 日志（CLI 会打印 `Worker n error`）。  
- **Reporter 输出不同步**：确保在自定义 reporter 中调用 `onTestStart`，否则 suite 标题不会按层级打印。  
- **录制路径缺失**：确认 `artifactManager.init()` 在 CLI 启动时已调用，以及 `recording-path` 配置正确。

---

## See Also

- [architecture.md](architecture.md) - 系统架构图
- [testing-matrix.md](testing-matrix.md) - 单元测试矩阵
- [troubleshooting.md](troubleshooting.md) - 问题排查指南
