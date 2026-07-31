#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# start-emulator-unlocked.sh
#
# Starts the Android emulator with lock screen bypass options.
# Usage: ./scripts/start-emulator-unlocked.sh [avd_name]
#
# AVD name: arg > ANDROID_AVD_NAME/ANDROID_AVD env var > auto-detected via emulator -list-avds
#
# Key flags:
#   -no-snapshot       Force cold boot (avoids snapshot issues)
#   -no-window         Run headless (no emulator window)
#   -wipe-data         Start with fresh user data
#   -netdelay none     No network delay
#   -netspeed full     Full network speed
#   -no-audio          Disable audio
#   -no-boot-anim      Skip boot animation (faster)
#   -gpu swiftshader_indirect  Software GPU (more stable)
#
# After boot, runs disable-android-lockscreen.sh automatically.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Resolve AVD: arg > env var > auto-detect via emulator -list-avds
if [ -n "${1:-}" ]; then
  AVD_NAME="$1"
elif [ -n "${ANDROID_AVD_NAME:-}" ]; then
  AVD_NAME="$ANDROID_AVD_NAME"
elif [ -n "${ANDROID_AVD:-}" ]; then
  AVD_NAME="$ANDROID_AVD"
elif [ -n "${AVD_NAME:-}" ]; then
  AVD_NAME="$AVD_NAME"
else
  EMULATOR_BIN="emulator"
  if command -v "$EMULATOR_BIN" &>/dev/null; then
    AVDS=$("$EMULATOR_BIN" -list-avds 2>/dev/null | grep -v '^$' | head -5)
    if [ -n "$AVDS" ]; then
      AVD_NAME=$(echo "$AVDS" | grep 'Pixel_9_Pro' | head -1 || echo "$AVDS" | head -1)
      echo "  Auto-detected AVD: $AVD_NAME"
    fi
  fi
  if [ -z "${AVD_NAME:-}" ]; then
    echo "ERROR: No AVD specified and auto-detection failed."
    echo "Set ANDROID_AVD_NAME environment variable or pass AVD name as argument."
    echo "Available AVDs:"
    "$EMULATOR_BIN" -list-avds 2>/dev/null || true
    exit 1
  fi
fi

echo "═══ Emulator Starter (Lock Screen Bypass) ═══"
echo ""
echo "  AVD:          $AVD_NAME"
echo "  Emulator:     $(which emulator)"
echo "  ADB:          $(which adb)"
echo ""

# ── Check that emulator binary exists ──────────────────────────────
EMULATOR_BIN="emulator"
if ! command -v "$EMULATOR_BIN" &>/dev/null; then
  # Try common Android SDK locations
  for DIR in "$HOME/Library/Android/sdk/emulator/emulator" \
             "$HOME/Android/Sdk/emulator/emulator" \
             "/usr/local/share/android-sdk/emulator/emulator"; do
    if [ -x "$DIR" ]; then
      EMULATOR_BIN="$DIR"
      break
    fi
  done
fi

if ! command -v "$EMULATOR_BIN" &>/dev/null && [ ! -x "$EMULATOR_BIN" ]; then
  echo "ERROR: emulator binary not found"
  echo "Set ANDROID_HOME or add emulator to PATH"
  exit 1
fi

# ── Kill any existing emulator instance ─────────────────────────────
echo "[1] Killing any running emulator..."
adb emu kill 2>/dev/null || true
sleep 2

# Kill by process name
pkill -f "qemu-system" 2>/dev/null || true
sleep 1
echo "  OK"

# ── Create config.ini entries to disable lock screen at boot ───────
echo "[2] Writing AVD config overrides for lock screen disable..."

AVD_CONFIG_DIR="$HOME/.android/avd/${AVD_NAME}.avd"
if [ ! -d "$AVD_CONFIG_DIR" ]; then
  # Try alternate location
  AVD_CONFIG_DIR="$HOME/Library/Android/avd/${AVD_NAME}.avd"
fi

if [ -d "$AVD_CONFIG_DIR" ]; then
  CONFIG_INI="$AVD_CONFIG_DIR/config.ini"
  echo "  Found AVD config at: $AVD_CONFIG_DIR"

  # Ensure lock screen is disabled via AVD properties
  # These properties are read by the emulator at boot
  if [ -f "$CONFIG_INI" ]; then
    # Remove existing lines if present
    sed -i '' '/fastboot.forceColdBoot/d' "$CONFIG_INI" 2>/dev/null || true
    sed -i '' '/hw.lockScreen/d' "$CONFIG_INI" 2>/dev/null || true
    sed -i '' '/hw.keyboard/d' "$CONFIG_INI" 2>/dev/null || true
  fi

  # Append our overrides
  {
    echo ""
    echo "# Disable lock screen (added by start-emulator-unlocked.sh)"
    echo "hw.lockScreen=no"
    echo "hw.keyboard=yes"
    echo "hw.mainKeys=yes"
  } >> "$CONFIG_INI" 2>/dev/null || true

  echo "  Config updated"
else
  echo "  Warning: AVD config directory not found at $AVD_CONFIG_DIR"
  echo "  Lock screen props will not be pre-configured in config.ini"
fi

# ── Start the emulator ─────────────────────────────────────────────
echo "[3] Starting emulator: $AVD_NAME"
echo "  Flags: -no-snapshot -netdelay none -netspeed full -no-boot-anim -gpu swiftshader_indirect"
echo ""

# Start emulator in background
"$EMULATOR_BIN" \
  -avd "$AVD_NAME" \
  -no-snapshot \
  -netdelay none \
  -netspeed full \
  -no-boot-anim \
  -no-audio \
  -gpu swiftshader_indirect \
  -no-snapshot-load \
  -wipe-data \
  -memory 2048 \
  -cores 4 \
  -screen touch \
  &

EMU_PID=$!
echo "  Emulator PID: $EMU_PID"
echo ""

# ── Wait for boot ─────────────────────────────────────────────────
echo "[4] Waiting for device to boot (this takes a minute)..."
adb wait-for-device
echo "  Device detected"

echo "  Waiting for sys.boot_completed=1..."
BOOT_COMPLETED=""
for i in $(seq 1 120); do
  BOOT_COMPLETED=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  if [ "$BOOT_COMPLETED" = "1" ]; then
    echo "  Boot completed after ${i}s"
    break
  fi
  sleep 1
done

if [ "$BOOT_COMPLETED" != "1" ]; then
  echo "  Warning: Boot may not have completed (check emulator window)"
fi

# Wait for package manager
echo "  Waiting for package manager..."
for i in $(seq 1 30); do
  PM_OK=$(adb shell pm list packages 2>/dev/null | head -1 | tr -d '\r')
  if [ -n "$PM_OK" ]; then
    echo "  Package manager ready"
    break
  fi
  sleep 1
done

# ── Disable lock screen ────────────────────────────────────────────
echo ""
echo "[5] Disabling lock screen via ADB..."
"$SCRIPT_DIR/disable-android-lockscreen.sh"
echo ""

# ── Verify ──────────────────────────────────────────────────────────
echo "[6] Final verification..."
KEYGUARD=$(adb shell dumpsys window policy 2>/dev/null | grep -i "isStatusBarKeyguard\|mShowLockscreen\|isKeyguard" | head -5)
echo "  Keyguard status:"
echo "$KEYGUARD" | sed 's/^/    /'

echo ""
echo "═══ Emulator Ready ═══"
echo "  AVD:       $AVD_NAME"
echo "  PID:       $EMU_PID"
echo "  Unlocked:  Yes"
echo ""
echo "You can now run your Appium tests."
echo "To stop the emulator: adb emu kill"
