/**
 * androidWebCapabilities.js
 *
 * Android Mobile Web capabilities — ONLY browser capabilities.
 * NO appPackage, NO appActivity, NO app path.
 *
 * For running Chrome browser tests on Android emulator/device.
 */

'use strict';

function androidWebCapabilities() {
  var capabilities: Record<string, any> = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // ── Browser configuration ───────────────────────────────────────
    // ONLY browserName — NO native app capabilities
    'appium:browserName': 'Chrome',
    browserName: 'Chrome',

    // ── ChromeDriver auto-download ──────────────────────────────────
    'appium:chromedriverAutodownload': process.env.CHROMEDRIVER_AUTODOWNLOAD !== 'false',

    // ── Session settings ────────────────────────────────────────────
    'appium:noReset': true,
    'appium:fullReset': false,
    'appium:autoLaunch': true,
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 300),
    'appium:adbExecTimeout': Number(process.env.ADB_EXEC_TIMEOUT || 60000),
    'appium:uiautomator2ServerLaunchTimeout': Number(process.env.UIAUTOMATOR2_LAUNCH_TIMEOUT || 60000),
    'appium:ensureWebviewsHavePages': true,
    'appium:nativeWebScreenshot': true,
    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',
    'appium:dontStopAppOnReset': true
  };

  // ── Device-specific ──────────────────────────────────────────────
  if (process.env.UDID) {
    capabilities['appium:udid'] = process.env.UDID;
  }
  if (process.env.CHROMEDRIVER_PORT) {
    capabilities['appium:chromedriverPort'] = Number(process.env.CHROMEDRIVER_PORT);
  }
  if (process.env.CHROMEDRIVER_EXECUTABLE) {
    capabilities['appium:chromedriverExecutable'] = process.env.CHROMEDRIVER_EXECUTABLE;
  }

  return capabilities;
}

export default androidWebCapabilities;
