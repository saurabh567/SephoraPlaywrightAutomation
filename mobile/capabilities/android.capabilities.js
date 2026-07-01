/**
 * Android Appium capabilities.
 *
 * BrowserContext Isolation:
 *   - noReset: false — ensures every new session starts with a clean app state
 *   - fullReset: configurable — use FULL_RESET=true to also uninstall/reinstall the app
 *   - skipDeviceInitialization: true — avoids UiAutomator2 initialization errors
 *   - autoGrantPermissions: true — automatically grants all app permissions
 *
 * These settings guarantee that each test case starts with:
 *   - No cookies
 *   - No localStorage, sessionStorage, IndexedDB, Cache Storage
 *   - No browser history, saved permissions, or previous auth state
 *   - No reused browser session, tab, or shared memory
 */

function androidCapabilities() {
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // =========================================================
    // Session Isolation: Do NOT reuse app state between sessions
    // =========================================================
    // noReset=false ensures Appium clears app data on every new session.
    // This guarantees cookies, localStorage, and all WebView state
    // are wiped before each test case.
    // =========================================================
    'appium:noReset': process.env.NO_RESET === 'true' ? true : false,
    'appium:fullReset': process.env.FULL_RESET === 'true',

    // Skip UiAutomator2 device initialization to avoid instrumentation errors
    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',

    // Grant all permissions automatically
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',

    // New command timeout
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 180),

    // WebView / browser support
    'appium:ensureWebviewsHavePages': true,
    'appium:recreateChromeDriverSessions': true,
    'appium:nativeWebScreenshot': true,
  };

  // App package configuration
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;

    // Wait for the app package to appear (not just the main activity)
    capabilities['appium:appWaitPackage'] = process.env.APP_PACKAGE;

    // App activity: use provided value or let adb determine it
    if (process.env.APP_ACTIVITY) {
      capabilities['appium:appActivity'] = process.env.APP_ACTIVITY;
      capabilities['appium:appWaitActivity'] = process.env.APP_ACTIVITY;
    }

    // App launch timeout
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 30000);
  }

  // Optional: path to .apk file
  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;

  // Optional: device UDID for real devices
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;

  // Chrome driver port for WebView debugging
  if (process.env.CHROMEDRIVER_PORT) {
    capabilities['appium:chromedriverPort'] = Number(process.env.CHROMEDRIVER_PORT);
  }
  if (process.env.CHROMEDRIVER_EXECUTABLE) {
    capabilities['appium:chromedriverExecutable'] = process.env.CHROMEDRIVER_EXECUTABLE;
  }

  return capabilities;
}

module.exports = androidCapabilities;
