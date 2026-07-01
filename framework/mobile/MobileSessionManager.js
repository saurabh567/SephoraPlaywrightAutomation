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
 *     1. Clear app data via ADB `pm clear` for a clean state
 *     2. Launch app via `adb shell monkey -p <package> 1`
 *     3. Set APPIUM_AUTO_LAUNCH=false so Appium connects to running app
 *     4. Fall back to Appium auto-launch if ADB unavailable
 *
 * iOS Session:
 *   - Terminates Safari before session creation
 *   - Waits for WEBVIEW context
 *   - Navigates to BASE_URL
 *   - Waits for homepage elements
 *
 * Between-Scenario Cleanup:
 *   - Android: `adb shell pm clear` for Amazon + Chrome
 *   - iOS: xcrun simctl Safari data removal + terminate
 */

const logger = require('../../utils/logger');
const MobileDriverFactory = require('./MobileDriverFactory');
const { TEST_PLATFORMS } = require('../common/platforms');

const ANDROID_AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const ANDROID_CHROME_PACKAGE = 'com.android.chrome';
const ANDROID_WEBVIEW_PACKAGES = [ANDROID_AMAZON_PACKAGE, ANDROID_CHROME_PACKAGE];

class MobileSessionManager {
  /**
   * Create a fresh mobile driver session.
   * For Android, handles app launch with ADB fallback.
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
      await MobileSessionManager._prepareAndroidSession(config);
    } else if (isIOS) {
      logger.info('[MobileSessionManager] Creating iOS session...');
    }

    var driver = await MobileDriverFactory.createDriver(config);

    if (isAndroid) driver.__mobilePlatform = 'android';
    else if (isIOS) driver.__mobilePlatform = 'ios';

    logger.info('[MobileSessionManager] Session created successfully.');
    return driver;
  }

  /**
   * Prepare Android session — handles the SecurityException workaround.
   *
   * Strategy:
   *   1. Clear app data via ADB `pm clear` for clean state
   *   2. Launch app via `adb shell monkey -p <package> 1`
   *      (monkey launches by package name, no activity class needed)
   *   3. Set APPIUM_AUTO_LAUNCH=false so Appium does NOT try to start
   *      the activity (which would fail for non-exported activities)
   *   4. If ADB unavailable, fall back to Appium auto-launch
   */
  static async _prepareAndroidSession(config) {
    var appPackage = (config.mobile && config.mobile.appPackage) || ANDROID_AMAZON_PACKAGE;
    if (!appPackage) return;

    // Check ADB availability
    var adbAvailable = false;
    try {
      var adbCheck = require('child_process').execSync(
        'adb get-state 2>/dev/null || echo "no-device"',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      adbAvailable = adbCheck !== 'no-device' && adbCheck.length > 0;
    } catch (_) {}

    if (!adbAvailable) {
      logger.warn('[MobileSessionManager] ADB not available — Appium will auto-launch');
      return;
    }

    // If user explicitly set APP_ACTIVITY, trust it and let Appium try
    if (process.env.APP_ACTIVITY && process.env.APP_ACTIVITY.trim().length > 0) {
      logger.info('[MobileSessionManager] Using user-configured APP_ACTIVITY: ' + process.env.APP_ACTIVITY);
      return;
    }

    try {
      // Step 1: Clear app data for clean state
      logger.info('[MobileSessionManager] Clearing Android app data...');
      var { execSync } = require('child_process');
      for (var p = 0; p < ANDROID_WEBVIEW_PACKAGES.length; p++) {
        try {
          execSync('adb shell pm clear ' + ANDROID_WEBVIEW_PACKAGES[p] + ' 2>/dev/null || true', { timeout: 15000 });
        } catch (_) {}
      }

      // Step 2: Launch app via monkey (no activity class needed)
      logger.info('[MobileSessionManager] Launching app via ADB monkey...');
      var result = execSync(
        'adb shell monkey -p ' + appPackage + ' -c android.intent.category.LAUNCHER 1 2>/dev/null || true',
        { encoding: 'utf8', timeout: 30000 }
      ).trim();

      var launched = result.includes('Events injected') || result.length > 0;
      if (launched) {
        logger.info('[MobileSessionManager] App launched via ADB monkey');
        // Disable Appium auto-launch — app is already running
        process.env.APPIUM_AUTO_LAUNCH = 'false';
        // Give app time to render
        await new Promise(function(resolve) { setTimeout(resolve, 4000); });
      } else {
        logger.warn('[MobileSessionManager] ADB monkey launch failed, trying am start...');
        try {
          execSync(
            'adb shell am start -n ' + appPackage + '/com.amazon.mShop.home.HomeActivity' +
            ' 2>/dev/null || true',
            { encoding: 'utf8', timeout: 15000 }
          );
          process.env.APPIUM_AUTO_LAUNCH = 'false';
          await new Promise(function(resolve) { setTimeout(resolve, 4000); });
        } catch (_) {
          logger.warn('[MobileSessionManager] All ADB launch methods failed');
        }
      }
    } catch (err) {
      logger.warn('[MobileSessionManager] Android launch prep failed: ' + err.message);
    }
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

      // Wait for WebView context
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
        if (webviewCtx) {
          logger.info('[MobileSessionManager] WebView found: ' + webviewCtx);
          break;
        }
        await driver.pause(1000);
      }

      if (!webviewCtx) {
        throw new Error('No WebView context within ' + webviewTimeout + 'ms');
      }

      await driver.switchContext(webviewCtx);
      logger.info('[MobileSessionManager] Switched to WebView');

      // Navigate to base URL
      logger.info('[MobileSessionManager] Navigating to: ' + config.baseUrl);
      await driver.url(config.baseUrl);
      await driver.pause(3000);

      // Wait for homepage elements
      logger.info('[MobileSessionManager] Waiting for homepage elements...');
      var homepageSelectors = [
        '#twotabsearchtextbox', 'input[name="k"]', 'input[type="search"]',
        '#nav-search-bar-form input', 'a[aria-label*="Amazon"]',
        '#nav-hamburger-menu',
      ];

      var homepageVisible = false;
      var elementWaitStart = Date.now();
      while (Date.now() - elementWaitStart < elementTimeout) {
        for (var s = 0; s < homepageSelectors.length; s++) {
          try {
            var els = await driver.$$(homepageSelectors[s]);
            if (els && els.length > 0) {
              var displayed = await els[0].isDisplayed().catch(function() { return false; });
              if (displayed) {
                homepageVisible = true;
                break;
              }
            }
          } catch (_) {}
        }
        if (homepageVisible) break;
        await driver.pause(1000);
      }

      if (!homepageVisible) {
        logger.warn('[MobileSessionManager] Homepage elements not found, proceeding anyway');
      }

      return driver;
    } catch (err) {
      if (driver) {
        await MobileSessionManager.disposeSession(driver, {
          platform: config.testPlatform,
          appId: MobileSessionManager.getAppId(config)
        }).catch(function() {});
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

    if (platform === TEST_PLATFORMS.ANDROID) {
      try {
        var { execSync } = require('child_process');
        for (var p = 0; p < ANDROID_WEBVIEW_PACKAGES.length; p++) {
          try {
            execSync('adb shell pm clear ' + ANDROID_WEBVIEW_PACKAGES[p] + ' 2>/dev/null || true', { timeout: 10000 });
          } catch (_) {}
        }
      } catch (_) {}
    }

    logger.info('[MobileSessionManager] Session disposed');
  }

  /**
   * Terminate Safari on the iOS simulator.
   */
  static async _terminateSafari() {
    try {
      var { execSync } = require('child_process');
      execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
      execSync('xcrun simctl spawn booted launchctl kill SIGKILL system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
    } catch (_) {}
  }

  /**
   * Get the app identifier for the given config.
   */
  static getAppId(config) {
    if (config.testPlatform === TEST_PLATFORMS.ANDROID) {
      return config.mobile.appPackage || ANDROID_AMAZON_PACKAGE;
    }
    if (config.testPlatform === TEST_PLATFORMS.IOS) {
      if (config.mobile.browserName && config.mobile.browserName.toLowerCase() === 'safari') {
        return process.env.IOS_SAFARI_BUNDLE_ID || 'com.apple.mobilesafari';
      }
      return config.mobile.bundleId || '';
    }
    return '';
  }

  /**
   * Check if a driver session is healthy.
   */
  static async isSessionHealthy(driver) {
    if (!driver) return false;
    try { await driver.getStatus(); return true; } catch { return false; }
  }

  /**
   * Clear Android app data via ADB (used between scenarios).
   */
  static async clearAndroidAppData() {
    try {
      var { execSync } = require('child_process');
      for (var p = 0; p < ANDROID_WEBVIEW_PACKAGES.length; p++) {
        try {
          execSync('adb shell pm clear ' + ANDROID_WEBVIEW_PACKAGES[p] + ' 2>/dev/null || true', { timeout: 15000 });
          logger.info('[MobileSessionManager] Android data cleared: ' + ANDROID_WEBVIEW_PACKAGES[p]);
        } catch (_) {}
      }
    } catch (_) {}
  }

  /**
   * Clear iOS Safari WebKit data (used between scenarios).
   */
  static async clearIOSWebKitData() {
    try {
      var { execSync } = require('child_process');
      try {
        execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
      } catch (_) {}
      try {
        execSync('xcrun simctl spawn booted rm -rf /Library/Caches/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
        execSync('xcrun simctl spawn booted rm -rf /Library/Safari/History 2>/dev/null || true', { timeout: 10000 });
        execSync('xcrun simctl spawn booted rm -rf /Library/Safari/Databases 2>/dev/null || true', { timeout: 10000 });
        execSync('xcrun simctl spawn booted rm -rf /Library/Safari/LocalStorage 2>/dev/null || true', { timeout: 10000 });
      } catch (_) {}
    } catch (_) {}
  }

  /**
   * Run cleanup between scenarios.
   */
  static async cleanupBetweenScenarios(platform) {
    if (!platform) return;
    var isAndroid = String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    var isIOS = String(platform).toUpperCase() === TEST_PLATFORMS.IOS;

    if (isAndroid && process.env.CLEAR_APP_DATA_BETWEEN_SCENARIOS === 'true') {
      logger.info('[MobileSessionManager] Android between-scenario cleanup...');
      await MobileSessionManager.clearAndroidAppData();
    }

    if (isIOS && process.env.CLEAR_IOS_SAFARI_DATA === 'true') {
      logger.info('[MobileSessionManager] iOS between-scenario cleanup...');
      await MobileSessionManager.clearIOSWebKitData();
      await MobileSessionManager._terminateSafari();
    }
  }
}

module.exports = MobileSessionManager;
