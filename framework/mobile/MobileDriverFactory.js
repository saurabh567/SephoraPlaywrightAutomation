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

    return remote({
      protocol: config.appium.protocol,
      hostname: config.appium.hostname,
      port: config.appium.port,
      path: config.appium.path,
      logLevel: config.appium.logLevel,
      capabilities: this.getCapabilities(config.testPlatform)
    });
  }
}

module.exports = MobileDriverFactory;
