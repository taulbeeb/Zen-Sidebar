#!/usr/bin/env bash
set -euo pipefail

# ─── Zen Sidebar Installer ──────────────────────────────────────
# Installs Zen Sidebar web panels into your Zen Browser profile.
# Usage: ./install.sh [profile-path]
# ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_CHROME="$SCRIPT_DIR/chrome"

# ── Detect OS and default profile root ───────────────────────────

detect_profile_root() {
  case "$(uname -s)" in
    Darwin)
      echo "$HOME/Library/Application Support/zen"
      ;;
    Linux)
      if [ -d "$HOME/.zen" ]; then
        echo "$HOME/.zen"
      elif [ -d "$HOME/.var/app/app.zen_browser.zen/zen" ]; then
        echo "$HOME/.var/app/app.zen_browser.zen/zen"
      else
        echo "$HOME/.zen"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "$APPDATA/zen"
      ;;
    *)
      echo ""
      ;;
  esac
}

# ── Find the default profile ─────────────────────────────────────

find_default_profile() {
  local root="$1"
  local profiles_ini="$root/profiles.ini"

  if [ ! -f "$profiles_ini" ]; then
    # No profiles.ini, try to find any profile directory
    local first_profile
    first_profile=$(find "$root" -maxdepth 1 -type d -name "*.default*" 2>/dev/null | head -1)
    if [ -n "$first_profile" ]; then
      echo "$first_profile"
      return
    fi
    # Try Profiles subdirectory
    first_profile=$(find "$root/Profiles" -maxdepth 1 -type d 2>/dev/null | tail -1)
    if [ -n "$first_profile" ]; then
      echo "$first_profile"
      return
    fi
    return 1
  fi

  # Parse profiles.ini for the default profile
  local rel_path=""
  local is_relative=""
  local in_default=""

  while IFS='=' read -r key value; do
    key=$(echo "$key" | tr -d '[:space:]')
    value=$(echo "$value" | tr -d '[:space:]' | tr -d $'\r')
    case "$key" in
      "[Profile"*) in_default="" ;;
      "Default") [ "$value" = "1" ] && in_default="1" ;;
      "Path") rel_path="$value" ;;
      "IsRelative") is_relative="$value" ;;
    esac
    if [ -n "$in_default" ] && [ -n "$rel_path" ]; then
      break
    fi
  done < "$profiles_ini"

  # If no Default=1 found, use first profile
  if [ -z "$rel_path" ]; then
    while IFS='=' read -r key value; do
      key=$(echo "$key" | tr -d '[:space:]')
      value=$(echo "$value" | tr -d '[:space:]' | tr -d $'\r')
      if [ "$key" = "Path" ]; then
        rel_path="$value"
        break
      fi
    done < "$profiles_ini"
  fi

  if [ -z "$rel_path" ]; then
    return 1
  fi

  if [ "$is_relative" = "1" ] || [ -z "$is_relative" ]; then
    echo "$root/$rel_path"
  else
    echo "$rel_path"
  fi
}

# ── Main ─────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════╗"
echo "║     Zen Sidebar - Web Panels         ║"
echo "║     Installer                        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Determine target profile
PROFILE_DIR=""

if [ -n "${1:-}" ]; then
  PROFILE_DIR="$1"
else
  PROFILE_ROOT=$(detect_profile_root)
  if [ -z "$PROFILE_ROOT" ]; then
    echo "Error: Could not detect Zen Browser profile location."
    echo "Please provide the profile path manually:"
    echo "  ./install.sh /path/to/zen/profile"
    echo ""
    echo "You can find it via about:profiles in Zen Browser."
    exit 1
  fi

  echo "Detected Zen profile root: $PROFILE_ROOT"

  if [ ! -d "$PROFILE_ROOT" ]; then
    echo "Error: Profile root not found at $PROFILE_ROOT"
    echo "Please provide the profile path manually:"
    echo "  ./install.sh /path/to/zen/profile"
    exit 1
  fi

  PROFILE_DIR=$(find_default_profile "$PROFILE_ROOT") || true
  if [ -z "$PROFILE_DIR" ] || [ ! -d "$PROFILE_DIR" ]; then
    echo "Error: Could not find a default profile in $PROFILE_ROOT"
    echo ""
    echo "Available profiles:"
    find "$PROFILE_ROOT" -maxdepth 2 -type d -name "*.default*" 2>/dev/null || true
    ls -d "$PROFILE_ROOT/Profiles"/*/ 2>/dev/null || true
    echo ""
    echo "Please provide the profile path manually:"
    echo "  ./install.sh /path/to/zen/profile"
    exit 1
  fi
fi

echo "Target profile: $PROFILE_DIR"
echo ""

# Verify source files exist
if [ ! -d "$SRC_CHROME/JS/zen_sidebar" ]; then
  echo "Error: Source files not found. Run this script from the Zen-Sidebar directory."
  exit 1
fi

# Create chrome/JS directory if needed
CHROME_DIR="$PROFILE_DIR/chrome"
JS_DIR="$CHROME_DIR/JS"
mkdir -p "$JS_DIR/zen_sidebar"

# Copy files
echo "Installing files..."

cp "$SRC_CHROME/JS/zen_sidebar.uc.mjs" "$JS_DIR/zen_sidebar.uc.mjs"
echo "  ✓ JS/zen_sidebar.uc.mjs"

for f in sidebar.mjs panel_manager.mjs toolbar.mjs web_panel.mjs; do
  cp "$SRC_CHROME/JS/zen_sidebar/$f" "$JS_DIR/zen_sidebar/$f"
  echo "  ✓ JS/zen_sidebar/$f"
done

# Copy sidebar.css if it exists (may not be used but include for completeness)
if [ -f "$SRC_CHROME/JS/zen_sidebar/sidebar.css" ]; then
  cp "$SRC_CHROME/JS/zen_sidebar/sidebar.css" "$JS_DIR/zen_sidebar/sidebar.css"
  echo "  ✓ JS/zen_sidebar/sidebar.css"
fi

# Merge userChrome.css if it exists
if [ -f "$SRC_CHROME/userChrome.css" ]; then
  if [ -f "$CHROME_DIR/userChrome.css" ]; then
    # Check if already has our content
    if ! grep -q "zen-sidebar-box" "$CHROME_DIR/userChrome.css" 2>/dev/null; then
      echo "" >> "$CHROME_DIR/userChrome.css"
      cat "$SRC_CHROME/userChrome.css" >> "$CHROME_DIR/userChrome.css"
      echo "  ✓ Appended to existing userChrome.css"
    else
      echo "  ⊘ userChrome.css already contains Zen Sidebar rules"
    fi
  else
    cp "$SRC_CHROME/userChrome.css" "$CHROME_DIR/userChrome.css"
    echo "  ✓ userChrome.css"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Installation complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Make sure you have a userChrome.js loader installed"
echo "     (e.g. fx-autoconfig or similar)"
echo "  2. Restart Zen Browser"
echo "  3. Press Ctrl+Shift+E (Cmd+Shift+E on Mac) to toggle"
echo ""
echo "To uninstall, remove these from your profile:"
echo "  chrome/JS/zen_sidebar.uc.mjs"
echo "  chrome/JS/zen_sidebar/"
echo ""
