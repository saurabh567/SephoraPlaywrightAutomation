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
 * safari:clearData:
 *   Intentionally set to false. When true, Appium/WDA clears Safari data at
 *   session creation, which on some iOS/WDA versions causes Safari to reset
 *   to about:blank in a way that breaks subsequent driver.url() navigation.
 *   Instead, we navigate to the target URL first, then clear browser storage
 *   via JavaScript on the actual page domain.
 *
 * noReset / fullReset:
 *   Read from environment variables:
 *     NO_RESET=true  → Appium does NOT reset app state between sessions
 *     FULL_RESET=true → Appium kills app + deletes all data (aggressive)
 *     Default (both false): Appium terminates Safari and starts fresh.
 * ══════════════════════════════════════════════════════════════════════════════
 */

function iosCapabilities() {
  const browserName = process.env.BROWSER_NAME;
  const appPath = process.env.APP_PATH;
  const bundleId = process.env.BUNDLE_ID;
  const noReset = process.env.NO_RESET === 'true';
  const fullReset = noReset ? false : process.env.FULL_RESET === 'true';

  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': process.env.DEVICE_NAME || 'iPhone 15',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    'appium:noReset': noReset,
    'appium:fullReset': fullReset,
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120),
  };

  if (browserName) {
    capabilities.browserName = browserName;
    capabilities['appium:browserName'] = browserName;
    capabilities['safari:useSimulator'] = true;
    // CRITICAL: safari:clearData=false. We clear storage via JS after navigation
    // on the actual target domain. See file header comment for details.
    capabilities['safari:clearData'] = false;
  } else {
    if (appPath) capabilities['appium:app'] = appPath;
    if (bundleId) capabilities['appium:bundleId'] = bundleId;
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
