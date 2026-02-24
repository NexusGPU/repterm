# Runner / Scheduler / Reporter pipeline

## 1. CLI flow

See `packages/repterm/src/cli/index.ts`:

1. Parse args, load config (record/workers/timeout/verbose/prompt-lines/slow-threshold/recording-dir).
2. discoverTests(paths) finds test files (`.ts`/`.js`). `setup.ts`/`setup.js` in a directory is auto-loaded before that directory's tests.
3. loadTestFiles(files) registers and gets registry.getRootSuites().
4. filterSuites(allSuites, recordEnabled) filters.
5. By workers:
   - `workers === 1`: `runAllSuites(...)`
   - `workers > 1`: `createScheduler(...).run(...)`
6. Reporter streams output and summary; exit 1 on failure.

## 2. Filter and recording

### 2.1 Filter (runner/filter.ts)

- recordMode=false: return all tests (including record: true).
- recordMode=true: only record: true tests.

### 2.2 Per-test terminal mode (runner/runner.ts)

- `testRecordConfig = test.options.record ?? inheritedSuiteRecord`.
- `cliRecordMode = config.record.enabled`.
- `shouldRecord = cliRecordMode && testRecordConfig`.
- `shouldUsePtyOnly = testRecordConfig && !cliRecordMode`.

Same { record: true } test can run as PTY-only or full recording depending on CLI.

## 3. Single-worker execution

runSuite (onion):

1. `beforeAll`
2. Current suite tests
3. Child suites recursively
4. afterAll (in finally)

`runTest`:

1. onTestStart notifies Reporter first.
2. Build terminal (recording / ptyOnly / promptLineCount).
3. Lazy-load fixtures by test params: runBeforeEachFor.
4. Promise.race(testFn, timeout) runs the test.
5. Produce RunResult (with recordingPath).
6. finally: clearSteps, runAfterEachFor, terminal.close.

## 4. Scheduler (multi-worker)

See scheduler.ts / worker.ts / worker-runner.ts:

1. Main creates worker processes, waits for ready.
2. Dispatch suites to idle workers (IPC).
3. Worker runs runSuite, streams results back.
4. Main aggregates and recycles workers.

## 5. Reporter and artifacts

- Reporter: `packages/repterm/src/cli/reporter.ts`
  - Options: `{ verbose?: boolean, colors?: boolean (default true), slowThreshold?: number (default 50ms) }`
  - onTestStart prints suite hierarchy.
  - onTestResult prints pass/fail (shows duration if > slowThreshold).
  - onRunComplete prints summary and failures (stack traces only if verbose).
- Artifact: `packages/repterm/src/runner/artifacts.ts`
  - ArtifactManager with baseDir (default /tmp/repterm), runId (timestamp-random).
  - Provides .cast path for recording tests.
  - recordingPath is passed to Reporter.

## 6. Config defaults

```
timeouts.suiteMs: 1500000  (15 min)
timeouts.testMs:  300000   (5 min)
RunOptions.timeout: 30000  (30 sec per command)
parallel.workers: 1
typingSpeed: 80            (ms/char in recording)
recording-dir: /tmp/repterm
```

## 6. Key checks

1. 0 tests with --record: ensure { record: true }.
2. Fixture not run: check test params request that fixture.
3. Parallel serialization: avoid non-cloneable objects in suite.
4. No recording file: ensure shouldRecord (CLI and test both true).
