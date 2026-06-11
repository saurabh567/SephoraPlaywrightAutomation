function iosCapabilities() {
  const browserName = process.env.BROWSER_NAME;
  const appPath = process.env.APP_PATH;
  const bundleId = process.env.BUNDLE_ID;
  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': process.env.DEVICE_NAME || 'iPhone 15',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
    'appium:noReset': process.env.NO_RESET === 'true',
    'appium:fullReset': process.env.FULL_RESET === 'true',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120)
  };

  if (browserName) {
    capabilities.browserName = browserName;
  } else {
    if (appPath) capabilities['appium:app'] = appPath;
    if (bundleId) capabilities['appium:bundleId'] = bundleId;
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
