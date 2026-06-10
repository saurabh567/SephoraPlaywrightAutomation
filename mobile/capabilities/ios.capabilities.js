function iosCapabilities() {
  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': process.env.DEVICE_NAME || 'iPhone 15',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
    'appium:noReset': process.env.NO_RESET === 'true',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120)
  };

  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;
  if (process.env.BUNDLE_ID) capabilities['appium:bundleId'] = process.env.BUNDLE_ID;
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;
  if (process.env.XCODE_ORG_ID) capabilities['appium:xcodeOrgId'] = process.env.XCODE_ORG_ID;
  if (process.env.XCODE_SIGNING_ID) capabilities['appium:xcodeSigningId'] = process.env.XCODE_SIGNING_ID;

  return capabilities;
}

module.exports = iosCapabilities;
