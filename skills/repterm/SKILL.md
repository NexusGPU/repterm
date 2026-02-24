---
name: repterm
description: >-
  Repterm is a terminal-based test framework built on Bun with a test DSL,
  recording via asciinema/tmux, parallel execution, and a plugin system.
  Use this skill when writing, debugging, or extending repterm tests, runner/scheduler
  internals, recording workflows, or plugin APIs (including @nexusgpu/repterm-plugin-kubectl)
  in the packages/repterm monorepo.
---

# Quick start

## Commands

| Task | Command |
|------|------|
| Install dependencies | `bun install` |
| Run all unit tests | `bun test packages/repterm/tests/unit` |
| Run core CLI | `bun run packages/repterm/src/cli/index.ts <tests-or-dirs>` |
| Recording | `bun run repterm --record <tests-or-dirs>` |
| Parallel run | `bun run repterm --workers 4 <tests-or-dirs>` |
| Verbose (stack traces) | `bun run repterm --verbose <tests-or-dirs>` |
| Kubectl no-cluster example | `bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts` |

### CLI flags

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--record` | `-r` | false | Run only `{ record: true }` tests with full recording |
| `--workers` | `-w` | 1 | Parallel worker count |
| `--timeout` | `-t` | 300000 | Test timeout (ms) |
| `--verbose` | `-v` | false | Show stack traces and detailed output |
| `--prompt-lines` | `-p` | auto-detect | Override prompt line count (0 = auto) |
| `--slow-threshold` | — | 50 | Show duration for tests exceeding this (ms) |
| `--recording-dir` | — | /tmp/repterm | Directory for recording artifacts |

## Critical rules (always apply)

1. `$\`cmd\`` is the recommended command API. `terminal.run()` is legacy.
2. Both return PTYProcess (PromiseLike); await yields CommandResult with code/stdout/stderr/output/duration/command/successful.
3. PTY/recording mode: exit code is often -1. Assert output, not code. Use `$({ silent: true })\`cmd\`` for reliable exit code or clean JSON.
4. `--record` filter: without flag = run all tests; with flag = only `{ record: true }` tests.
5. Recording requires asciinema + tmux installed. macOS: `brew install asciinema tmux`. Linux: `apt-get install asciinema tmux`.
6. `watch: true` processes MUST be interrupted: `await watch.interrupt()`. Otherwise tests hang.
7. Interactive commands: use `$({ interactive: true })\`cmd\`` then `proc.expect()` / `proc.send()` / `proc.wait()`.
8. Shell integration (OSC 133) provides three-layer prompt detection: OSC 133 > sentinel > regex. Override per-command with `$({ promptDetection: 'none' })\`long-running-cmd\``.
9. Directory-level `setup.ts`/`setup.js` files are auto-loaded before tests in that directory.

## Code navigation

- Core: `packages/repterm/src`
- Shell integration: `packages/repterm/src/terminal/shell-integration.ts`
- Unit tests: `packages/repterm/tests/unit`
- Examples: `packages/repterm/examples`
- Kubectl plugin: `packages/plugin-kubectl/src`
- Kubectl examples: `packages/plugin-kubectl/examples`

## Workflows

### Write a new test

1. Read `references/api-cheatsheet.md` for DSL and assertion API.
2. Follow the closest pattern in `references/common-patterns.md`.
3. Place the test in `packages/repterm/tests/unit/` or the appropriate examples directory.
4. Verify: `bun test packages/repterm/tests/unit/<new-test>.test.ts`

### Debug a failing test

1. Read `references/troubleshooting.md` for symptom lookup.
2. Add debug output: `console.log(result.code, result.stdout, result.stderr)` and `console.log(await terminal.snapshot())`.
3. Check if the test uses PTY/recording (exit code -1 is expected — assert output instead).
4. Verify fix: re-run the specific failing test file.

### Add or modify a plugin feature

1. Read `references/plugin-kubectl.md` for the kubectl plugin API surface.
2. Modify source in `packages/plugin-kubectl/src/index.ts` (methods) or `matchers.ts` (assertions).
3. Update `references/plugin-kubectl.md` and `references/api-cheatsheet.md` to reflect changes.
4. Verify: `bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts`

### Modify runner/scheduler/terminal internals

1. Read `references/architecture.md` for layer overview and flow.
2. Read `references/runner-pipeline.md` for the specific pipeline stage.
3. After changes, run regression: `bun test packages/repterm/tests/unit`

## References (load on demand)

| When | Load |
|------|------|
| Writing tests or need API signatures | `references/api-cheatsheet.md` |
| Need copy-paste code templates | `references/common-patterns.md` |
| Debugging test failures | `references/troubleshooting.md` |
| Working on runner/scheduler/terminal internals | `references/architecture.md` + `references/runner-pipeline.md` |
| Working on kubectl plugin | `references/plugin-kubectl.md` |
| Understanding recording/PTY behavior | `references/terminal-modes.md` |
| Choosing which tests to run | `references/testing-matrix.md` |

Do NOT load all references at once. Load only what the current task requires.

## Conventions

1. When changing implementation code, update the corresponding `references/*.md` file.
2. After CLI/runner/terminal changes, run: `bun test packages/repterm/tests/unit`
3. After plugin API/matcher changes, update all of:
   - `packages/plugin-kubectl/src/index.ts`
   - `packages/plugin-kubectl/src/matchers.ts`
   - `skills/repterm/references/plugin-kubectl.md`
   - `skills/repterm/references/api-cheatsheet.md`
4. After any test file changes, verify: `bun test packages/repterm/tests/unit/<changed>.test.ts`
