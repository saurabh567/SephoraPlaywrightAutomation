/**
 * Android Appium capabilities with SecurityException workaround
 * and lock screen auto-unlock support.
 *
 * For Amazon Shopping app (in.amazon.mShop.android.shopping), the launcher
 * activity may not be exported (android:exported="false"). This module
 * provides multiple strategies to handle this:
 *
 * 1. If APP_ACTIVITY is set explicitly, use it directly
 * 2. If APPIUM_AUTO_LAUNCH=false, connect to already-running app
 * 3. Otherwise, try to detect the activity via ADB and use fallback
 *
 * Lock Screen Support:
 *   - APPIUM_UNLOCK_STRATEGY env var: 'swipe', 'pin', 'pattern', 'password', or 'disabled'
 *   - APPIUM_UNLOCK_KEY env var: the PIN/password (default: 1234)
 *   - APPIUM_SKIP_UNLOCK env var: if 'true', skip lock screen handling entirely
 *
 * Clean Session State:
 *   - fullReset is set to true (unless NO_RESET is explicitly true) to ensure
 *     the app data is completely clean on every session. Combined with
 *     MobileSessionManager's targeted WebView data clearing, this prevents
 *     stale cookies/localStorage/cache from the Amazon Shopping app.
 *
 * Appium Notification Fix:
 *   UiAutomator2 driver installs "io.appium.settings" and "qwerty2" keyboard,
 *   which show persistent notifications. The capabilities below include:
 *     - appium:skipDeviceInitialization=false (lets unlock run)
 *     - appium:dontStopAppOnReset=true (prevents app kill on session end)
 *     - appWaitActivity=* (waits for ANY activity, avoids "never started" errors)
 *   Additional ADB-level suppression is done in MobileSessionManager.
 *
 * See: mobile/utils/unlockDevice.js for programmatic unlock
 * See: scripts/disable-android-lockscreen.sh for permanent disable
 * See: scripts/start-emulator-unlocked.sh for emulator startup with bypass
 */

const { execSync } = require('child_process');

const FALLBACK_ACTIVITY = 'com.amazon.mShop.home.HomeActivity';

function androidCapabilities() {
  var noReset = process.env.NO_RESET === 'true';

  var capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // ── Session Isolation: every new session starts clean ──
    // fullReset=true forces a full app data reset. For the Amazon app,
    // this clears all WebView data (cookies, localStorage, cache).
    // Combined with MobileSessionManager's targeted WebView file deletion,
    // this prevents the "stuck after search box focus" problem.
    'appium:noReset': noReset,
    'appium:fullReset': !noReset,

    'appium:dontStopAppOnReset': true,
    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 300),
    'appium:adbExecTimeout': Number(process.env.ADB_EXEC_TIMEOUT || 60000),
    'appium:uiautomator2ServerLaunchTimeout': Number(process.env.UIAUTOMATOR2_LAUNCH_TIMEOUT || 60000),
    'appium:ensureWebviewsHavePages': true,
    'appium:recreateChromeDriverSessions': true,
    'appium:nativeWebScreenshot': true,
  };

  // ══════════════════════════════════════════════════════════════════
  // LOCK SCREEN AUTO-UNLOCK CAPABILITIES
  // ══════════════════════════════════════════════════════════════════
  if (process.env.APPIUM_SKIP_UNLOCK !== 'true') {
    var unlockStrategy = process.env.APPIUM_UNLOCK_STRATEGY || 'locksettings'
    var unlockKey = process.env.APPIUM_UNLOCK_KEY || '1234';

    if (unlockStrategy !== 'disabled') {
      capabilities['appium:unlockStrategy'] = unlockStrategy;
      capabilities['appium:unlockKey'] = unlockKey;

      if (unlockStrategy === 'pin') {
        capabilities['appium:unlockType'] = 'pin';
      } else if (unlockStrategy === 'pattern') {
        capabilities['appium:unlockType'] = 'pattern';
      } else if (unlockStrategy === 'password') {
        capabilities['appium:unlockType'] = 'password';
      }

      capabilities['appium:skipDeviceInitialization'] = false;

      console.log('[android.capabilities] Lock screen unlock enabled: strategy=' + unlockStrategy + ', key=' + unlockKey);
    }
  }

  // ── Auto-Launch disabled: connect to already-running app ──────────────
  if (process.env.APPIUM_AUTO_LAUNCH === 'false') {
    capabilities['appium:autoLaunch'] = false;
    capabilities['appium:noReset'] = true;
    console.log('[android.capabilities] APPIUM_AUTO_LAUNCH=false');
    if (process.env.APP_PACKAGE) {
      capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    }
    // When connecting to already-running app, use wildcard for appWaitActivity
    // so Appium waits for ANY activity to appear, preventing timeout on
    // activities that may not be exported or may have different names.
    capabilities['appium:appWaitActivity'] = '*';
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 45000);
    return capabilities;
  }

  // ── App package + activity configuration ─────────────────────────────
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    capabilities['appium:appWaitPackage'] = process.env.APP_WAIT_PACKAGE || process.env.APP_PACKAGE;

    // Use explicit APP_ACTIVITY if set, otherwise fallback
    var appActivity = process.env.APP_ACTIVITY;
    if (!appActivity || appActivity.trim().length === 0) {
      appActivity = FALLBACK_ACTIVITY;
    } else {
      appActivity = appActivity.trim();
    }

    // Strip package prefix if present (e.g., "com.pkg/.Activity" -> ".Activity")
    if (appActivity.includes('/')) {
      var parts = appActivity.split('/');
      appActivity = parts[parts.length - 1];
    }

    capabilities['appium:appActivity'] = appActivity;

    // Use wildcard for appWaitActivity to handle activities that may not be
    // exported or whose names differ between app versions. This avoids:
    //   "Cannot start the application. '...HomeActivity' never started."
    // when the actual launched activity is a splash or interstitial.
    capabilities['appium:appWaitActivity'] = process.env.APP_WAIT_ACTIVITY || '*';
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 45000);
  }

  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;
  if (process.env.CHROMEDRIVER_PORT) {
    capabilities['appium:chromedriverPort'] = Number(process.env.CHROMEDRIVER_PORT);
  }
  if (process.env.CHROMEDRIVER_EXECUTABLE) {
    capabilities['appium:chromedriverExecutable'] = process.env.CHROMEDRIVER_EXECUTABLE;
  }

  return capabilities;
}

module.exports = androidCapabilities;
