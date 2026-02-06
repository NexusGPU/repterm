# Repterm 架构速览

## 1. 分层结构

```mermaid
graph TB
    subgraph CLI["CLI"]
        CLIEntry["src/cli/index.ts"]
        Reporter["src/cli/reporter.ts"]
    end

    subgraph Runner["Runner"]
        Loader["runner/loader.ts"]
        Filter["runner/filter.ts"]
        RunnerCore["runner/runner.ts"]
        Scheduler["runner/scheduler.ts"]
        Worker["runner/worker*.ts"]
        Artifacts["runner/artifacts.ts"]
    end

    subgraph API["API"]
        TestAPI["api/test.ts + describe.ts"]
        Hooks["api/hooks.ts"]
        Expect["api/expect.ts"]
        Steps["api/steps.ts"]
        Plugin["plugin/index.ts + withPlugins.ts"]
    end

    subgraph Terminal["Terminal"]
        TerminalImpl["terminal/terminal.ts"]
        Session["terminal/session.ts"]
        Recorder["recording/recorder.ts"]
    end

    CLIEntry --> Loader
    CLIEntry --> Filter
    CLIEntry --> RunnerCore
    CLIEntry --> Scheduler
    RunnerCore --> Hooks
    RunnerCore --> TerminalImpl
    RunnerCore --> Artifacts
    Scheduler --> Worker
    Worker --> RunnerCore
    RunnerCore --> Reporter
    TestAPI -.-> RunnerCore
    Plugin -.-> TestAPI
    TerminalImpl --> Session
    TerminalImpl --> Recorder
```

## 2. 端到端执行链路

```mermaid
sequenceDiagram
    participant CLI
    participant Loader
    participant Registry
    participant Filter
    participant Runner
    participant Terminal
    participant Reporter

    CLI->>Loader: discoverTests(paths)
    CLI->>Loader: loadTestFiles(files)
    Loader-->>Registry: register suites/tests
    CLI->>Filter: filterSuites(allSuites, recordMode)

    alt workers == 1
      CLI->>Runner: runAllSuites(...)
    else workers > 1
      CLI->>Runner: createScheduler(...).run(...)
    end

    Runner->>Reporter: onTestStart
    Runner->>Terminal: createTerminal({ recording, ptyOnly })
    Runner->>Runner: beforeEach -> test -> afterEach
    Runner->>Reporter: onTestResult
    Runner->>Reporter: onRunComplete
```

## 3. 终端模式判定（当前实现）

在 `runTest()`（`runner/runner.ts`）中：

- `testRecordConfig = test.options.record ?? inheritedSuiteRecord`
- `cliRecordMode = config.record.enabled`
- `shouldRecord = cliRecordMode && testRecordConfig`
- `shouldUsePtyOnly = testRecordConfig && !cliRecordMode`

对应 `terminal.run()` 的执行路径：

| 场景 | 执行方式 | 结果特征 |
| --- | --- | --- |
| 默认（非交互） | `Bun.spawn` | `code` 可可靠断言 |
| PTY-only | PTY | 通常 `code = -1` |
| Recording | `asciinema + tmux + PTY` | 生成 `.cast` |
| Interactive | PTY | 支持 `expect/send/interrupt` |
| `silent: true` | 强制 `Bun.spawn` | 适合 JSON/退出码校验 |

## 4. API 与插件关系

- 公共入口：`packages/repterm/src/index.ts`
- DSL：`test/describe/step/hooks`
- 断言：`expect.extend(...)` 内置终端与命令结果 matcher
- 插件系统：
  - `definePlugin(name, setup)` 定义插件
  - `defineConfig({ plugins })` 创建 runtime
  - `createTestWithPlugins(config)` 自动注入 `ctx.plugins.*`

## 5. Kubectl 插件接入点

- 核心：`packages/plugin-kubectl/src/index.ts`
- Matcher：`packages/plugin-kubectl/src/matchers.ts`
- 示例：`packages/plugin-kubectl/examples/*.ts`

插件方法涵盖资源 CRUD、wait、rollout、watch、port-forward、events/nodes/cp，并扩展 `toHaveReadyReplicas`、`toHaveStatusField` 等 matcher。

## 6. 代码导航建议

- CLI/执行流：`packages/repterm/src/cli/index.ts`
- 过滤逻辑：`packages/repterm/src/runner/filter.ts`
- 生命周期：`packages/repterm/src/runner/runner.ts`
- 终端实现：`packages/repterm/src/terminal/terminal.ts`
- 插件系统：`packages/repterm/src/plugin/index.ts`
- 单测入口：`packages/repterm/tests/unit/*.test.ts`

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [terminal-modes.md](terminal-modes.md)
- [api-cheatsheet.md](api-cheatsheet.md)
