#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRODUCT="opencode-codex-web"
VERSION="0.1.0"

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}[info]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ok]${NC}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[warn]${NC}  %s\n" "$*"; }
err()   { printf "${RED}[error]${NC} %s\n" "$*" >&2; }
die()   { err "$@"; exit 1; }

# ── Usage ───────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 web-client [OPTIONS]

Options:
  --dry-run              Print what would be done, no filesystem changes
  --force                Overwrite existing files even without ownership marker
  --skip-build           Skip npm install/build if dist/ already exists
  --uninstall            Remove installed files (keeps config/state)
  --purge                With --uninstall, also remove config/state/cache
  --bin-dir <path>       Override BIN_DIR
  --data-dir <path>      Override DATA_DIR
  --state-dir <path>     Override STATE_DIR
  --config-dir <path>    Override CONFIG_DIR
  --opencode-config-dir <path>  Override OPENCODE_CONFIG_DIR
  -h, --help             Show this help
EOF
}

# ── Subcommand dispatch ─────────────────────────────────────────────
if [[ ${1:-} != "web-client" ]]; then
  if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
    usage; exit 0
  fi
  die "Unknown or missing subcommand '${1:-}'. Currently supported: web-client"
fi
shift

# ── Parse flags ─────────────────────────────────────────────────────
DRY_RUN=false
FORCE=false
SKIP_BUILD=false
UNINSTALL=false
PURGE=false
OPT_BIN_DIR="" OPT_DATA_DIR="" OPT_STATE_DIR="" OPT_CONFIG_DIR="" OPT_OPENCODE_CONFIG_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true ;;
    --force)     FORCE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --uninstall) UNINSTALL=true ;;
    --purge)     PURGE=true ;;
    --bin-dir)             OPT_BIN_DIR="$2"; shift ;;
    --data-dir)            OPT_DATA_DIR="$2"; shift ;;
    --state-dir)           OPT_STATE_DIR="$2"; shift ;;
    --config-dir)          OPT_CONFIG_DIR="$2"; shift ;;
    --opencode-config-dir) OPT_OPENCODE_CONFIG_DIR="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

# ── Resolve paths ───────────────────────────────────────────────────
SOURCE_APP_DIR="$SCRIPT_DIR/apps/opencode-web-client"

BIN_DIR="${OPT_BIN_DIR:-${OPENCODE_WEB_BIN_DIR:-${XDG_BIN_DIR:-$HOME/.local/bin}}}"
DATA_DIR="${OPT_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/$PRODUCT}"
STATE_DIR="${OPT_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/$PRODUCT}"
CONFIG_DIR="${OPT_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/$PRODUCT}"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/$PRODUCT"
LOG_DIR="$STATE_DIR/logs"
OPENCODE_CONFIG_DIR="${OPT_OPENCODE_CONFIG_DIR:-${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}}"

MANIFEST="$DATA_DIR/install-manifest.json"
BIN_SHIM="$BIN_DIR/opencode-codex-web"

OWNERSHIP_JS="// Installed by $PRODUCT installer. Managed asset:"
OWNERSHIP_MD="<!-- Installed by $PRODUCT installer. Managed asset:"

# ── Helpers ─────────────────────────────────────────────────────────
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
bak_suffix() { date +"%Y%m%d%H%M%S"; }

run() {
  if $DRY_RUN; then
    info "[dry-run] $*"
  else
    "$@"
  fi
}

ensure_dir() {
  if $DRY_RUN; then
    info "[dry-run] mkdir -p $1"
  else
    mkdir -p "$1"
  fi
}

copy_file() {
  local src="$1" dst="$2"
  if $DRY_RUN; then
    info "[dry-run] cp $src → $dst"
    return
  fi
  local dst_dir; dst_dir="$(dirname "$dst")"
  mkdir -p "$dst_dir"
  cp "$src" "$dst"
}

copy_dir() {
  local src="$1" dst="$2"
  if $DRY_RUN; then
    info "[dry-run] cp -r $src/ → $dst/"
    return
  fi
  mkdir -p "$dst"
  cp -r "$src/." "$dst/"
}

# Install a managed asset with ownership header
install_managed_asset() {
  local src="$1" dst="$2" name="$3" type="$4"
  local header
  if [[ "$type" == "js" ]]; then
    header="$OWNERSHIP_JS $name. Source: opencode-web-client/$VERSION."
  else
    header="$OWNERSHIP_MD $name. -->"
  fi

  if $DRY_RUN; then
    info "[dry-run] install managed asset: $dst ($name)"
    return
  fi

  local dst_dir; dst_dir="$(dirname "$dst")"
  mkdir -p "$dst_dir"

  if [[ -f "$dst" ]]; then
    local first_line; first_line="$(head -1 "$dst")"
    if [[ "$first_line" == *"Installed by $PRODUCT installer"* ]]; then
      # Owned by us — backup and overwrite
      local bak="$dst.bak.$(bak_suffix)"
      cp "$dst" "$bak"
      info "Backed up existing managed asset → $bak"
    elif ! $FORCE; then
      # Not ours, don't overwrite
      local candidate="$dst.candidate"
      { echo "$header"; cat "$src"; } > "$candidate"
      warn "File exists without ownership marker: $dst"
      warn "Wrote candidate to $candidate (use --force to overwrite)"
      return
    fi
  fi

  { echo "$header"; cat "$src"; } > "$dst"
  ok "Installed $name → $dst"
}

has_ownership_marker() {
  local file="$1"
  [[ -f "$file" ]] && head -1 "$file" | grep -q "Installed by $PRODUCT installer"
}

remove_managed_asset() {
  local file="$1" name="$2"
  if [[ ! -f "$file" ]]; then return; fi
  if has_ownership_marker "$file"; then
    if $DRY_RUN; then
      info "[dry-run] remove managed asset: $file"
    else
      rm "$file"
      ok "Removed managed asset: $file ($name)"
    fi
  else
    warn "Skipping $file — no ownership marker (not managed by us)"
  fi
}

# ── Uninstall ───────────────────────────────────────────────────────
do_uninstall() {
  info "Uninstalling $PRODUCT..."

  # Remove CLI shim
  if [[ -f "$BIN_SHIM" ]]; then
    run rm "$BIN_SHIM" && ok "Removed CLI shim: $BIN_SHIM"
  fi

  # Remove managed OpenCode assets
  remove_managed_asset "$OPENCODE_CONFIG_DIR/plugins/effort-control.js" "effort-control plugin"
  remove_managed_asset "$OPENCODE_CONFIG_DIR/plugins/effort-control/state.js" "effort-control state helper"
  remove_managed_asset "$OPENCODE_CONFIG_DIR/commands/usage.md" "usage command"

  # Remove data dir (runtime bundle)
  if [[ -d "$DATA_DIR" ]]; then
    if $DRY_RUN; then
      info "[dry-run] rm -rf $DATA_DIR"
    else
      rm -rf "$DATA_DIR"
      ok "Removed data dir: $DATA_DIR"
    fi
  fi

  # Remove cache
  if [[ -d "$CACHE_DIR" ]]; then
    if $DRY_RUN; then
      info "[dry-run] rm -rf $CACHE_DIR"
    else
      rm -rf "$CACHE_DIR"
      ok "Removed cache dir: $CACHE_DIR"
    fi
  fi

  if $PURGE; then
    info "Purging config and state..."
    for d in "$CONFIG_DIR" "$STATE_DIR"; do
      if [[ -d "$d" ]]; then
        if $DRY_RUN; then
          info "[dry-run] rm -rf $d"
        else
          rm -rf "$d"
          ok "Purged: $d"
        fi
      fi
    done
  else
    info "Config ($CONFIG_DIR) and state ($STATE_DIR) preserved. Use --purge to remove."
  fi

  ok "Uninstall complete."
}

# ── Install ─────────────────────────────────────────────────────────
do_install() {
  info "Installing $PRODUCT v$VERSION..."
  echo ""

  # 1. Check Node.js
  if ! command -v node &>/dev/null; then
    die "Node.js is required but not found in PATH."
  fi
  ok "Node.js found: $(node --version)"

  # 2. Check opencode CLI (warn only)
  if command -v opencode &>/dev/null; then
    ok "opencode CLI found"
  else
    warn "opencode CLI not found in PATH (not required, but recommended)"
  fi

  # 3. Check Python3 (warn only)
  if command -v python3 &>/dev/null; then
    ok "python3 found: $(python3 --version 2>&1)"
  else
    warn "python3 not found (provider-usage tool will not work)"
  fi

  # 4. Build
  local dist_dir="$SOURCE_APP_DIR/dist"
  if $SKIP_BUILD && [[ -d "$dist_dir" ]]; then
    info "Skipping build (--skip-build, dist/ exists)"
  else
    if [[ ! -d "$SOURCE_APP_DIR" ]]; then
      die "Source directory not found: $SOURCE_APP_DIR"
    fi
    if $DRY_RUN; then
      info "[dry-run] cd $SOURCE_APP_DIR && npm install && npm run build"
    else
      info "Building web client..."
      (cd "$SOURCE_APP_DIR" && npm install && npm run build)
      ok "Build complete"
    fi
  fi

  # 5. Create directories
  for d in "$DATA_DIR" "$STATE_DIR" "$CONFIG_DIR" "$CACHE_DIR" "$LOG_DIR" "$BIN_DIR"; do
    ensure_dir "$d"
  done

  # 6–7. Copy dist
  if ! $DRY_RUN && [[ ! -d "$dist_dir/server" && ! -d "$dist_dir/client" ]]; then
    die "dist/server or dist/client not found. Build may have failed."
  fi
  copy_dir "$dist_dir/server" "$DATA_DIR/server"
  copy_dir "$dist_dir/client" "$DATA_DIR/client"
  ok "Copied runtime bundle → $DATA_DIR"

  # 8. Copy provider-usage tool
  copy_file "$SOURCE_APP_DIR/assets/tools/provider-usage.py" "$DATA_DIR/tools/provider-usage.py"
  ok "Copied provider-usage.py → $DATA_DIR/tools/"

  # 9. Create CLI shim
  if $DRY_RUN; then
    info "[dry-run] create CLI shim: $BIN_SHIM"
  else
    mkdir -p "$BIN_DIR"
    cat > "$BIN_SHIM" <<SHIM
#!/usr/bin/env bash
exec node "$DATA_DIR/server/main.js" "\$@"
SHIM
    chmod +x "$BIN_SHIM"
    ok "Created CLI shim: $BIN_SHIM"
  fi

  # 10. Install OpenCode managed assets
  install_managed_asset \
    "$SOURCE_APP_DIR/assets/opencode/plugins/effort-control.js" \
    "$OPENCODE_CONFIG_DIR/plugins/effort-control.js" \
    "effort-control plugin" "js"

  install_managed_asset \
    "$SOURCE_APP_DIR/assets/opencode/plugins/effort-control/state.js" \
    "$OPENCODE_CONFIG_DIR/plugins/effort-control/state.js" \
    "effort-control state helper" "js"

  install_managed_asset \
    "$SOURCE_APP_DIR/assets/opencode/commands/usage.md" \
    "$OPENCODE_CONFIG_DIR/commands/usage.md" \
    "usage command" "md"

  # 11. Write install manifest
  if $DRY_RUN; then
    info "[dry-run] write manifest: $MANIFEST"
  else
    cat > "$MANIFEST" <<MANIFEST_EOF
{
  "schemaVersion": 1,
  "product": "$PRODUCT",
  "version": "$VERSION",
  "installedAt": "$(timestamp)",
  "source": {
    "repo": "bohewu/agents_pipeline",
    "pathAtInstallTime": "$SCRIPT_DIR"
  },
  "paths": {
    "dataDir": "$DATA_DIR",
    "configDir": "$CONFIG_DIR",
    "stateDir": "$STATE_DIR",
    "cacheDir": "$CACHE_DIR",
    "bin": "$BIN_SHIM",
    "opencodeConfigDir": "$OPENCODE_CONFIG_DIR"
  },
  "assets": {
    "tools": {
      "providerUsagePy": "$DATA_DIR/tools/provider-usage.py"
    },
    "opencode": {
      "effortPlugin": "$OPENCODE_CONFIG_DIR/plugins/effort-control.js",
      "effortStateHelper": "$OPENCODE_CONFIG_DIR/plugins/effort-control/state.js",
      "usageCommand": "$OPENCODE_CONFIG_DIR/commands/usage.md"
    }
  }
}
MANIFEST_EOF
    ok "Wrote install manifest: $MANIFEST"
  fi

  # 12. Summary
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ok "$PRODUCT v$VERSION installed successfully!"
  echo ""
  info "Paths:"
  info "  Binary:    $BIN_SHIM"
  info "  Data:      $DATA_DIR"
  info "  Config:    $CONFIG_DIR"
  info "  State:     $STATE_DIR"
  info "  Cache:     $CACHE_DIR"
  info "  Logs:      $LOG_DIR"
  info "  Manifest:  $MANIFEST"
  echo ""
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
    warn "$BIN_DIR is not in your PATH. Add it:"
    warn "  export PATH=\"$BIN_DIR:\$PATH\""
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Main dispatch ───────────────────────────────────────────────────
if $UNINSTALL; then
  do_uninstall
else
  do_install
fi
