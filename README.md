# Repterm

Repterm is a terminal-first test framework for CLI/TUI applications.
It runs tests in a real PTY so you can assert on interactive terminal behavior, not just plain stdout.

## Packages

- `repterm`: runner + CLI
- `repterm-api`: plugin/matcher API for extension authors
- `@nexusgpu/repterm-plugin-kubectl`: kubectl-focused plugin

Plugin contributors: see [Plugin Contributor Guide](CONTRIBUTING-PLUGINS.md).

## AI Agent Skill (skills.sh)

This repository includes the `repterm` agent skill at `skills/repterm/`.

Install from GitHub:

```bash
npx skills add NexusGPU/repterm --skill repterm
```

Local discovery check:

```bash
npx skills add . --list
```

## Install

```bash
bun add -d repterm
```

Run tests:

```bash
bunx repterm tests/
bunx repterm --workers 4 tests/
bunx repterm --record tests/
```

## Install Binary (from R2/CDN)

The release workflow uploads standalone binaries to Cloudflare R2 using this layout:

- `.../archive/repterm/latest/repterm-<os>-<arch>`
- `.../archive/repterm/v<version>/repterm-<os>-<arch>`

### Linux/macOS

```bash
curl -fsSL https://cdn.tensor-fusion.ai/archive/repterm/install.sh | sh
```

Install a specific version and custom source:

```bash
curl -fsSL https://cdn.tensor-fusion.ai/archive/repterm/install.sh \
  | REPTERM_VERSION=v0.2.0 REPTERM_BASE_URL=https://cdn.tensor-fusion.ai/archive/repterm sh
```

Optional environment variables for `scripts/install.sh`:

- `REPTERM_VERSION`: default `latest`
- `REPTERM_BASE_URL`: default `https://cdn.tensor-fusion.ai/archive/repterm`
- `REPTERM_INSTALL_DIR`: default `/usr/local/bin`

### Windows (PowerShell)

```powershell
$env:REPTERM_VERSION = "latest"
$env:REPTERM_BASE_URL = "https://cdn.tensor-fusion.ai/archive/repterm"
iwr https://cdn.tensor-fusion.ai/archive/repterm/install.ps1 -UseBasicParsing | iex
```

## Examples

- Repterm examples: `packages/repterm/examples/README.md`
- Kubectl plugin examples: `packages/plugin-kubectl/examples/README.md`
