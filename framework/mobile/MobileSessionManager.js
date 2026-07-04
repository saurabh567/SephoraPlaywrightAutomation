/**
 * MobileSessionManager — centralized mobile session lifecycle manager.
 *
 * Clean linear lifecycle per scenario:
 *
 *   Boot Simulator → Start Appium → Create fresh Session → Execute scenario
 *   → Delete session → Clean app data between scenarios
 *
 * Android App Launch Fix (SecurityException workaround):
 *   Amazon Shopping app has a non-exported MAIN/LAUNCHER activity, causing:
 *     java.lang.SecurityException: Permission Denial
 *   Strategy:
 *     1. Suppress Appium/UiAutomator2 own notifications (io.appium.settings +
 *        qwerty2 keyboard) using ADB appops deny + pm disable
 *     2. Launch app via `adb shell monkey -p <package> 1` (package only)
 *     3. Verify app process is alive AFTER launch (pidof check, with retry)
 *     4. Set APPIUM_AUTO_LAUNCH=false so Appium does NOT try to start
 *        the activity (which would fail for non-exported activities)
 *     5. After session creation, re-suppress Appium notifications in-session
 *        (UiAutomator2 re-creates them during driver init)
 *     6. Fall back to Appium auto-launch if ADB unavailable
 *
 * CRITICAL — NO pm clear for Amazon app:
 *   Clearing app data (adb shell pm clear) causes the Amazon app to crash
 *   on the very next launch because it destroys Google Play Services state,
 *   licensing tokens, and first-launch configuration. This manifests as:
 *     "The first instance of Amazon opens up, then closes immediately"
 *   Chrome data may still be cleared as it doesn't cause this issue.
 *
 * Appium Notification Suppression (two-phase):
 *   Phase 1 (pre-session, ADB): appops deny + pm disable on
 *     io.appium.settings — blocks persistent notification channel.
 *   Phase 2 (post-session, via Appium mobile:shell): re-runs the same
 *     commands through the Appium session. This catches notifications
 *     that UiAutomator2 recreates during session initialization.
 *
 * Lock Screen Handling:
 *   Before preparing the Android session, ensures the device is unlocked
 *   using the unlockDevice utility.  This handles:
 *     - Swipe-to-unlock lock screens
 *     - PIN/pattern/password lock screens
 *     - Screen-off (wakes device first)
 *   Can permanently disable the lock screen via ADB settings.
 *
 * iOS Session:
 *   - Terminates Safari before session creation
 *   - Waits for WEBVIEW context
 *   - Navigates to BASE_URL
 *   - Waits for homepage elements
 *
 * Between-Scenario Cleanup:
 *   - Android: Chrome data only (NOT Amazon — would cause crash)
 *   - iOS: xcrun simctl Safari data removal + terminate
 */

const logger = require('../../utils/logger');
const MobileDriverFactory = require('./MobileDriverFactory');
const { TEST_PLATFORMS } = require('../common/platforms');

const ANDROID_AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const ANDROID_CHROME_PACKAGE = 'com.android.chrome';
const APPIUM_SETTINGS_PACKAGE = 'io.appium.settings';

class MobileSessionManager {
  /**
   * Create a fresh mobile driver session.
   * For Android, handles lock screen unlock + app launch with ADB fallback.
   * For iOS Safari, terminates Safari before session creation.
   */
  static async createSession(config) {
    var platform = config.testPlatform;
    var isAndroid = platform && String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    var isIOS = platform && String(platform).toUpperCase() === TEST_PLATFORMS.IOS;
    var isSafari = isIOS && String(config.mobile.browserName || '').toLowerCase() === 'safari';

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
      // ══════════════════════════════════════════════════════════════
      // Phase 2: Re-suppress Appium notifications in-session
      // UiAutomator2 driver re-creates "Appium Settings" notification and
      // switches to qwerty2 keyboard during session init. Our pre-session
      // ADB suppression may have been overwritten. Run again through
      // Appium's mobile:shell command for definitive suppression.
      // ══════════════════════════════════════════════════════════════
      await MobileSessionManager._suppressAppiumNotificationsInSession(driver);
    } else if (isIOS) {
      driver.__mobilePlatform = 'ios';
    }

    logger.info('[MobileSessionManager] Session created successfully.');
    return driver;
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
   * Phase 1 (pre-session, ADB): Suppress Appium/UiAutomator2 notifications
   * using direct ADB commands. Blocks io.appium.settings notification channel,
   * disables NotificationListener, dismisses qwerty2 keyboard notification.
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
        // Reset default input method from qwerty2 back to AOSP LatinIME
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
   * Phase 2 (post-session, Appium): Re-suppress notifications via the
   * Appium driver's mobile:shell command. This catches notifications
   * that UiAutomator2 re-creates during session initialization.
   *
   * Uses correct Appium mobile:shell format: { command, args[] }.
   * Also resets the default input method away from qwerty2/UnicodeIME
   * to prevent the "qwerty2 configured" system notification caused by
   * UiAutomator2 switching the active IME during session setup.
   */
  static async _suppressAppiumNotificationsInSession(driver) {
    if (!driver) return;
    try {
      // Reset default input method away from qwerty2 (UnicodeIME)
      // UiAutomator2 switches to its own IME during session creation.
      // Resetting to LatinIME (AOSP keyboard) suppresses the notification.
      try {
        await driver.execute('mobile: shell', [{
          command: 'settings',
          args: ['put', 'secure', 'default_input_method', 'com.android.inputmethod.latin/.LatinIME']
        }]);
      } catch (_) {}

      // Disable Appium's UnicodeIME so it can't be re-selected
      try {
        await driver.execute('mobile: shell', [{
          command: 'ime',
          args: ['disable', 'io.appium.settings/.UnicodeIME']
        }]);
      } catch (_) {}

      // Block Appium Settings notification channel
      try {
        await driver.execute('mobile: shell', [{
          command: 'appops',
          args: ['set', 'io.appium.settings', 'POST_NOTIFICATIONS', 'deny']
        }]);
      } catch (_) {}

      // Block Appium Settings system alert window
      try {
        await driver.execute('mobile: shell', [{
          command: 'appops',
          args: ['set', 'io.appium.settings', 'SYSTEM_ALERT_WINDOW', 'deny']
        }]);
      } catch (_) {}

      // Disable notification listener in Appium Settings
      try {
        await driver.execute('mobile: shell', [{
          command: 'pm',
          args: ['disable', 'io.appium.settings/io.appium.settings.notification.NotificationListener']
        }]);
      } catch (_) {}

      // Broadcast CLOSE_SYSTEM_DIALOGS to dismiss any visible system dialogs
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
   * Check if the Amazon app process is alive on the device via ADB.
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
   * CRITICAL: Does NOT clear Amazon app data (pm clear), as that causes
   * the app to crash on next launch. Only Chrome data is cleared.
   *
   * Strategy:
   *   1. Phase 1: Suppress Appium/UiAutomator2 notifications via ADB
   *   2. Launch app via `adb shell monkey -p <package> 1` (package only)
   *   3. Wait for app process to appear (verify it didn't crash)
   *   4. Set APPIUM_AUTO_LAUNCH=false so Appium does NOT try to start
   *      the activity (which would fail for non-exported activities)
   *   5. Phase 2 runs after session creation in createSession()
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
    // EARLY EXIT: If the lifecycle has already launched the app and
    // set APP_ACTIVITY, skip all pre-session ADB work (notification
    // suppression, pm clear, monkey launch, process polling).
    // This saves 25-45 seconds per scenario.
    // ══════════════════════════════════════════════════════════════
    if (process.env.APP_ACTIVITY && process.env.APP_ACTIVITY.trim().length > 0) {
      logger.info('[MobileSessionManager] Using user-configured APP_ACTIVITY: ' + process.env.APP_ACTIVITY);
      logger.info('[MobileSessionManager] Skipping pre-session ADB work — app already launched by lifecycle');
      return;
    }

    // ── Phase 1: Suppress Appium/UiAutomator2 notifications ──
    // Note: disableNotificationsAndCollapseShade() is intentionally NOT called
    // here because it already ran inside _ensureDeviceUnlocked() -> unlockViaAdb().
    // Calling it a second time is redundant and wastes 12s.
    MobileSessionManager._suppressAppiumNotificationsAdb();

    // ══════════════════════════════════════════════════════════════
    // CRITICAL: Do NOT clear Amazon app data!
    // "adb shell pm clear in.amazon.mShop.android.shopping" destroys
    // Google Play Services state, licensing, and first-launch config,
    // causing the app to crash immediately on next launch.
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
    // This verifies the app didn't crash immediately after launch.
    logger.info('[MobileSessionManager] Waiting for app process to appear...');
    var processAlive = false;
    for (var retry = 0; retry < 10; retry++) {
      await new Promise(function(r) { setTimeout(r, 2000); });
      if (MobileSessionManager._isAppProcessAlive(appPackage)) {
        processAlive = true;
        logger.info('[MobileSessionManager] App process confirmed alive');
        break;
      }
      logger.info('[MobileSessionManager] App process not yet visible, retrying... (' + (retry + 1) + '/10)');
    }

    if (!processAlive) {
      logger.warn('[MobileSessionManager] App process did not appear after launch — may have crashed');
      // Try one more time
      logger.info('[MobileSessionManager] Retrying app launch...');
      try {
        execSync(
          'adb shell monkey -p ' + appPackage + ' -c android.intent.category.LAUNCHER 1 2>/dev/null || true',
          { encoding: 'utf8', timeout: 30000 }
        );
        await new Promise(function(r) { setTimeout(r, 8000); });
        if (MobileSessionManager._isAppProcessAlive(appPackage)) {
          processAlive = true;
          logger.info('[MobileSessionManager] App process confirmed alive on retry');
        }
      } catch (_) {}
    }

    // Disable Appium auto-launch — app is already running (or we tried)
    process.env.APPIUM_AUTO_LAUNCH = 'false';

    // Final settle time before Appium connects
    await new Promise(function(resolve) { setTimeout(resolve, 3000); });
  }

  /**
   * Create a Safari session with WebView switching and homepage verification.
   */
  static async createSafariSession(config, options) {
    if (!options) options = {};
    var webviewTimeout = options.webviewTimeout || (process.env.TEST_PLATFORM === 'IOS' ? 40000 : 20000);
    var elementTimeout = options.elementTimeout || (process.env.TEST_PLATFORM === 'IOS' ? 30000 : 15000);

    var driver;
    try {
      driver = await MobileSessionManager.createSession(config);

      logger.info('[MobileSessionManager] Waiting for WebView context...');
      var startTime = Date.now();
      var webviewCtx = null;
      while (Date.now() - startTime < webviewTimeout) {
        var contexts = await driver.getContexts().catch(function() { return []; });
        logger.info('[MobileSessionManager] Contexts: ' + JSON.stringify(contexts));
        webviewCtx = null;
        for (var c = 0; c < contexts.length; c++) {
          if (String(contexts[c]).toLowerCase().includes('webview')) {
            webviewCtx = contexts[c];
            break;
          }
        }
        if (webviewCtx) { break; }
        await driver.pause(1000);
      }
      if (!webviewCtx) { throw new Error('No WebView context within ' + webviewTimeout + 'ms'); }

      await driver.switchContext(webviewCtx);
      logger.info('[MobileSessionManager] Switched to WebView');

      logger.info('[MobileSessionManager] Navigating to: ' + config.baseUrl);
      await driver.url(config.baseUrl);
      // After navigation the remote debugger connection may reset and
      // the context reverts to NATIVE_APP. Re-acquire the WEBVIEW context.
      logger.info('[MobileSessionManager] Re-acquiring WebView context after navigation...');
      var postNavTimeout = 20000;
      var postNavStart = Date.now();
      var postNavCtx = null;
      while (Date.now() - postNavStart < postNavTimeout) {
        var ctxs = await driver.getContexts().catch(function() { return []; });
        for (var c = 0; c < ctxs.length; c++) {
          if (String(ctxs[c]).toLowerCase().includes('webview')) { postNavCtx = ctxs[c]; break; }
        }
        if (postNavCtx) { break; }
        await driver.pause(1000);
      }
      if (postNavCtx) {
        await driver.switchContext(postNavCtx);
        logger.info('[MobileSessionManager] Switched to post-navigation WebView: ' + postNavCtx);
      } else {
        logger.warn('[MobileSessionManager] WebView context not found after navigation');
      }

      logger.info('[MobileSessionManager] Waiting for homepage elements...');
      var homepageSelectors = [ '#twotabsearchtextbox', 'input[name="k"]', 'input[type="search"]', '#nav-search-bar-form input', 'a[aria-label*="Amazon"]', '#nav-hamburger-menu' ];
      var homepageVisible = false;
      var elementWaitStart = Date.now();
      while (Date.now() - elementWaitStart < elementTimeout) {
        for (var s = 0; s < homepageSelectors.length; s++) {
          try {
            var els = await driver.$$(homepageSelectors[s]);
            if (els && els.length > 0) {
              var displayed = await els[0].isDisplayed().catch(function() { return false; });
              if (displayed) { homepageVisible = true; break; }
            }
          } catch (_) {}
        }
        if (homepageVisible) break;
        await driver.pause(1000);
      }
      if (!homepageVisible) { logger.warn('[MobileSessionManager] Homepage elements not found, proceeding anyway'); }

      return driver;
    } catch (err) {
      if (driver) {
        await MobileSessionManager.disposeSession(driver, { platform: config.testPlatform, appId: MobileSessionManager.getAppId(config) }).catch(function() {});
      }
      throw err;
    }
  }

  /**
   * Dispose a mobile driver session.
   */
  static async disposeSession(driver, options) {
    if (!driver) return;
    if (!options) options = {};
    var platform = options.platform;
    var appId = options.appId;
    var isIOS = platform === TEST_PLATFORMS.IOS;

    if (isIOS && appId) {
      try { await driver.terminateApp(appId); } catch (_) {}
      try { await driver.execute('mobile: removeApp', { bundleId: appId }); } catch (_) {}
    }
    if (isIOS && appId && (appId === 'com.apple.mobilesafari' || String(appId).toLowerCase().includes('safari'))) {
      await MobileSessionManager._terminateSafari();
    }

    try { await driver.deleteSession(); } catch (_) {}

    // Only clear Chrome data on cleanup (NOT Amazon — prevents crash)
    if (platform === TEST_PLATFORMS.ANDROID) {
      try {
        var { execSync } = require('child_process');
        execSync('adb shell pm clear ' + ANDROID_CHROME_PACKAGE + ' 2>/dev/null || true', { timeout: 10000 });
      } catch (_) {}
    }
    logger.info('[MobileSessionManager] Session disposed');
  }

  static async _terminateSafari() {
    try {
      var { execSync } = require('child_process');
      execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
      execSync('xcrun simctl spawn booted launchctl kill SIGKILL system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
    } catch (_) {}
  }

  static getAppId(config) {
    if (config.testPlatform === TEST_PLATFORMS.ANDROID) { return config.mobile.appPackage || ANDROID_AMAZON_PACKAGE; }
    if (config.testPlatform === TEST_PLATFORMS.IOS) {
      if (config.mobile.browserName && config.mobile.browserName.toLowerCase() === 'safari') { return process.env.IOS_SAFARI_BUNDLE_ID || 'com.apple.mobilesafari'; }
      return config.mobile.bundleId || '';
    }
    return '';
  }

  static async isSessionHealthy(driver) {
    if (!driver) return false;
    try { await driver.getStatus(); return true; } catch { return false; }
  }

  static async clearAndroidAppData() {
    try {
      var { execSync } = require('child_process');
      // Only clear Chrome — NOT Amazon (would cause crash)
      execSync('adb shell pm clear ' + ANDROID_CHROME_PACKAGE + ' 2>/dev/null || true', { timeout: 15000 });
      logger.info('[MobileSessionManager] Chrome data cleared');
    } catch (_) {}
  }

  static async clearIOSWebKitData() {
    try {
      var { execSync } = require('child_process');
      try { execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 }); } catch (_) {}
      try { execSync('xcrun simctl spawn booted rm -rf /Library/Caches/com.apple.Safari 2>/dev/null || true', { timeout: 10000 }); } catch (_) {}
      try { execSync('xcrun simctl spawn booted rm -rf /Library/Safari/History 2>/dev/null || true', { timeout: 10000 }); } catch (_) {}
    } catch (_) {}
  }

  static async cleanupBetweenScenarios(platform) {
    if (!platform) return;
    var isAndroid = String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    var isIOS = String(platform).toUpperCase() === TEST_PLATFORMS.IOS;
    if (isAndroid && process.env.CLEAR_APP_DATA_BETWEEN_SCENARIOS === 'true') {
      logger.info('[MobileSessionManager] Clearing Android Chrome data between scenarios...');
      await MobileSessionManager.clearAndroidAppData();
    }
    if (isIOS && process.env.CLEAR_APP_DATA_BETWEEN_SCENARIOS === 'true') {
      await MobileSessionManager.clearIOSWebKitData();
    }
  }
}

module.exports = MobileSessionManager;
