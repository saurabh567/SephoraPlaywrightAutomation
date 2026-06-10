const WebDriverFactory = require('../web/WebDriverFactory');
const MobileDriverFactory = require('../mobile/MobileDriverFactory');
const { TEST_PLATFORMS } = require('./platforms');

class PlatformDriverFactory {
  static async create(config) {
    if (config.testPlatform === TEST_PLATFORMS.WEB) {
      return WebDriverFactory.launch(config);
    }

    return MobileDriverFactory.createDriver(config);
  }
}

module.exports = PlatformDriverFactory;
