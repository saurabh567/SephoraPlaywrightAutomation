/**
 * iOS Appium capabilities.
 *
 * Safari Browser Automation (Appium 2.x):
 *   Requires BOTH top-level browserName AND appium:browserName for reliable
 *   session creation on Appium 2.x. The appium: prefix is the canonical
 *   Appium 2.x capability format. safari:useSimulator is required for
 *   simulator-based Safari testing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Important: appium:appIdKey
 *   Must NOT be set for Safari browser sessions. The 'Missing parameter:
 *   appIdKey' error occurs when url() is called during session startup with
 *   an appIdKey that doesn't match a Safari bundle. Safari sessions use
 *   browserName — not appIdKey. Only native app sessions need appIdKey.
 * ══════════════════════════════════════════════════════════════════════════════
 */

function iosCapabilities() {
  const browserName = process.env.BROWSER_NAME;
  const appPath = process.env.APP_PATH;
  const bundleId = process.env.BUNDLE_ID;

  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': process.env.DEVICE_NAME || 'iPhone 15',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // Session Isolation: every new session starts clean
    'appium:noReset': process.env.NO_RESET === 'true' ? true : false,
    'appium:fullReset': process.env.FULL_RESET === 'true',

    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120),
  };

  if (browserName) {
    // Canonical Appium 2.x browser capabilities
    capabilities.browserName = browserName;
    capabilities['appium:browserName'] = browserName;

    // Required for Safari on iOS Simulator
    capabilities['safari:useSimulator'] = true;
  } else {
    // Native app capabilities
    if (appPath) capabilities['appium:app'] = appPath;
    if (bundleId) capabilities['appium:bundleId'] = bundleId;
    // appIdKey is only valid for native app sessions, NOT Safari
    if (process.env.APP_ID_KEY) capabilities['appium:appIdKey'] = process.env.APP_ID_KEY;
  }

  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;
  if (process.env.XCODE_ORG_ID) capabilities['appium:xcodeOrgId'] = process.env.XCODE_ORG_ID;
  if (process.env.XCODE_SIGNING_ID) capabilities['appium:xcodeSigningId'] = process.env.XCODE_SIGNING_ID;
  if (process.env.UPDATED_WDA_BUNDLE_ID) capabilities['appium:updatedWDABundleId'] = process.env.UPDATED_WDA_BUNDLE_ID;
  if (process.env.WDA_LOCAL_PORT) capabilities['appium:wdaLocalPort'] = Number(process.env.WDA_LOCAL_PORT);
  if (process.env.WDA_LAUNCH_TIMEOUT) capabilities['appium:wdaLaunchTimeout'] = Number(process.env.WDA_LAUNCH_TIMEOUT);
  if (process.env.WDA_CONNECTION_TIMEOUT) capabilities['appium:wdaConnectionTimeout'] = Number(process.env.WDA_CONNECTION_TIMEOUT);
  if (process.env.USE_NEW_WDA) capabilities['appium:useNewWDA'] = process.env.USE_NEW_WDA === 'true';
  if (process.env.AUTO_ACCEPT_ALERTS) capabilities['appium:autoAcceptAlerts'] = process.env.AUTO_ACCEPT_ALERTS === 'true';
  if (process.env.AUTO_DISMISS_ALERTS) capabilities['appium:autoDismissAlerts'] = process.env.AUTO_DISMISS_ALERTS === 'true';
  if (process.env.SHOW_XCODE_LOG) capabilities['appium:showXcodeLog'] = process.env.SHOW_XCODE_LOG === 'true';

  return capabilities;
}

module.exports = iosCapabilities;
