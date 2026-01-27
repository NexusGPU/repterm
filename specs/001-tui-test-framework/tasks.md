---

description: "Task list for CLI/TUI test framework"
---

# Tasks: CLI/TUI Test Framework

**Input**: Design documents from `/specs/001-tui-test-framework/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for every user story (TDD). Write tests first and ensure they fail before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `package.json` with Node 20.11.0 engines, scripts, and deps for TypeScript + node-pty
- [X] T002 Add TypeScript ESM config in `tsconfig.json` with `src/` → `dist/` output
- [X] T003 [P] Create public entrypoint scaffold in `src/index.ts`
- [X] T004 [P] Add npm tooling configs in `eslint.config.js` and `.prettierrc`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Define core entities (TestSuite, TestCase, Step, RunResult, Artifact) in `src/runner/models.ts`
- [X] T006 [P] Implement run configuration loader (timeouts, record, parallel) in `src/runner/config.ts`
- [X] T007 [P] Implement artifact directory manager and path helpers in `src/runner/artifacts.ts`
- [X] T008 Implement test file discovery and loading in `src/runner/loader.ts`
- [X] T009 Implement terminal session abstraction around node-pty in `src/terminal/session.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Write and Run TUI Tests (Priority: P1) 🎯 MVP

**Goal**: Playwright-style authoring, CLI execution, clear pass/fail output, and recording support.

**Independent Test**: A user can author a single test and run `repterm test` to see a pass/fail result with terminal output on failure.

### Tests for User Story 1 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] ~~T010 [P] [US1] Contract test for POST `/runs` (REMOVED - API server not needed)~~
- [X] ~~T011 [P] [US1] Contract test for GET `/runs/{runId}` (REMOVED - API server not needed)~~
- [X] ~~T012 [P] [US1] Contract test for GET `/runs/{runId}/artifacts` (REMOVED - API server not needed)~~
- [X] T013 [P] [US1] Integration test for CLI single test run in `tests/integration/cli-run.test.ts`
- [X] T014 [P] [US1] Integration test for recording mode in `tests/integration/recording-run.test.ts`

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement `test()` registration and suite registry in `src/api/test.ts`
- [X] T016 [P] [US1] Implement `expect()` terminal matchers in `src/api/expect.ts`
- [X] T017 [P] [US1] Implement `Terminal` API (start/send/wait/snapshot) in `src/terminal/terminal.ts`
- [X] T018 [US1] Implement single-runner execution pipeline in `src/runner/runner.ts`
- [X] T019 [US1] Implement CLI command parsing + exit codes in `src/cli/index.ts`
- [X] T020 [US1] Implement reporter with failure diagnostics in `src/cli/reporter.ts`
- [X] T021 [US1] Implement recording mode (asciinema + tmux) in `src/recording/recorder.ts` and `src/terminal/tmux.ts`
- [X] T022 [US1] Implement multi-pane `terminalFactory` in `src/terminal/factory.ts`
- [X] T023 [US1] Export public API surface in `src/index.ts`
- [X] ~~T024 [US1] Implement run status store and API handlers (REMOVED - API server not needed)~~
- [X] ~~T025 [US1] Add HTTP server for `/runs` endpoints (REMOVED - API server not needed)~~

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Parallel Test Execution (Priority: P2)

**Goal**: Parallel runs with isolated terminal state and independent reporting.

**Independent Test**: A suite with multiple tests runs with `--workers` and shows concurrent execution with independent results.

### Tests for User Story 2 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T026 [P] [US2] Integration test for parallel worker run in `tests/integration/parallel-run.test.ts`
- [X] T027 [P] [US2] Unit test for scheduler aggregation in `tests/unit/scheduler.test.ts`

### Implementation for User Story 2

- [X] T028 [P] [US2] Implement worker process runner in `src/runner/worker.ts`
- [X] T029 [US2] Implement scheduler + aggregation in `src/runner/scheduler.ts`
- [X] T030 [US2] Add CLI `--workers` flag and config wiring in `src/cli/index.ts`
- [X] T031 [US2] Ensure per-worker artifact isolation in `src/runner/artifacts.ts`

**Checkpoint**: User Stories 1 and 2 should both work independently

---

## Phase 5: User Story 3 - Maintainable Test Organization (Priority: P3)

**Goal**: Suites, shared steps, and reusable fixtures that keep tests readable.

**Independent Test**: A user can define suites and shared steps, then run a single suite independently.

### Tests for User Story 3 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T032 [P] [US3] Unit test for suite grouping and steps in `tests/unit/describe-steps.test.ts`
- [X] T033 [P] [US3] Integration test for shared fixtures and suite filtering in `tests/integration/fixtures-suites.test.ts`

### Implementation for User Story 3

- [X] T034 [P] [US3] Implement `test.describe` suite grouping in `src/api/describe.ts`
- [X] T035 [P] [US3] Implement `test.step` with step reporting in `src/api/steps.ts`
- [X] T036 [P] [US3] Implement hooks/fixtures (`beforeEach`, `afterEach`) in `src/api/hooks.ts`
- [X] T037 [US3] Add suite filtering by name/pattern in `src/runner/loader.ts`
- [X] T038 [US3] Bind shared fixtures into execution context in `src/runner/runner.ts`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T039 [P] Add CLI help text and dependency checks in `src/cli/index.ts`
- [X] T040 [P] Add timing utilities for performance tracking in `src/utils/timing.ts`
- [X] T041 [P] Update `specs/001-tui-test-framework/quickstart.md` with validated examples

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - no dependencies
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - integrates with runner/CLI
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - builds on suite registry

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Public API definitions before runner integration
- Terminal wiring before step execution
- Runner execution before CLI reporting
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational is complete, user stories can be worked in parallel
- API/terminal tasks within a story marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
Task: "Implement test() registration and suite registry in src/api/test.ts"
Task: "Implement expect() terminal matchers in src/api/expect.ts"
Task: "Implement Terminal API in src/terminal/terminal.ts"
```

---

## Parallel Example: User Story 2

```bash
Task: "Implement worker process runner in src/runner/worker.ts"
Task: "Ensure per-worker artifact isolation in src/runner/artifacts.ts"
```

---

## Parallel Example: User Story 3

```bash
Task: "Implement test.describe suite grouping in src/api/describe.ts"
Task: "Implement test.step with step reporting in src/api/steps.ts"
Task: "Implement hooks/fixtures in src/api/hooks.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Demo MVP (CLI run + diagnostics + recording)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → MVP
3. Add User Story 2 → Test independently
4. Add User Story 3 → Test independently
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Avoid vague tasks; include exact file paths
