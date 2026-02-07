#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/trigger-release.sh [--ref <git-ref>] [--workflow <workflow-file>] [--no-repterm] [--plugins] [--repterm-api]

Triggers manual release workflow via gh CLI.

Options:
  --ref, -r          Git ref to run workflow on (default: main)
  --workflow, -w     Workflow filename (default: build.yml)
  --no-repterm       Disable repterm (npm + binary) release
  --plugins          Enable plugins release
  --repterm-api      Enable repterm-api release
  --help, -h         Show help
USAGE
}

ref="main"
workflow="build.yml"
release_repterm="true"
release_plugins="false"
release_repterm_api="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--ref)
      ref="$2"
      shift 2
      ;;
    -w|--workflow)
      workflow="$2"
      shift 2
      ;;
    --no-repterm)
      release_repterm="false"
      shift
      ;;
    --plugins)
      release_plugins="true"
      shift
      ;;
    --repterm-api)
      release_repterm_api="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

gh_bin="${GH_BIN:-gh}"
if command -v "$gh_bin" >/dev/null 2>&1; then
  gh_cmd="$gh_bin"
elif [[ -x "$gh_bin" ]]; then
  gh_cmd="$gh_bin"
else
  echo "gh CLI not found. Install from https://cli.github.com" >&2
  exit 1
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$repo_root" ]]; then
  echo "Not inside a git repository." >&2
  exit 1
fi

cd "$repo_root"
workflow_test="$repo_root/scripts/build-workflow.test.sh"
if [[ ! -x "$workflow_test" ]]; then
  echo "Missing executable $workflow_test" >&2
  exit 1
fi

"$workflow_test"
"$gh_cmd" workflow run "$workflow" \
  --ref "$ref" \
  -f release_repterm="$release_repterm" \
  -f release_plugins="$release_plugins" \
  -f release_repterm_api="$release_repterm_api"

echo "Triggered $workflow on ref $ref (repterm=$release_repterm, plugins=$release_plugins, repterm-api=$release_repterm_api)"
