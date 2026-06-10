function androidCapabilities() {
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
    'appium:noReset': process.env.NO_RESET === 'true',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120)
  };

  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;
  if (process.env.APP_PACKAGE) capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
  if (process.env.APP_ACTIVITY) capabilities['appium:appActivity'] = process.env.APP_ACTIVITY;
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;

  return capabilities;
}

module.exports = androidCapabilities;
