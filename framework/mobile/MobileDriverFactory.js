const { TEST_PLATFORMS, normalizePlatform } = require('../common/platforms');
const androidCapabilities = require('../../mobile/capabilities/android.capabilities');
const iosCapabilities = require('../../mobile/capabilities/ios.capabilities');

class MobileDriverFactory {
  static getCapabilities(platform) {
    const normalizedPlatform = normalizePlatform(platform);

    if (normalizedPlatform === TEST_PLATFORMS.ANDROID) return androidCapabilities();
    if (normalizedPlatform === TEST_PLATFORMS.IOS) return iosCapabilities();

    throw new Error(`Unsupported mobile platform: ${platform}`);
  }

  static async createDriver(config) {
    let remote;
    try {
      ({ remote } = require('webdriverio'));
    } catch (error) {
      throw new Error('Mobile execution requires webdriverio. Run: npm install');
    }

    var caps = this.getCapabilities(config.testPlatform);

    // ══════════════════════════════════════════════════════════════════
    // DIAGNOSTIC: Print complete capabilities JSON before session creation
    // ══════════════════════════════════════════════════════════════════
    const relevantCaps = [
      'platformName',
      'appium:automationName',
      'appium:deviceName',
      'appium:platformVersion',
      'appium:appPackage',
      'appium:appActivity',
      'appium:appWaitActivity',
      'appium:appWaitPackage',
      'appium:appWaitDuration',
      'appium:noReset',
      'appium:fullReset',
      'appium:dontStopAppOnReset',
      'appium:autoLaunch',
      'appium:newCommandTimeout',
      'appium:adbExecTimeout',
      'appium:uiautomator2ServerLaunchTimeout',
      'appium:skipDeviceInitialization',
      'appium:skipServerInstallation',
      'appium:autoGrantPermissions',
      'appium:ensureWebviewsHavePages',
      'appium:recreateChromeDriverSessions',
      'appium:nativeWebScreenshot',
      'appium:chromedriverPort',
      'appium:udid',
      'appium:app',
      // Lock screen unlock capabilities
      'appium:unlockStrategy',
      'appium:unlockKey',
      'appium:unlockType',
    ];

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   APPIUM SESSION CAPABILITIES DIAGNOSTIC    ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('  Timestamp: ' + new Date().toISOString());
    console.log('  Platform:  ' + config.testPlatform);
    console.log('  Appium:    ' + config.appium.protocol + '://' + config.appium.hostname + ':' + config.appium.port + config.appium.path);
    console.log('');

    for (var i = 0; i < relevantCaps.length; i++) {
      var key = relevantCaps[i];
      var found = false;
      // Check both with and without appium: prefix
      if (caps[key] !== undefined) {
        console.log('  ' + padRight(key, 40) + ' = ' + JSON.stringify(caps[key]));
        found = true;
      }
      // Also check as non-prefixed
      var strippedKey = key.replace('appium:', '');
      if (strippedKey !== key && caps[strippedKey] !== undefined) {
        console.log('  ' + padRight(strippedKey, 40) + ' = ' + JSON.stringify(caps[strippedKey]));
        found = true;
      }
      if (!found) {
        console.log('  ' + padRight(key, 40) + ' = NOT SET');
      }
    }
    console.log('');

    // Also show env var origin trace
    console.log('  ENVIRONMENT VARIABLE TRACE:');
    var envVars = [
      ['APP_ACTIVITY', process.env.APP_ACTIVITY],
      ['APP_PACKAGE',  process.env.APP_PACKAGE],
      ['APPIUM_AUTO_LAUNCH', process.env.APPIUM_AUTO_LAUNCH],
      ['NO_RESET',     process.env.NO_RESET],
      ['FULL_RESET',   process.env.FULL_RESET],
      ['DEVICE_NAME',  process.env.DEVICE_NAME],
      ['UDID',         process.env.UDID],
      ['NEW_COMMAND_TIMEOUT', process.env.NEW_COMMAND_TIMEOUT],
      // Lock screen env vars
      ['APPIUM_UNLOCK_STRATEGY', process.env.APPIUM_UNLOCK_STRATEGY],
      ['APPIUM_UNLOCK_KEY',     process.env.APPIUM_UNLOCK_KEY],
      ['APPIUM_SKIP_UNLOCK',    process.env.APPIUM_SKIP_UNLOCK],
    ];
    for (var j = 0; j < envVars.length; j++) {
      var val = envVars[j][1] !== undefined ? envVars[j][1] : '(undefined)';
      console.log('    ' + padRight(envVars[j][0], 25) + ' = ' + val);
    }
    console.log('');

    // Print full capabilities JSON
    console.log('  FULL CAPABILITIES JSON (sent to Appium):');
    console.log('  ' + JSON.stringify(caps, null, 4).split('\n').join('\n  '));
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('');

    return remote({
      protocol: config.appium.protocol,
      hostname: config.appium.hostname,
      port: config.appium.port,
      path: config.appium.path,
      logLevel: config.appium.logLevel,
      connectionRetryTimeout: config.appium.connectionRetryTimeout,
      connectionRetryCount: config.appium.connectionRetryCount,
      capabilities: caps,
    });
  }
}

function padRight(str, len) {
  while (str.length < len) str += ' ';
  return str;
}

module.exports = MobileDriverFactory;
