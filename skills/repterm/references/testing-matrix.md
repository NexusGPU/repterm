# Unit test matrix

> Full run: `bun test packages/repterm/tests/unit`
> Single file: `bun test packages/repterm/tests/unit/<file>.test.ts`

## 1. Priority

| Level | Meaning | When to run |
| --- | --- | --- |
| 🔴 P0 | Core regression | Run first on every change |
| 🟡 P1 | Module regression | When touching that module |
| 🟢 P2 | Edge/extension | Full regression |

## 2. File matrix

| Priority | File | Coverage |
| --- | --- | --- |
| 🔴 P0 | `terminal.test.ts` | `terminal.run/create/close`, mode switch, output |
| 🔴 P0 | `expect.test.ts` | command/terminal matchers |
| 🔴 P0 | `hooks.test.ts` | fixture lazy load, before/after lifecycle |
| 🔴 P0 | `runner-lifecycle.test.ts` | onion model, suite/context inheritance |
| 🟡 P1 | `config.test.ts` | config merge and boundaries |
| 🟡 P1 | `loader.test.ts` | test discovery, setup load, filter helpers |
| 🟡 P1 | `reporter.test.ts` | streaming output and summary |
| 🟡 P1 | `artifacts.test.ts` | run dir and cast/log/snapshot paths |
| 🟡 P1 | `session.test.ts` | PTY session lifecycle |
| 🟡 P1 | `recorder.test.ts` | asciinema recorder lifecycle |
| 🟡 P1 | `registry.test.ts` | suite registration, file-level suite |
| 🟡 P1 | `describe.test.ts` | describe nesting and option inheritance |
| 🟢 P2 | `index.test.ts` | entry exports |
| 🟢 P2 | `steps.test.ts` | test.step record and cleanup |
| 🟢 P2 | `describe-steps.test.ts` | describe + step behavior |
| 🟢 P2 | `runner-streaming.test.ts` | onResult streaming |
| 🟢 P2 | `parallel-scheduler.test.ts` | parallel scheduler edge |
| 🟢 P2 | `scheduler.test.ts` | scheduler aggregation |
| 🟢 P2 | `dependencies.test.ts` | recording dependency check |
| 🟢 P2 | `timing.test.ts` | timer/sleep/formatDuration |
| 🟢 P2 | `output-capture-formula.test.ts` | recording output capture formula |

## 3. Minimal regression sets

### 3.1 Terminal and recording

```bash
bun test packages/repterm/tests/unit/terminal.test.ts \
         packages/repterm/tests/unit/session.test.ts \
         packages/repterm/tests/unit/recorder.test.ts \
         packages/repterm/tests/unit/output-capture-formula.test.ts
```

### 3.2 Runner / CLI / Hooks

```bash
bun test packages/repterm/tests/unit/runner-lifecycle.test.ts \
         packages/repterm/tests/unit/hooks.test.ts \
         packages/repterm/tests/unit/loader.test.ts \
         packages/repterm/tests/unit/reporter.test.ts \
         packages/repterm/tests/unit/artifacts.test.ts
```

### 3.3 DSL / Assertions / Exports

```bash
bun test packages/repterm/tests/unit/expect.test.ts \
         packages/repterm/tests/unit/describe.test.ts \
         packages/repterm/tests/unit/steps.test.ts \
         packages/repterm/tests/unit/index.test.ts
```

## 4. Full regression

```bash
bun test packages/repterm/tests/unit
```

If you changed plugin-kubectl docs or types, run plugin example smoke:

```bash
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [troubleshooting.md](troubleshooting.md)
