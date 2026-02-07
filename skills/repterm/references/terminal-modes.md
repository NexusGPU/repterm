# Terminal and recording modes

## 1. Four execution paths

| Mode | Trigger | Execution | Notes |
| --- | --- | --- | --- |
| Spawn (default) | `terminal.run()` non-interactive, non-PTY | `Bun.spawn` | exact `code`, separate stdout/stderr |
| PTY-only | Test has `{ record: true }`, CLI no `--record` | PTY | no `.cast`, `code` often -1 |
| Recording | CLI `--record` + test `{ record: true }` | asciinema + tmux + PTY | produces `.cast`, typing and pane |
| Interactive | `terminal.run(cmd, { interactive: true })` | PTY | expect/send/sendRaw/interrupt |

Note: `silent: true` forces `Bun.spawn` even in PTY/recording.

## 2. `--record` filter behavior

From `packages/repterm/src/runner/filter.ts`:

1. **Without `--record`**: run all tests (including `{ record: true }`).
2. **With `--record`**: run only `{ record: true }` tests.

> Note: CLI help may differ; behavior follows filter.ts.

## 3. CommandResult and assertions

- Fields: code/stdout/stderr/output/duration/command/successful.
- Spawn: assert `code` directly.
- PTY/Recording/Interactive: `code` often -1; assert output instead.
- For reliable exit code or clean JSON: `terminal.run(cmd, { silent: true })`.

## 4. Multi-terminal and panes

1. In recording, `terminal.create()` splits tmux pane.
2. Pane output in `SharedTerminalState`; no public `selectPane()`.
3. Non-recording: `terminal.create()` returns independent session.

## 5. Prompt lines and output capture

- CLI `--prompt-lines <n>` (config.terminal.promptLineCount).
- Default 0: auto-detect prompt lines.
- Recording capture depends on prompt lines; set manually if needed.

## 6. Debug tips

```ts
const result = await terminal.run('some command');
console.log(result.code, result.stdout, result.stderr);

await terminal.waitForText('ready', { timeout: 10_000, stripAnsi: true });
console.log(await terminal.snapshot());

const json = await terminal.run('kubectl get pod x -o json', { silent: true });
console.log(json.stdout);
```

## See Also

- [runner-pipeline.md](runner-pipeline.md)
- [troubleshooting.md](troubleshooting.md)
