import config from '../config/env.config';
import { TEST_PLATFORMS } from '../framework/common/platforms';
import AmazonAndroidPage from './android/AmazonAndroidPage';
import AmazonIOSAppPage from './ios/AmazonIOSAppPage';
import AmazonIOSSafariPage from './ios/AmazonIOSSafariPage';

function getAmazonMobilePage(world: any) {
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

export default getAmazonMobilePage;
