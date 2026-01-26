# Implementation Plan: CLI/TUI Test Framework

**Branch**: `001-tui-test-framework` | **Date**: 2026-01-26 | **Spec**: `/specs/001-tui-test-framework/spec.md`
**Input**: Feature specification from `/specs/001-tui-test-framework/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Deliver a minimal TypeScript TUI testing framework with PlaywrightAPI-style authoring, CLI execution, parallel runs, and clear pass/fail output. Provide two execution modes: recording (asciinema + tmux, with human-like typing) and non-recording (direct user terminal), following the flow in `simple-example.js` and referencing implementation patterns from `playwright/`.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js 20.11.0  
**Primary Dependencies**: node-pty, asciinema CLI (external), tmux (external); Playwright repo as style reference (no runtime dependency)  
**Storage**: Local artifacts only (asciinema `.cast` files, text snapshots)  
**Testing**: Node.js `node:test` + `assert` for framework tests  
**Target Platform**: macOS/Linux terminals with PTY support  
**Project Type**: Single project  
**Performance Goals**: p95 input-to-output handling under 50ms in non-recording mode; recording overhead <20% runtime vs non-recording for typical tests  
**Constraints**: Must run on Node 20.11.0 to support `node-pty`; requires `asciinema` and `tmux` installed for recording mode; no Windows support for MVP  
**Scale/Scope**: 10–100 tests per run, parallelism up to 4 workers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- MVP scope defined; P1 delivers independent value
- Solution is the simplest viable approach; any extra complexity justified
- Test strategy defined for each user story (unit/integration/e2e as needed)
- UX consistency noted (patterns, copy, navigation)
- Performance goals and constraints documented

## Project Structure

### Documentation (this feature)

```text
specs/001-tui-test-framework/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── api/                 # Playwright-style public API: test/expect/fixtures
├── cli/                 # CLI entrypoint and reporting
├── runner/              # scheduler, parallel workers, test lifecycle
├── terminal/            # node-pty wiring, tmux integration
├── recording/           # asciinema session control and artifacts
└── utils/               # shared helpers (timing, typing cadence)

tests/
├── unit/                # small pure logic tests
├── integration/         # PTY + process wiring (mocked where possible)
└── e2e/                 # full CLI run against simple-example flow
```

**Structure Decision**: Single-project layout to minimize overhead while keeping API, CLI, and terminal/recording concerns separated.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
