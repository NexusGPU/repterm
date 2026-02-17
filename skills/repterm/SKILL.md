---
name: repterm
description: >-
  Maintain and extend Repterm (packages/repterm) and @nexusgpu/repterm-plugin-kubectl in this monorepo.
  Use when writing or debugging terminal tests, recording mode, parallel scheduler/worker behavior,
  hooks/fixtures/steps lifecycle, plugin APIs, kubectl helpers/matchers, or repository docs/examples/tests.
---

# Quick start

## Commands

| Task | Command |
|------|------|
| Install deps | `bun install` |
| Run all unit tests | `bun test packages/repterm/tests/unit` |
| Run core CLI | `bun run packages/repterm/src/cli/index.ts <tests-or-dirs>` |
| Recording | `bun run repterm --record <tests-or-dirs>` |
| Parallel run | `bun run repterm --workers 4 <tests-or-dirs>` |
| Kubectl no-cluster example | `bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts` |

## Key behavior

1. --record filter:
   - Without --record: run all tests (including { record: true }).
   - With --record: only { record: true } tests.
2. `$\`cmd\`` is the recommended way to run commands (auto-escapes interpolated values).
   `terminal.run()` still works for backward compatibility.
3. Both `$` and `terminal.run()` return PTYProcess (PromiseLike); await for CommandResult.
4. CommandResult: code/stdout/stderr/output/duration/command/successful.
5. In recording/interactive PTY, exit code often -1; assert output.

## Code navigation

- Core: `packages/repterm/src`
- Unit tests: `packages/repterm/tests/unit`
- Examples: `packages/repterm/examples`
- Kubectl plugin: `packages/plugin-kubectl/src`
- Kubectl examples: `packages/plugin-kubectl/examples`

## Reference index

| Topic | File |
|------|------|
| Architecture | `references/architecture.md` |
| API cheatsheet | `references/api-cheatsheet.md` |
| CLI/runner pipeline | `references/runner-pipeline.md` |
| Terminal/recording modes | `references/terminal-modes.md` |
| Common patterns | `references/common-patterns.md` |
| Examples catalog | `references/examples-catalog.md` |
| Kubectl plugin and matchers | `references/plugin-kubectl.md` |
| Test priority matrix | `references/testing-matrix.md` |
| Troubleshooting | `references/troubleshooting.md` |

## Conventions

1. When changing impl, update references/*.md.
2. After CLI/runner/terminal changes, run relevant unit tests.
3. After plugin API/matcher changes, update:
   - `packages/plugin-kubectl/src/index.ts`
   - `packages/plugin-kubectl/src/matchers.ts`
   - `skills/repterm/references/plugin-kubectl.md`
   - `skills/repterm/references/api-cheatsheet.md`
