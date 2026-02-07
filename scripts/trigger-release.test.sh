#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$root/scripts/trigger-release.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

stub="$tmp/gh"
cat > "$stub" <<'STUB'
#!/usr/bin/env bash
echo "$@" > "$CAPTURE_FILE"
STUB
chmod +x "$stub"

export GH_BIN="$stub"

CAPTURE_FILE="$tmp/args1" "$script" --ref feature/test --workflow build.yml --plugins --repterm-api
expected="workflow run build.yml --ref feature/test -f release_repterm=true -f release_plugins=true -f release_repterm_api=true"
got="$(cat "$tmp/args1")"
if [[ "$got" != "$expected" ]]; then
  echo "expected: $expected" >&2
  echo "got: $got" >&2
  exit 1
fi

CAPTURE_FILE="$tmp/args2" "$script" --no-repterm
expected="workflow run build.yml --ref main -f release_repterm=false -f release_plugins=false -f release_repterm_api=false"
got="$(cat "$tmp/args2")"
if [[ "$got" != "$expected" ]]; then
  echo "expected: $expected" >&2
  echo "got: $got" >&2
  exit 1
fi

echo "OK"
