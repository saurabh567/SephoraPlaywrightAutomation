const config = require('../config/env.config');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const AmazonAndroidPage = require('./android/AmazonAndroidPage');
const AmazonIOSAppPage = require('./ios/AmazonIOSAppPage');
const AmazonIOSSafariPage = require('./ios/AmazonIOSSafariPage');

function getAmazonMobilePage(world) {
  if (!world.driver) {
    return null;
  }

  if (config.testPlatform === TEST_PLATFORMS.ANDROID) {
    return new AmazonAndroidPage(world.driver);
  }

  if (
    config.testPlatform === TEST_PLATFORMS.IOS
    && config.mobile.browserName.toLowerCase() === 'safari'
  ) {
    return new AmazonIOSSafariPage(world.driver);
  }

  if (config.testPlatform === TEST_PLATFORMS.IOS) {
    return new AmazonIOSAppPage(world.driver);
  }

  return null;
}

module.exports = getAmazonMobilePage;
