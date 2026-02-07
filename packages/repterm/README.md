# repterm

Terminal-first test runner for CLI/TUI applications.

`repterm` executes tests in a real PTY, so you can validate interactive behavior (prompts, ANSI output, multi-terminal flows) instead of plain stdout snapshots.

## Install

```bash
bun add -d repterm
```

## Usage

```bash
bunx repterm tests/
bunx repterm --workers 4 tests/
bunx repterm --record tests/
```

## Related Packages

- `repterm-api`: public plugin and matcher API
- `@nexusgpu/repterm-plugin-kubectl`: kubectl plugin for Kubernetes scenarios

Plugin contributors: see [Plugin Contributor Guide](../../CONTRIBUTING-PLUGINS.md).

For project-level docs and release notes, see the repository root `README.md`.
