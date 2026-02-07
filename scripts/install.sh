#!/usr/bin/env sh
set -eu

BASE_URL="${REPTERM_BASE_URL:-https://cdn.tensor-fusion.ai/archive/repterm}"
VERSION="${REPTERM_VERSION:-latest}"
INSTALL_DIR="${REPTERM_INSTALL_DIR:-/usr/local/bin}"

info() {
  printf '[INFO] %s\n' "$*"
}

fatal() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

detect_os() {
  case "$(uname -s)" in
    Linux*) echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *) fatal "Unsupported OS: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) fatal "Unsupported architecture: $(uname -m)" ;;
  esac
}

download() {
  src="$1"
  dst="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$src" -o "$dst"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dst" "$src"
  else
    fatal "curl or wget is required"
  fi
}

install_binary() {
  src="$1"
  dst_dir="$2"

  if [ -w "$dst_dir" ]; then
    install -m 0755 "$src" "$dst_dir/repterm"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo install -m 0755 "$src" "$dst_dir/repterm"
    return
  fi

  fatal "No write permission to ${dst_dir}. Re-run with sudo or set REPTERM_INSTALL_DIR."
}

main() {
  os="$(detect_os)"
  arch="$(detect_arch)"
  binary_name="repterm-${os}-${arch}"
  url="${BASE_URL}/${VERSION}/${binary_name}"

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT INT TERM

  info "Downloading ${url}"
  download "$url" "$tmp_dir/repterm"

  mkdir -p "$INSTALL_DIR"
  install_binary "$tmp_dir/repterm" "$INSTALL_DIR"

  info "Installed repterm to ${INSTALL_DIR}/repterm"
  info "Verify with: repterm --help"
}

main "$@"
