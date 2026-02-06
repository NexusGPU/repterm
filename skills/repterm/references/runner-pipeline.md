# Runner / Scheduler / Reporter 流程

## 1. CLI 主流程

对应 `packages/repterm/src/cli/index.ts`：

1. 解析参数，加载 config（含 `record/workers/timeout/prompt-lines`）。
2. `discoverTests(paths)` 找到测试文件。
3. `loadTestFiles(files)` 执行注册，取 `registry.getRootSuites()`。
4. `filterSuites(allSuites, recordEnabled)` 过滤测试。
5. 根据 `workers`：
   - `workers === 1`：`runAllSuites(...)`
   - `workers > 1`：`createScheduler(...).run(...)`
6. Reporter 流式输出并汇总，失败则退出码 1。

## 2. 过滤与录制判定

### 2.1 过滤（`runner/filter.ts`）

- `recordMode=false`：返回全部测试（含 `record: true`）。
- `recordMode=true`：仅保留 `record: true` 测试。

### 2.2 每个测试的终端模式（`runner/runner.ts`）

- `testRecordConfig = test.options.record ?? inheritedSuiteRecord`。
- `cliRecordMode = config.record.enabled`。
- `shouldRecord = cliRecordMode && testRecordConfig`。
- `shouldUsePtyOnly = testRecordConfig && !cliRecordMode`。

因此同一份 `{ record: true }` 测试，在不同 CLI 参数下会走 PTY-only 或完整录制两种路径。

## 3. 单 worker 执行细节

`runSuite`（洋葱模型）：

1. `beforeAll`
2. 当前 suite 测试
3. 子 suite 递归
4. `afterAll`（finally 中保证执行）

`runTest`：

1. `onTestStart` 先发给 Reporter。
2. 构建 terminal（recording / ptyOnly / promptLineCount）。
3. 按测试函数参数懒加载 fixture：`runBeforeEachFor`。
4. `Promise.race(testFn, timeout)` 执行测试。
5. 生成 `RunResult`（含 `recordingPath`）。
6. finally：`clearSteps` → `runAfterEachFor` → `terminal.close`。

## 4. Scheduler（多 worker）

对应 `packages/repterm/src/runner/scheduler.ts` / `worker.ts` / `worker-runner.ts`：

1. 主进程创建 worker 子进程并等待 `ready`。
2. 分发 suite 到空闲 worker（IPC 消息）。
3. worker 内调用 `runSuite`，把每条结果实时回传。
4. 主进程聚合结果并在完成后回收 worker。

## 5. Reporter 与产物

- Reporter：`packages/repterm/src/cli/reporter.ts`
  - `onTestStart` 打印 suite 层级。
  - `onTestResult` 实时打印通过/失败。
  - `onRunComplete` 输出总览与失败详情。
- Artifact：`packages/repterm/src/runner/artifacts.ts`
  - 录制测试时提供 `.cast` 路径。
  - `recordingPath` 会回传到 Reporter。

## 6. 关键排查点

1. `--record` 下 0 测试：确认是否有 `{ record: true }`。
2. fixture 未运行：确认测试参数是否请求该 fixture 名。
3. 并行报序列化问题：避免 suite 结构混入不可克隆对象。
4. 录制无文件：确认 `shouldRecord` 条件满足（CLI + test 都为 true）。

## See Also

- [terminal-modes.md](terminal-modes.md)
- [troubleshooting.md](troubleshooting.md)
- [testing-matrix.md](testing-matrix.md)
