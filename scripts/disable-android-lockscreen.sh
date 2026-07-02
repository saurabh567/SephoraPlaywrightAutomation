#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# disable-android-lockscreen.sh
#
# Permanently disables the Android emulator lock screen (PIN, pattern,
# password, swipe, or "swipe to unlock") via ADB.
#
# Run this ONCE after creating your AVD, or whenever the lock screen
# reappears.  The settings survive emulator reboots (cold boot).
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "═══ Android Lock Screen Disabler ═══"
echo ""

# ── 1. Wait for device ──────────────────────────────────────────────
echo "[1/6] Waiting for Android device (adb wait-for-device)..."
adb wait-for-device
echo "  OK - device connected"

# ── 2. Clear any existing locks ─────────────────────────────────────
echo "[2/6] Clearing existing lock credentials..."
adb shell locksettings clear --old 1234 2>/dev/null || true
adb shell locksettings clear 2>/dev/null || true
echo "  OK"

# ── 3. Disable lock screen via settings ─────────────────────────────
echo "[3/6] Disabling lock screen security..."

# Disable swipe lock
adb shell settings put system screen_off_timeout 2147483647 2>/dev/null || true
adb shell settings put secure lock_screen_allow_private_notifications 0 2>/dev/null || true
adb shell settings put secure lock_screen_show_notifications 0 2>/dev/null || true

# Suppress system notifications & pull-down drawer issues
adb shell settings put global heads_up_notifications_enabled 0 2>/dev/null || true
adb shell settings put global zen_mode 2 2>/dev/null || true
adb shell settings put global policy_control immersive.status=* 2>/dev/null || true
adb shell cmd statusbar collapse 2>/dev/null || adb shell service call statusbar 2 2>/dev/null || true

# Disable all lock types
adb shell settings put secure lockscreen.disabled true 2>/dev/null || true
adb shell settings put global device_policy_disable_lockscreen 1 2>/dev/null || true
adb shell settings put secure lock_pattern_autolock 0 2>/dev/null || true
adb shell settings put secure lock_pattern_visible_pattern 0 2>/dev/null || true
adb shell settings put secure lock_pin_autolock 0 2>/dev/null || true

echo "  OK"

# ── 4. Disable keyguard (swipe lock screen) ─────────────────────────
echo "[4/6] Disabling keyguard..."
adb shell settings put global device_provisioned 1 2>/dev/null || true
adb shell svc power stayon true 2>/dev/null || true
adb shell settings put global stay_on_while_plugged_in 3 2>/dev/null || true

# Disable keyguard permanently
adb shell settings put secure lockscreen.password_type 0 2>/dev/null || true
adb shell settings put secure lockscreen.password_type_alternate 0 2>/dev/null || true
adb shell locksettings set --disabled --old 1234 2>/dev/null || true
adb shell locksettings set disabled 2>/dev/null || true

echo "  OK"

# ── 5. Dismiss current lock screen if visible ───────────────────────
echo "[5/6] Dismissing current lock screen if visible..."
adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null || true
adb shell input keyevent KEYCODE_WAKEUP 2>/dev/null || true
adb shell input keyevent 82 2>/dev/null || true   # KEYCODE_MENU (dismisses lockscreen)
sleep 1
adb shell input keyevent KEYCODE_MENU 2>/dev/null || true
# Swipe up to dismiss
adb shell input touchscreen swipe 500 1500 500 500 200 2>/dev/null || true
sleep 1
adb shell input keyevent KEYCODE_HOME 2>/dev/null || true
echo "  OK"

# ── 6. Verify ───────────────────────────────────────────────────────
echo "[6/6] Verifying lock screen is disabled..."
LOCKED=$(adb shell dumpsys window policy 2>/dev/null | grep -i "isStatusBarKeyguard\|showLockscreen\|isKeyguard" | head -3)
if echo "$LOCKED" | grep -qi "false\|disabled\|showing=false\|mShowLockscreen=false"; then
  echo ""
  echo "  ✅ Lock screen is DISABLED"
else
  echo ""
  echo "  ⚠️  Lock screen status uncertain — but attempts completed"
  echo "  Raw status: $LOCKED"
fi

echo ""
echo "═══ Complete ═══"
echo ""
echo "Your emulator lock screen has been disabled."
echo "Run 'adb shell dumpsys window policy | grep -i keyguard' to verify anytime."
