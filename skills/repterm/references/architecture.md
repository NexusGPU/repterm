# Repterm architecture

## 1. Layers

```
CLI (cli/index.ts, cli/reporter.ts, cli/plugin.ts)
  -> Runner (runner/loader.ts, filter.ts, runner.ts, scheduler.ts, worker*.ts, artifacts.ts, config.ts)
    -> API (api/test.ts, describe.ts, hooks.ts, expect.ts, steps.ts; plugin/index.ts, withPlugins.ts)
    -> Terminal (terminal/terminal.ts, dollar.ts, session.ts; recording/recorder.ts; terminal/shell-integration.ts)
```

Key dependencies:
- CLI entry calls Loader, Filter, Runner, Scheduler
- Runner calls Hooks, Terminal, Artifacts, Reporter
- Terminal uses Dollar ($), Session, Recorder, ShellIntegration (OSC 133)
- Plugin system feeds into Test API -> Runner (with beforeTest/afterTest/beforeCommand/afterOutput hooks)

## 2. End-to-end flow

1. CLI parses args -> `discoverTests(paths)` -> `loadTestFiles(files)` -> Registry registers suites/tests
2. `filterSuites(allSuites, recordMode)` applies --record filter
3. Single worker: `runAllSuites(...)` / Multi worker: `createScheduler(...).run(...)`
4. Runner notifies Reporter (onTestStart -> onTestResult -> onRunComplete)
5. Runner creates Terminal per test (recording/ptyOnly/promptLineCount)
6. Lifecycle: beforeEach -> test fn -> afterEach

## 3. Terminal mode

> Full details: see `references/terminal-modes.md`

In runTest() (runner/runner.ts):

- `testRecordConfig = test.options.record ?? inheritedSuiteRecord`
- `cliRecordMode = config.record.enabled`
- `shouldRecord = cliRecordMode && testRecordConfig`
- `shouldUsePtyOnly = testRecordConfig && !cliRecordMode`

## 4. API and plugins

- Entry: `packages/repterm/src/index.ts`
- DSL: `test/describe/step/hooks`
- Assertions: expect.extend() for terminal and command matchers
- Plugins:
  - definePlugin(name, setup) — setup returns { methods, context, hooks? }
  - defineConfig({ plugins }) for runtime
  - createTestWithPlugins(config) / describeWithPlugins(config) inject ctx.plugins.*
  - Plugin hooks: beforeTest, afterTest, beforeCommand (transform), afterOutput (transform)
