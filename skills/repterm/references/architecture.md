# Repterm architecture

## 1. Layers

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
        DollarFn["terminal/dollar.ts"]
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
    TerminalImpl --> DollarFn
    TerminalImpl --> Session
    TerminalImpl --> Recorder
```

## 2. End-to-end flow

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

## 3. Terminal mode (current)

In runTest() (runner/runner.ts):

- `testRecordConfig = test.options.record ?? inheritedSuiteRecord`
- `cliRecordMode = config.record.enabled`
- `shouldRecord = cliRecordMode && testRecordConfig`
- `shouldUsePtyOnly = testRecordConfig && !cliRecordMode`

terminal.$\`cmd\` / terminal.run() paths:

| Scenario | Execution | Result |
| --- | --- | --- |
| Default (non-interactive) | Bun.spawn | reliable code |
| PTY-only | PTY | code often -1 |
| Recording | asciinema + tmux + PTY | produces .cast |
| Interactive | PTY | expect/send/interrupt |
| silent: true | Bun.spawn | for JSON/exit code |

## 4. API and plugins

- Entry: `packages/repterm/src/index.ts`
- DSL: `test/describe/step/hooks`
- Assertions: expect.extend() for terminal and command matchers
- Plugins:
  - definePlugin(name, setup)
  - defineConfig({ plugins }) for runtime
  - createTestWithPlugins(config) injects ctx.plugins.*

## 5. Kubectl plugin

- Core: `packages/plugin-kubectl/src/index.ts`
- Matchers: `packages/plugin-kubectl/src/matchers.ts`
- Examples: `packages/plugin-kubectl/examples/*.ts`

Plugin: CRUD, wait, rollout, watch, port-forward, events/nodes/cp; matchers toHaveReadyReplicas, toHaveStatusField, etc.

## 6. Code navigation

- CLI/flow: `packages/repterm/src/cli/index.ts`
- Filter: `packages/repterm/src/runner/filter.ts`
- Lifecycle: `packages/repterm/src/runner/runner.ts`
- Terminal: `packages/repterm/src/terminal/terminal.ts`
- Plugins: `packages/repterm/src/plugin/index.ts`
- Unit tests: `packages/repterm/tests/unit/*.test.ts`

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [terminal-modes.md](terminal-modes.md)
- [api-cheatsheet.md](api-cheatsheet.md)
