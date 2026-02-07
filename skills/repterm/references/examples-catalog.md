# Example index (packages/repterm/examples)

## Difficulty

| Level | Meaning |
| --- | --- |
| ⭐ | Basic, no extra deps |
| ⭐⭐ | Intermediate: interactive/hooks/multi-terminal |
| ⭐⭐⭐ | Advanced: recording and coordination |

## Example matrix

| Level | File | Topics | Deps | Command |
| --- | --- | --- | --- | --- |
| ⭐ | `01-basic-commands.ts` | `terminal.run`, `CommandResult` fields, basic assertions | none | `bun run repterm packages/repterm/examples/01-basic-commands.ts` |
| ⭐ | `02-command-assertions.ts` | `toSucceed/toFail/toMatch*` assertions | none | `bun run repterm packages/repterm/examples/02-command-assertions.ts` |
| ⭐⭐ | `03-interactive-commands.ts` | `interactive: true`, `PTYProcess.expect/send` | none | `bun run repterm packages/repterm/examples/03-interactive-commands.ts` |
| ⭐⭐ | `04-fixtures-with-hooks.ts` | `beforeEach('fixture')` lazy load, cleanup | none | `bun run repterm packages/repterm/examples/04-fixtures-with-hooks.ts` |
| ⭐⭐ | `05-multi-terminal.ts` | `terminal.create()` multi-terminal | none | `bun run repterm packages/repterm/examples/05-multi-terminal.ts` |
| ⭐ | `06-terminal-assertions.ts` | `expect(terminal)`, `snapshot` | none | `bun run repterm packages/repterm/examples/06-terminal-assertions.ts` |
| ⭐⭐ | `07-test-organization.ts` | nested describe, `test.step` | none | `bun run repterm packages/repterm/examples/07-test-organization.ts` |
| ⭐⭐⭐ | `08-recording-demos.ts` | `{ record: true }` + `--record` recording flow | asciinema, tmux | `bun run repterm --record packages/repterm/examples/08-recording-demos.ts` |
| ⭐⭐⭐ | `09-webserver-multi-terminal.ts` | recording + multi-pane + service | Python3, curl, asciinema, tmux | `bun run repterm --record packages/repterm/examples/09-webserver-multi-terminal.ts` |
| ⭐⭐ | `11-beforeall-afterall.ts` | `beforeAll/afterAll` onion model and context | none | `bun run repterm packages/repterm/examples/11-beforeall-afterall.ts` |

## Learning path

1. Basics: `01` → `02` → `06`
2. Intermediate: `03` → `04` → `07` → `11`
3. Recording: `08` → `09`

## Quick commands

```bash
# No-deps smoke
bun run repterm packages/repterm/examples/01-basic-commands.ts
bun run repterm packages/repterm/examples/02-command-assertions.ts
bun run repterm packages/repterm/examples/06-terminal-assertions.ts

# Interactive and hooks
bun run repterm packages/repterm/examples/03-interactive-commands.ts
bun run repterm packages/repterm/examples/04-fixtures-with-hooks.ts

# Recording (asciinema + tmux)
bun run repterm --record packages/repterm/examples/08-recording-demos.ts
```

## Kubectl plugin examples

In packages/plugin-kubectl/examples; run first:

```bash
bun run repterm packages/plugin-kubectl/examples/00-simple-demo.ts
```

## See Also

- [api-cheatsheet.md](api-cheatsheet.md)
- [common-patterns.md](common-patterns.md)
- [plugin-kubectl.md](plugin-kubectl.md)
