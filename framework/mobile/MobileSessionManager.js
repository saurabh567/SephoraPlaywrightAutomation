/**
 * MobileSessionManager — centralized mobile session lifecycle manager.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CRITICAL: Never creates a new Appium session if one already exists.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Session resolution order:
 *   1. Check DriverManager.getSharedDriver() — if exists, reuse it
 *   2. If no shared driver, check if the orchestrator is managing the session
 *   3. Only as FALLBACK, create a new session via MobileDriverFactory
 *
 * Android App Launch Fix (SecurityException workaround):
 *   Amazon Shopping app has a non-exported MAIN/LAUNCHER activity, causing:
 *     java.lang.SecurityException: Permission Denial
 *   Strategy:
 *     1. Suppress Appium/UiAutomator2 own notifications using ADB
 *     2. Launch app via `adb shell monkey -p <package> 1` (package only)
 *     3. Verify app process is alive AFTER launch (pidof check, with retry)
 *     4. Set APPIUM_AUTO_LAUNCH=false so Appium does NOT try to start
 *        the activity (which would fail for non-exported activities)
 *     5. After session creation, re-suppress Appium notifications in-session
 *
 * CRITICAL — NO pm clear for Amazon app:
 *   Clearing app data (adb shell pm clear) causes the Amazon app to crash
 *   on the very next launch because it destroys Google Play Services state.
 *
 * Between-Scenario Cleanup:
 *   - Android: Chrome data only (NOT Amazon — would cause crash)
 *   - iOS: xcrun simctl Safari data removal + terminate
 */

const logger = require('../../utils/logger');
const MobileDriverFactory = require('./MobileDriverFactory');
const DriverManager = require('../../mobile/lifecycle/DriverManager');
const { TEST_PLATFORMS } = require('../common/platforms');
const ExecutionMode = require('../common/ExecutionMode');

const ANDROID_AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const ANDROID_CHROME_PACKAGE = 'com.android.chrome';
const APPIUM_SETTINGS_PACKAGE = 'io.appium.settings';

class MobileSessionManager {
  /**
   * Create or reuse a mobile driver session.
   *
   * ══════════════════════════════════════════════════════════════════
   * PRIMARY: Reuses shared driver from StartupOrchestrator/DriverManager
   * FALLBACK: Creates new session for standalone execution
   * ══════════════════════════════════════════════════════════════════
   *
   * @param {object} config - Test configuration
   * @returns {Promise<object>} WebDriverIO driver
   */
  static async createSession(config) {
    // ══════════════════════════════════════════════════════════════
    // REUSE existing shared driver if available
    // ══════════════════════════════════════════════════════════════
    if (DriverManager.hasDriver()) {
      var sharedDriver = DriverManager.getSharedDriver();
      logger.info('[MobileSessionManager] Reusing shared driver session — no new Appium session created');
      return sharedDriver;
    }

    var platform = config.testPlatform;
    var isAndroid = platform && String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    var isIOS = platform && String(platform).toUpperCase() === TEST_PLATFORMS.IOS;
    var isSafari = isIOS && String(config.mobile.browserName || '').toLowerCase() === 'safari';

    logger.info('[MobileSessionManager] No shared driver — creating new session (standalone mode)');

    if (isSafari) {
      logger.info('[MobileSessionManager] Terminating Safari before session...');
      await MobileSessionManager._terminateSafari();
    }

    if (isAndroid) {
      logger.info('[MobileSessionManager] Preparing Android session...');
      await MobileSessionManager._ensureDeviceUnlocked();
      await MobileSessionManager._prepareAndroidSession(config);
    } else if (isIOS) {
      logger.info('[MobileSessionManager] Creating iOS session...');
    }

    var driver = await MobileDriverFactory.createDriver(config);

    if (isAndroid) {
      driver.__mobilePlatform = 'android';
      await MobileSessionManager._suppressAppiumNotificationsInSession(driver);
    } else if (isIOS) {
      driver.__mobilePlatform = 'ios';
    }

    logger.info('[MobileSessionManager] Session created successfully.');
    return driver;
  }

  /**
   * Create a Safari iOS session (backward compatibility).
   */
  static async createSafariSession(config) {
    if (DriverManager.hasDriver()) {
      logger.info('[MobileSessionManager] Reusing shared driver for Safari session');
      return DriverManager.getSharedDriver();
    }
    return MobileSessionManager.createSession(config);
  }

  /**
   * Ensure the Android device is unlocked before Appium session creation.
   */
  static async _ensureDeviceUnlocked() {
    if (process.env.APPIUM_SKIP_UNLOCK === 'true') {
      logger.info('[MobileSessionManager] Lock screen unlock skipped (APPIUM_SKIP_UNLOCK=true)');
      return;
    }

    try {
      var { execSync } = require('child_process');
      var adbCheck = execSync(
        'adb get-state 2>/dev/null || echo "no-device"',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();

      if (adbCheck === 'no-device' || adbCheck.length === 0) {
        logger.warn('[MobileSessionManager] ADB not available — cannot check lock screen');
        return;
      }
    } catch (_) { return; }

    try {
      const unlockDevice = require('../../mobile/utils/unlockDevice');
      var pin = process.env.APPIUM_UNLOCK_KEY || '1234';
      var unlocked = unlockDevice.unlockViaAdb(pin);
      if (unlocked) {
        logger.info('[MobileSessionManager] Device verified unlocked before session');
      } else {
        logger.warn('[MobileSessionManager] Could not verify device unlocked — proceeding anyway');
      }
    } catch (err) {
      logger.warn('[MobileSessionManager] Lock screen check skipped: ' + err.message);
    }
  }

  /**
   * Phase 1 (pre-session, ADB): Suppress Appium/UiAutomator2 notifications.
   */
  static _suppressAppiumNotificationsAdb() {
    try {
      var { execSync } = require('child_process');
      var commands = [
        'adb shell appops set ' + APPIUM_SETTINGS_PACKAGE + ' POST_NOTIFICATIONS deny 2>/dev/null || true',
        'adb shell appops set ' + APPIUM_SETTINGS_PACKAGE + ' SYSTEM_ALERT_WINDOW deny 2>/dev/null || true',
        'adb shell pm disable ' + APPIUM_SETTINGS_PACKAGE + '/io.appium.settings.notification.NotificationListener 2>/dev/null || true',
        'adb shell cmd notification deny_listener ' + APPIUM_SETTINGS_PACKAGE + ' 2>/dev/null || true',
        'adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS 2>/dev/null || true',
        'adb shell settings put secure default_input_method com.android.inputmethod.latin/.LatinIME 2>/dev/null || true',
        'adb shell ime disable io.appium.settings/.UnicodeIME 2>/dev/null || true',
      ];
      for (var i = 0; i < commands.length; i++) {
        try { execSync(commands[i], { timeout: 2000, shell: true }); } catch (_) {}
      }
      logger.info('[MobileSessionManager] Phase 1: Appium notifications suppressed via ADB');
    } catch (err) {
      logger.warn('[MobileSessionManager] Phase 1 ADB suppression failed: ' + (err.message || 'unknown'));
    }
  }

  /**
   * Phase 2 (post-session, Appium): Re-suppress notifications via Appium driver.
   */
  static async _suppressAppiumNotificationsInSession(driver) {
    if (!driver) return;
    try {
      try {
        await driver.execute('mobile: shell', [{
          command: 'settings',
          args: ['put', 'secure', 'default_input_method', 'com.android.inputmethod.latin/.LatinIME']
        }]);
      } catch (_) {}

      try {
        await driver.execute('mobile: shell', [{
          command: 'ime',
          args: ['disable', 'io.appium.settings/.UnicodeIME']
        }]);
      } catch (_) {}

      try {
        await driver.execute('mobile: shell', [{
          command: 'appops',
          args: ['set', 'io.appium.settings', 'POST_NOTIFICATIONS', 'deny']
        }]);
      } catch (_) {}

      try {
        await driver.execute('mobile: shell', [{
          command: 'appops',
          args: ['set', 'io.appium.settings', 'SYSTEM_ALERT_WINDOW', 'deny']
        }]);
      } catch (_) {}

      try {
        await driver.execute('mobile: shell', [{
          command: 'pm',
          args: ['disable', 'io.appium.settings/io.appium.settings.notification.NotificationListener']
        }]);
      } catch (_) {}

      try {
        await driver.execute('mobile: shell', [{
          command: 'am',
          args: ['broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS']
        }]);
      } catch (_) {}

      logger.info('[MobileSessionManager] Phase 2: Appium notifications re-suppressed in-session');
    } catch (err) {
      logger.warn('[MobileSessionManager] Phase 2 in-session suppression failed: ' + (err.message || 'unknown'));
    }
  }

  /**
   * Check if the Amazon app process is alive via ADB.
   */
  static _isAppProcessAlive(packageName) {
    try {
      var { execSync } = require('child_process');
      var pid = execSync(
        'adb shell pidof ' + packageName + ' 2>/dev/null || true',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      return pid.length > 0;
    } catch (_) { return false; }
  }

  /**
   * Prepare Android session — handles the SecurityException workaround.
   *
   * ══════════════════════════════════════════════════════════════════
   * SKIPS all pre-session ADB work if the orchestrator already
   * launched the app (detected via APPIUM_AUTO_LAUNCH=false or
   * APP_ACTIVITY being set).
   * ══════════════════════════════════════════════════════════════════
   */
  static async _prepareAndroidSession(config) {
    var appPackage = (config.mobile && config.mobile.appPackage) || ANDROID_AMAZON_PACKAGE;
    if (!appPackage) return;

    // Check ADB availability
    var { execSync } = require('child_process');
    var adbAvailable = false;
    try {
      var adbCheck = execSync(
        'adb get-state 2>/dev/null || echo "no-device"',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      adbAvailable = adbCheck !== 'no-device' && adbCheck.length > 0;
    } catch (_) {}

    if (!adbAvailable) {
      logger.warn('[MobileSessionManager] ADB not available — Appium will auto-launch');
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // EARLY EXIT: If lifecycle already launched the app, skip all
    // pre-session ADB work (notification suppression, monkey launch).
    // ══════════════════════════════════════════════════════════════
    if (process.env.APPIUM_AUTO_LAUNCH === 'false' || 
        (process.env.APP_ACTIVITY && process.env.APP_ACTIVITY.trim().length > 0)) {
      logger.info('[MobileSessionManager] App already launched by lifecycle — skipping pre-session ADB work');
      return;
    }

    // ── Phase 1: Suppress Appium/UiAutomator2 notifications ──
    MobileSessionManager._suppressAppiumNotificationsAdb();

    // ══════════════════════════════════════════════════════════════
    // Do NOT clear Amazon app data!
    // Only clear Chrome data (safe for web views).
    // ══════════════════════════════════════════════════════════════
    logger.info('[MobileSessionManager] Clearing Chrome data only (NOT Amazon app data)...');
    try {
      execSync('adb shell pm clear ' + ANDROID_CHROME_PACKAGE + ' 2>/dev/null || true', { timeout: 15000 });
    } catch (_) {}

    // ── Grant notification permission for Amazon app ──
    try {
      execSync('adb shell pm grant ' + appPackage + ' android.permission.POST_NOTIFICATIONS 2>/dev/null || true', { timeout: 10000 });
      logger.info('[MobileSessionManager] Granted notification permission via ADB');
    } catch (_) {}

    // ── Launch the app via adb monkey ──
    logger.info('[MobileSessionManager] Launching app via ADB monkey...');
    try {
      var result = execSync(
        'adb shell monkey -p ' + appPackage + ' -c android.intent.category.LAUNCHER 1 2>/dev/null || true',
        { encoding: 'utf8', timeout: 30000 }
      ).trim();
      var launched = result.includes('Events injected') || result.length > 0;
      if (!launched) {
        logger.warn('[MobileSessionManager] ADB monkey launch returned empty result, trying am start...');
        execSync(
          'adb shell am start -n ' + appPackage + '/com.amazon.mShop.home.HomeActivity 2>/dev/null || true',
          { encoding: 'utf8', timeout: 15000 }
        );
      }
    } catch (_) {
      logger.warn('[MobileSessionManager] ADB monkey launch failed, trying am start...');
      try {
        execSync(
          'adb shell am start -n ' + appPackage + '/com.amazon.mShop.home.HomeActivity 2>/dev/null || true',
          { encoding: 'utf8', timeout: 15000 }
        );
      } catch (e) {
        logger.warn('[MobileSessionManager] All ADB launch methods failed: ' + e.message);
      }
    }

    // ── Wait for app process to appear (with retry) ──
    logger.info('[MobileSessionManager] Waiting for app process to appear...');
    var processAlive = false;
    for (var retry = 0; retry < 10; retry++) {
      await new Promise(function(r) { setTimeout(r, 2000); });
      if (MobileSessionManager._isAppProcessAlive(appPackage)) {
        processAlive = true;
        logger.info('[MobileSessionManager] App process confirmed alive');
        break;
      }
    }

    if (!processAlive) {
      logger.warn('[MobileSessionManager] App process did not appear after launch — may have crashed');
    } else {
      logger.info('[MobileSessionManager] App launched via ADB. Setting APPIUM_AUTO_LAUNCH=false');
      process.env.APPIUM_AUTO_LAUNCH = 'false';
    }
  }

  /**
   * Terminate Safari on iOS simulator.
   */
  static async _terminateSafari() {
    try {
      var { execSync } = require('child_process');
      execSync('xcrun simctl booted terminate com.apple.mobilesafari 2>/dev/null || true', {
        timeout: 10000,
        stdio: 'pipe'
      });
      logger.info('[MobileSessionManager] Safari terminated on simulator');
    } catch (err) {
      logger.warn('[MobileSessionManager] Failed to terminate Safari: ' + err.message);
    }
  }

  /**
   * Get the app identifier for screenshots/reporting.
   */
  static getAppId(config) {
    if (config.testPlatform === TEST_PLATFORMS.ANDROID) {
      return config.mobile.appPackage || ANDROID_AMAZON_PACKAGE;
    }
    if (config.testPlatform === TEST_PLATFORMS.IOS) {
      return config.mobile.bundleId || 'com.apple.mobilesafari';
    }
    return '';
  }
}

module.exports = MobileSessionManager;
