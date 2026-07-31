import { execSync } from 'child_process';
import logger from '../../utils/logger';
/**
 * unlockDevice.js
 *
 * Programmatic device unlock utility for Android emulator lock screen.
 *
 * Integrates with Appium + ADB to detect lock screen state and unlock
 * before/during session creation.  Designed to be called from:
 *   - Before hooks (hooks.js)
 *   - MobileSessionManager._prepareAndroidSession()
 *   - Standalone ADB scripts
 *
 * Lock Screen Detection:
 *   Uses `adb shell dumpsys window policy` to check keyguard state.
 *   If the device shows time/date/swipe-to-unlock, it is considered locked.
 *
 * Unlock Strategies (in order of attempted):
 *   1. Appium mobile: unlock (programmatic swipe from bottom)
 *   2. ADB input keyevent (KEYCODE_WAKEUP, KEYCODE_MENU, swipe)
 *   3. ADB am start (launch home screen)
 *   4. settings put secure lockscreen.disabled (permanent fix)
 */


const ADB_TIMEOUT_MS = 15000;

/**
 * Check if the Android emulator lock screen is currently showing.
 * Returns true if locked, false if unlocked.
 */
function isDeviceLocked() {
  try {
    const output = execSync(
      'adb shell dumpsys window policy 2>/dev/null | grep -iE "isStatusBarKeyguard|mShowLockscreen|isKeyguard|showingKeyguard"',
      { encoding: 'utf8', timeout: ADB_TIMEOUT_MS }
    ).trim().toLowerCase();

    // The keyguard state lines look like:
    //   isStatusBarKeyguard=false   → NOT locked
    //   isStatusBarKeyguard=true    → locked
    //   mShowLockscreen=false       → NOT locked
    //   mShowLockscreen=true        → locked
    //   showingKeyguard=true        → locked
    //   isKeyguardShowing=true      → locked
    if (!output) {
      // Try dumpsys power for deeper sleep state
      const sleepOutput = execSync(
        'adb shell dumpsys power 2>/dev/null | grep -iE "mScreenOn|mWakefulness|Display Power" | head -5',
        { encoding: 'utf8', timeout: 5000 }
      ).trim().toLowerCase();

      // If screen is off, treat as locked
      if (sleepOutput.includes('mScreenOn=false') || sleepOutput.includes('off')) {
        return true;
      }
      return false;
    }

    const isLocked = output.includes('=true') || output.includes('showing=true');
    return isLocked;
  } catch (err: any) {
    logger.warn(`[unlockDevice] isDeviceLocked check failed: ${err.message}`);
    return false; // Assume unlocked on error
  }
}

/**
 * Check if the device screen is on/awake.
 */
function isScreenOn() {
  try {
    const power = execSync(
      'adb shell dumpsys power 2>/dev/null | grep -iE "mScreenOn|mWakefulness|Display Power" | head -3',
      { encoding: 'utf8', timeout: 5000 }
    ).trim().toLowerCase();

    const on = power.includes('mScreenOn=true')
      || power.includes('mWakefulness=awake')
      || power.includes('on=true')
      || power.includes('state=on');
    return on;
  } catch (_: any) {
    return false;
  }
}

/**
 * Wake up the device screen (if asleep).
 */
function wakeScreen() {
  try {
    execSync('adb shell input keyevent KEYCODE_WAKEUP 2>/dev/null || true', { timeout: 3000 });
    execSync('adb shell input keyevent 224 2>/dev/null || true', { timeout: 3000 }); // KEYCODE_WAKEUP (numeric)
    return true;
  } catch (_: any) {
    return false;
  }
}

/**
 * Perform physical swipe to dismiss lock screen.
 * Most Android emulators use swipe-up to unlock.
 */
function swipeUnlock() {
  try {
    // Get device resolution for accurate swipe coordinates
    let width = 1080, height = 1920; // sensible defaults
    try {
      const sizeOut = execSync(
        'adb shell wm size 2>/dev/null | head -1',
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      const match = sizeOut.match(/(\d+)x(\d+)/);
      if (match) {
        width = parseInt(match[1], 10);
        height = parseInt(match[2], 10);
      }
    } catch (_: any) {}

    const midX = Math.floor(width / 2);
    const startY = Math.floor(height * 0.8);
    const endY = Math.floor(height * 0.3);
    const duration = 300;

    // Swipe up from bottom center to unlock
    const cmd = `adb shell input touchscreen swipe ${midX} ${startY} ${midX} ${endY} ${duration} 2>/dev/null || true`;
    execSync(cmd, { timeout: 5000 });
    logger.info(`[unlockDevice] Swipe unlock performed (${midX},${startY} -> ${midX},${endY})`);
    return true;
  } catch (err: any) {
    logger.warn(`[unlockDevice] Swipe unlock failed: ${err.message}`);
    return false;
  }
}

/**
 * Dismiss lock screen by simulating menu key (KEYCODE_MENU = 82).
 * This dismisses many lock screen implementations.
 */
function pressMenuToUnlock() {
  try {
    execSync('adb shell input keyevent 82 2>/dev/null || true', { timeout: 3000 }); // KEYCODE_MENU
    return true;
  } catch (_: any) {
    return false;
  }
}

/**
 * Send a PIN unlock sequence (for PIN-locked devices).
 * Assumes PIN is 1234 (default emulator PIN).
 */
function unlockWithPin(pin: any) {
  if (!pin) pin = '1234';
  try {
    // Wake and dismiss
    execSync('adb shell input keyevent KEYCODE_WAKEUP 2>/dev/null || true', { timeout: 2000 });
    execSync('adb shell input keyevent 82 2>/dev/null || true', { timeout: 2000 });
    sleep(500);

    // Type PIN digits
    for (let i = 0; i < pin.length; i++) {
      const digit = pin[i];
      // KEYCODE_0 = 7, KEYCODE_1 = 8, ..., KEYCODE_9 = 16
      // But for PIN entry, just use tap events on number positions
      // Simpler: use adb shell input text
      execSync(`adb shell input text "${digit}" 2>/dev/null || true`, { timeout: 2000 });
      sleep(200);
    }

    // Press Enter (KEYCODE_ENTER = 66)
    execSync('adb shell input keyevent 66 2>/dev/null || true', { timeout: 2000 });
    logger.info('[unlockDevice] PIN unlock sequence sent');
    return true;
  } catch (err: any) {
    logger.warn(`[unlockDevice] PIN unlock failed: ${err.message}`);
    return false;
  }
}

/**
 * Navigate to home screen (dismisses any current activity).
 */
function goHome() {
  try {
    execSync('adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null || true', { timeout: 5000 });
    execSync('adb shell input keyevent KEYCODE_HOME 2>/dev/null || true', { timeout: 3000 });
    return true;
  } catch (_: any) {
    return false;
  }
}

/**
 * Suppress heads-up notifications, enable DND mode, and collapse the notification shade/drawer.
 */
function disableNotificationsAndCollapseShade() {
  try {
    logger.info('[unlockDevice] Silencing notifications and collapsing status bar shade...');
    const commands = [
      'adb shell settings put global heads_up_notifications_enabled 0 2>/dev/null || true',
      'adb shell settings put global zen_mode 2 2>/dev/null || true',
      'adb shell settings put global policy_control immersive.status=* 2>/dev/null || true',
      'adb shell cmd statusbar collapse 2>/dev/null || adb shell service call statusbar 2 2>/dev/null || true',
    ];
    for (const cmd of commands) {
      try {
        execSync(cmd, { timeout: 3000 });
      } catch (_: any) {}
    }
  } catch (err: any) {
    logger.warn(`[unlockDevice] Failed to apply notification settings: ${err.message}`);
  }
}

/**
 * Programmatically disable the lock screen permanently via ADB.
 * Same as the disable-android-lockscreen.sh script.
 */
function permanentlyDisableLockScreen() {
  try {
    logger.info('[unlockDevice] Permanently disabling lock screen via ADB...');

    // Also silence notifications and collapse shade as part of permanent lockscreen setup
    disableNotificationsAndCollapseShade();

    const commands = [
      'adb shell locksettings clear --old 1234 2>/dev/null || true',
      'adb shell locksettings clear 2>/dev/null || true',
      'adb shell locksettings set disabled 2>/dev/null || true',
      'adb shell settings put secure lockscreen.disabled true 2>/dev/null || true',
      'adb shell settings put secure lock_screen_allow_private_notifications 0 2>/dev/null || true',
      'adb shell settings put global device_policy_disable_lockscreen 1 2>/dev/null || true',
      'adb shell settings put secure lock_pattern_autolock 0 2>/dev/null || true',
      'adb shell settings put secure lock_pin_autolock 0 2>/dev/null || true',
      'adb shell settings put secure lockscreen.password_type 0 2>/dev/null || true',
      'adb shell settings put global device_provisioned 1 2>/dev/null || true',
      'adb shell svc power stayon true 2>/dev/null || true',
      'adb shell settings put global stay_on_while_plugged_in 3 2>/dev/null || true',
    ];

    for (const cmd of commands) {
      try {
        execSync(cmd, { timeout: 5000 });
      } catch (_: any) {
        // Individual command failures are non-fatal
      }
    }

    logger.info('[unlockDevice] Lock screen permanent disable commands sent');
    return true;
  } catch (err: any) {
    logger.warn(`[unlockDevice] Permanent disable failed: ${err.message}`);
    return false;
  }
}

function sleep(ms: any) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

/**
 * Main unlock function — orchestrates all unlock strategies.
 * Can be called before creating Appium session or in Before hooks.
 *
 * @param {Object} driver - Optional Appium driver (if session already exists)
 * @param {Object} options
 * @param {string} options.pin - PIN code for locked devices (default: 1234)
 * @param {boolean} options.permanent - Whether to permanently disable lock screen
 * @returns {boolean} true if device is now unlocked
 */
async function ensureDeviceUnlocked(driver: any, options: any) {
  if (!options) options = {};
  const pin = options.pin || '1234';
  const permanent = options.permanent !== false; // default true

  // Suppress heads-up notifications & collapse notification panel
  disableNotificationsAndCollapseShade();

  logger.info('[unlockDevice] Checking device lock state...');

  // Step 1: Wake screen if asleep
  if (!isScreenOn()) {
    logger.info('[unlockDevice] Screen is off, waking...');
    wakeScreen();
    sleep(1000);
  }

  // Step 2: Check lock status
  if (!isDeviceLocked()) {
    logger.info('[unlockDevice] Device is already unlocked, no action needed');
    return true;
  }

  logger.info('[unlockDevice] Device is LOCKED — attempting to unlock...');

  // Step 3: Try Appium's built-in unlock (if driver provided)
  if (driver) {
    try {
      logger.info('[unlockDevice] Trying Appium mobile: unlock...');
      await driver.execute('mobile: unlock');
      sleep(1500);
      if (!isDeviceLocked()) {
        logger.info('[unlockDevice] Unlocked via Appium mobile:unlock');
        return true;
      }
    } catch (err: any) {
      logger.warn(`[unlockDevice] Appium unlock failed: ${err.message}`);
    }
  }

  // Step 4: Try swipe unlock (most emulators use swipe)
  logger.info('[unlockDevice] Trying swipe unlock...');
  swipeUnlock();
  sleep(1000);

  if (!isDeviceLocked()) {
    logger.info('[unlockDevice] Unlocked via swipe');
    return true;
  }

  // Step 5: Try KEYCODE_MENU (dismisses many lock screens)
  logger.info('[unlockDevice] Trying KEYCODE_MENU...');
  pressMenuToUnlock();
  sleep(500);
  swipeUnlock();  // swipe after menu press
  sleep(1000);

  if (!isDeviceLocked()) {
    logger.info('[unlockDevice] Unlocked via KEYCODE_MENU + swipe');
    return true;
  }

  // Step 6: Try PIN unlock
  logger.info(`[unlockDevice] Trying PIN unlock (${pin})...`);
  unlockWithPin(pin);
  sleep(1000);

  if (!isDeviceLocked()) {
    logger.info('[unlockDevice] Unlocked via PIN');
    return true;
  }

  // Step 7: Go home and try again
  logger.info('[unlockDevice] Going home...');
  goHome();
  sleep(1000);

  if (!isDeviceLocked()) {
    logger.info('[unlockDevice] Unlocked via home navigation');
    return true;
  }

  // Step 8: Permanent disable as last resort
  if (permanent) {
    logger.info('[unlockDevice] Final attempt: permanently disabling lock screen...');
    permanentlyDisableLockScreen();
    sleep(2000);

    // Try swipe again after permanent disable
    swipeUnlock();
    sleep(1000);
  }

  const finalStatus = !isDeviceLocked();
  if (finalStatus) {
    logger.info('[unlockDevice] Device successfully unlocked');
  } else {
    logger.warn('[unlockDevice] All unlock attempts exhausted — device may still be locked');
  }

  return finalStatus;
}

/**
 * Quick one-shot unlock — no Appium driver needed, uses ADB only.
 * Useful in Before hooks before session creation.
 */
function unlockViaAdb(pin: any) {
  if (!pin) pin = '1234';

  // Suppress heads-up notifications & collapse notification panel
  disableNotificationsAndCollapseShade();

  if (isDeviceLocked()) {
    logger.info('[unlockDevice] Unlocking device via ADB...');
    wakeScreen();
    sleep(500);
    pressMenuToUnlock();
    sleep(300);
    swipeUnlock();
    sleep(500);

    if (isDeviceLocked()) {
      unlockWithPin(pin);
      sleep(500);
    }

    if (isDeviceLocked()) {
      permanentlyDisableLockScreen();
      sleep(1000);
      swipeUnlock();
    }

    goHome();
    return !isDeviceLocked();
  }

  return true;
}

export { isDeviceLocked, isScreenOn, wakeScreen, swipeUnlock, pressMenuToUnlock, unlockWithPin, goHome, permanentlyDisableLockScreen, ensureDeviceUnlocked, unlockViaAdb, disableNotificationsAndCollapseShade };
export default { isDeviceLocked: isDeviceLocked, isScreenOn: isScreenOn, wakeScreen: wakeScreen, swipeUnlock: swipeUnlock, pressMenuToUnlock: pressMenuToUnlock, unlockWithPin: unlockWithPin, goHome: goHome, permanentlyDisableLockScreen: permanentlyDisableLockScreen, ensureDeviceUnlocked: ensureDeviceUnlocked, unlockViaAdb: unlockViaAdb, disableNotificationsAndCollapseShade: disableNotificationsAndCollapseShade };
