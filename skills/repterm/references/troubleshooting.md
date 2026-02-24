# Troubleshooting Guide

## 1. Quick symptom lookup

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `--record` fails to start | Missing `asciinema`/`tmux` | Install deps and retry |
| `code === -1` | PTY/recording path | Assert on output or use `silent` |
| `waitForText` timeout | Text not present / ANSI noise / timeout too short | Increase timeout, try `stripAnsi: false` |
| 0 tests found | Wrong path or filter empty | Check path and `{ record: true }` |
| Kubectl JSON parse error | PTY output mixed | Use plugin JSON API or `silent` |

## 2. Recording

### 2.1 Missing dependencies

```bash
# macOS
brew install asciinema tmux

# Ubuntu / Debian
apt-get install asciinema tmux
```

Detection: `packages/repterm/src/utils/dependencies.ts`.

### 2.2 Recording stuck

```bash
tmux list-sessions
tmux kill-server
ps aux | grep asciinema
```

Cleanup path in `Terminal.close()`: detach, kill process, kill tmux session.

### 2.3 No `.cast` file

Ensure both: CLI run with `--record`, and test/suite has `{ record: true }`. Otherwise PTY-only, no `.cast`.

## 3. Exit code and output assertions

Under PTY/recording, `CommandResult.code` may be `-1`. Prefer `silent: true` for exit code or assert output.

## 4. waitForText failures

Use `stripAnsi: false` to match raw output with color codes.

## 5. Test discovery

Default match `.ts`/`.js`. `discoverTests` expects `RegExp` for `pattern`, not glob.

## 6. Kubectl plugin

Set KUBECONFIG; use `watch.interrupt()` so tests do not hang.

## 7. Minimal repro

```bash
bun test packages/repterm/tests/unit
bun run repterm packages/repterm/examples/01-basic-commands.ts
bun run repterm --record packages/repterm/examples/08-recording-demos.ts
```
