## Research Summary

### Decision: Use Node.js 20.11.0 + TypeScript (ESM)
**Rationale**: Requirement mandates Node 20.11.0 for `node-pty` compatibility; TypeScript provides typed public API for Playwright-style authoring.  
**Alternatives considered**: Using older Node versions (rejected by requirement); CommonJS (adds friction with TS ESM types and tooling).

### Decision: Recording mode uses `asciinema rec` driven by `node-pty`
**Rationale**: Matches `simple-example.js` behavior, captures terminal output deterministically, and keeps the runtime local without extra services.  
**Alternatives considered**: Direct terminal capture without asciinema (misses required recording artifacts); OS-level screen recording (too heavy and inconsistent).

### Decision: Multi-window tests use `tmux` as the entry point
**Rationale**: When users open multiple terminal sessions in a single test, `tmux` provides a single recording surface and supports `split-window` to show concurrent panes.  
**Alternatives considered**: Multiple independent PTYs (not visible in one recording); nested asciinema sessions (fragile and hard to sync).

### Decision: Human-like typing simulated via per-character writes with jitter
**Rationale**: Requirement explicitly asks for human-like typing in recordings; per-char writes with randomized delays creates natural motion in the `.cast`.  
**Alternatives considered**: Instant input (fails the recording requirement); fixed delay without jitter (looks robotic).

### Decision: Playwright-style API surface for authoring
**Rationale**: Requirement mandates a Playwright-like API and the repo already includes Playwright source for reference; align naming (`test`, `expect`, `describe`, `test.step`).  
**Alternatives considered**: Custom DSL (higher learning curve, conflicts with requirements).

### Decision: Parallel execution via worker processes with isolated PTY state
**Rationale**: Meets FR-004 by isolating terminal state and artifacts per worker; keeps failures contained while allowing concurrency.  
**Alternatives considered**: In-process parallelism (risks shared PTY state and flaky output).
