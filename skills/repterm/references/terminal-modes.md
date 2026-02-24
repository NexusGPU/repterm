# Terminal and recording modes

## 1. Four execution paths

| Mode | Trigger | Execution | Notes |
| --- | --- | --- | --- |
| Spawn (default) | `$\`cmd\`` or `terminal.run()` non-interactive, non-PTY | `Bun.spawn` | exact `code`, separate stdout/stderr |
| PTY-only | Test has `{ record: true }`, CLI no `--record` | PTY | no `.cast`, `code` often -1 |
| Recording | CLI `--record` + test `{ record: true }` | asciinema + tmux + PTY | produces `.cast`, typing and pane |
| Interactive | `terminal.run(cmd, { interactive: true })` | PTY | expect/send/sendRaw/interrupt |

Note: `silent: true` forces `Bun.spawn` even in PTY/recording: `$({ silent: true })\`cmd\``.

## 2. `--record` filter behavior

From `packages/repterm/src/runner/filter.ts`:

1. **Without `--record`**: run all tests (including `{ record: true }`).
2. **With `--record`**: run only `{ record: true }` tests.

> Note: CLI help may differ; behavior follows filter.ts.

## 3. CommandResult and assertions

- Fields: code/stdout/stderr/output/duration/command/successful.
- Spawn: assert `code` directly.
- PTY/Recording/Interactive: `code` often -1; assert output instead.
- For reliable exit code or clean JSON: `$({ silent: true })\`cmd\`` or `terminal.run(cmd, { silent: true })`.

## 4. Multi-terminal and panes

1. In recording, `terminal.create()` splits tmux pane.
2. Pane output in `SharedTerminalState`; no public `selectPane()`.
3. Non-recording: `terminal.create()` returns independent session.

## 5. Prompt lines and output capture

- CLI `--prompt-lines <n>` (config.terminal.promptLineCount).
- Default 0: auto-detect prompt lines.
- Recording capture depends on prompt lines; set manually if needed.

## 6. Shell integration (OSC 133)

Source: `packages/repterm/src/terminal/shell-integration.ts`

Three-layer prompt detection (auto-selected, best available wins):

| Layer | Method | Precision | Exit code | Fallback |
| --- | --- | --- | --- | --- |
| 1 | OSC 133 (FinalTerm standard) | Exact semantic markers (A/B/C/D) | Captured from D marker | — |
| 2 | Sentinel unique marker | Unique string impossible in output | Via sentinel parsing | If OSC 133 not detected |
| 3 | Enhanced regex | Pattern-based prompt matching | Not available | If sentinel fails |

**Per-command override** via RunOptions.promptDetection:
- `'auto'` (default): best available layer
- `'osc133'`: force OSC 133 only
- `'sentinel'`: force sentinel marker
- `'regex'`: force regex matching
- `'none'`: skip prompt detection (for long-running or streaming commands)

**TerminalConfig.shellIntegration:**
- `enabled` (default: true): inject shell integration markers
- `sentinelFallback` (default: true): enable sentinel layer if OSC 133 not available
- `shell`: custom shell path override

**Supported shells:** Bash (PROMPT_COMMAND + DEBUG trap), Zsh (precmd_functions + preexec_functions). Other shells fall back to regex detection.

**Tmux passthrough:** OSC 133 markers are forwarded through DCS passthrough in recording mode (`set-option allow-passthrough on`).

