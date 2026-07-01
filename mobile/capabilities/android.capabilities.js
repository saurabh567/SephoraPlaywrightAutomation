/**
 * Android Appium capabilities with SecurityException workaround.
 *
 * For Amazon Shopping app (in.amazon.mShop.android.shopping), the launcher
 * activity may not be exported (android:exported="false"). This module
 * provides multiple strategies to handle this:
 *
 * 1. If APP_ACTIVITY is set explicitly, use it directly
 * 2. If APPIUM_AUTO_LAUNCH=false, connect to already-running app
 * 3. Otherwise, try to detect the activity via ADB and use fallback
 *
 * See: mobile/utils/androidAppLauncher.js for the ADB-based fallback.
 */

const { execSync } = require('child_process');

const FALLBACK_ACTIVITY = 'com.amazon.mShop.home.HomeActivity';

function androidCapabilities() {
  var capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
    'appium:noReset': process.env.NO_RESET === 'true' ? true : false,
    'appium:fullReset': process.env.FULL_RESET === 'true',
    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 180),
    'appium:ensureWebviewsHavePages': true,
    'appium:recreateChromeDriverSessions': true,
    'appium:nativeWebScreenshot': true,
  };

  // ── Auto-Launch disabled: connect to already-running app ──────────────
  if (process.env.APPIUM_AUTO_LAUNCH === 'false') {
    capabilities['appium:autoLaunch'] = false;
    capabilities['appium:noReset'] = true;
    console.log('[android.capabilities] APPIUM_AUTO_LAUNCH=false');
    if (process.env.APP_PACKAGE) {
      capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    }
    return capabilities;
  }

  // ── App package + activity configuration ─────────────────────────────
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    capabilities['appium:appWaitPackage'] = process.env.APP_PACKAGE;

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
    capabilities['appium:appWaitActivity'] = appActivity;
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 30000);
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
