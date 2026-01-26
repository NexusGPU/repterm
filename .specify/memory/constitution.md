<!--
Sync Impact Report
- Version change: N/A -> 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] -> Code Quality Is Non-Negotiable
  - [PRINCIPLE_2_NAME] -> Testing Standards Are Mandatory
  - [PRINCIPLE_3_NAME] -> Consistent User Experience
  - [PRINCIPLE_4_NAME] -> MVP First, Incremental Value
  - [PRINCIPLE_5_NAME] -> Simplicity Over Overdesign
  - [ADDED] -> Performance Budgets Are Required
- Added sections: None
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ updated
  - .specify/templates/spec-template.md ✅ updated
  - .specify/templates/tasks-template.md ✅ updated
  - .specify/templates/commands/*.md ⚠ pending (directory not found)
-->
# Repterm Constitution

## Core Principles

### Code Quality Is Non-Negotiable
All changes MUST be readable, consistent, and maintainable. Follow the
project's formatting/linting rules, keep functions small and cohesive,
avoid unnecessary duplication, and document public interfaces. Any
non-trivial complexity MUST be justified in the plan.
Rationale: High-quality code keeps velocity sustainable and reduces defects.

### Testing Standards Are Mandatory
Every user story MUST include automated tests that prove the story works
independently. Bug fixes MUST include a regression test. If a test is
impractical, the exception MUST be documented with an alternative
verification method.
Rationale: Tests are the primary guardrail for correctness and change safety.

### Consistent User Experience
User-facing behavior, UI patterns, and copy MUST remain consistent with
existing conventions. New patterns require explicit justification and
documentation. Acceptance scenarios MUST reflect the intended user flow.
Rationale: Consistency reduces user friction and support cost.

### MVP First, Incremental Value
Work MUST deliver a minimal, independently valuable slice before expanding
scope. Prioritize P1 user story completion and validation before P2/P3.
Rationale: MVP delivery proves value and prevents overbuilding.

### Simplicity Over Overdesign
Choose the simplest approach that meets current requirements. Avoid
premature abstractions, speculative extensibility, and unnecessary
infrastructure. If complexity is added, document why the simpler option
was insufficient.
Rationale: Overdesign slows delivery and increases maintenance cost.

### Performance Budgets Are Required
Define measurable performance targets for each feature (latency,
throughput, memory, or UX response time as applicable) and verify no
material regressions. Performance expectations must be documented in the
plan and validated before release.
Rationale: Performance is a user-facing requirement, not an afterthought.

## Quality & Performance Standards

- Each plan MUST state performance goals and constraints; use
  NEEDS CLARIFICATION when unknown.
- Each feature MUST include a test strategy (unit/integration/e2e) tied to
  user stories and acceptance scenarios.
- User-facing changes MUST include a UX consistency note (pattern, copy,
  navigation).
- Any constitution violation MUST be documented in the plan's Complexity
  Tracking table with justification.

## Workflow & Review

- New features MUST have a spec, plan, and tasks document produced via the
  speckit workflow.
- All changes MUST be reviewed for constitution compliance before merge.
- Documentation for user-facing changes MUST be updated with the release.

## Governance

- This constitution supersedes all other guidance.
- Amendments require a documented rationale, updated version, and any
  necessary migration notes.
- Versioning follows semantic versioning:
  - MAJOR: breaking governance changes or principle removals
  - MINOR: new or materially expanded principles/sections
  - PATCH: clarifications or wording fixes
- Every plan and PR MUST include a constitution compliance check.

**Version**: 1.0.0 | **Ratified**: 2026-01-26 | **Last Amended**: 2026-01-26
