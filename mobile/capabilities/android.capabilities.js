function androidCapabilities() {
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
    'appium:noReset': process.env.NO_RESET === 'true',
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS === 'true',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120)
  };

  // Only set appPackage (never hardcode appActivity — use adb monkey at runtime)
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    capabilities['appium:appWaitPackage'] = process.env.APP_PACKAGE;
  }

  // appium:appActivity is intentionally omitted — lifecycle script launches via monkey
  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;

  return capabilities;
}

module.exports = androidCapabilities;
