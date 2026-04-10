#!/usr/bin/env bash
set -euo pipefail

# ─── Zen Sidebar Uninstaller ────────────────────────────────────
# Removes Zen Sidebar from your Zen Browser profile.
# Usage: ./uninstall.sh [profile-path]
# ─────────────────────────────────────────────────────────────────

detect_profile_root() {
  case "$(uname -s)" in
    Darwin)  echo "$HOME/Library/Application Support/zen" ;;
    Linux)
      if [ -d "$HOME/.zen" ]; then echo "$HOME/.zen"
      elif [ -d "$HOME/.var/app/app.zen_browser.zen/zen" ]; then echo "$HOME/.var/app/app.zen_browser.zen/zen"
      else echo "$HOME/.zen"; fi ;;
    MINGW*|MSYS*|CYGWIN*) echo "$APPDATA/zen" ;;
    *) echo "" ;;
  esac
}

find_default_profile() {
  local root="$1"
  local profiles_ini="$root/profiles.ini"
  if [ ! -f "$profiles_ini" ]; then
    find "$root" -maxdepth 1 -type d -name "*.default*" 2>/dev/null | head -1
    return
  fi
  local rel_path=""
  while IFS='=' read -r key value; do
    key=$(echo "$key" | tr -d '[:space:]')
    value=$(echo "$value" | tr -d '[:space:]' | tr -d $'\r')
    [ "$key" = "Path" ] && rel_path="$value" && break
  done < "$profiles_ini"
  [ -n "$rel_path" ] && echo "$root/$rel_path"
}

PROFILE_DIR="${1:-}"
if [ -z "$PROFILE_DIR" ]; then
  PROFILE_ROOT=$(detect_profile_root)
  PROFILE_DIR=$(find_default_profile "$PROFILE_ROOT") || true
fi

if [ -z "$PROFILE_DIR" ] || [ ! -d "$PROFILE_DIR" ]; then
  echo "Error: Could not find Zen profile. Provide path: ./uninstall.sh /path/to/profile"
  exit 1
fi

echo "Uninstalling Zen Sidebar from: $PROFILE_DIR"
echo ""

CHROME="$PROFILE_DIR/chrome"

[ -f "$CHROME/JS/zen_sidebar.uc.js" ] && rm "$CHROME/JS/zen_sidebar.uc.js" && echo "  Removed JS/zen_sidebar.uc.js"
# Clean up legacy modular install if present
[ -f "$CHROME/JS/zen_sidebar.uc.mjs" ] && rm "$CHROME/JS/zen_sidebar.uc.mjs" && echo "  Removed JS/zen_sidebar.uc.mjs"
[ -d "$CHROME/JS/zen_sidebar" ] && rm -rf "$CHROME/JS/zen_sidebar" && echo "  Removed JS/zen_sidebar/"

echo ""
echo "Done. Restart Zen Browser to complete uninstallation."
echo "Your panel data is still in about:config (zen.sidebar.panels) if you want to clean that up."
