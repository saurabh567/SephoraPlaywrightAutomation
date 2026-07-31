import WebDriverFactory from '../web/WebDriverFactory';
import MobileDriverFactory from '../mobile/MobileDriverFactory';
import { TEST_PLATFORMS } from './platforms';

class PlatformDriverFactory {
  static async create(config: any) {
    if (config.testPlatform === TEST_PLATFORMS.WEB) {
      return WebDriverFactory.launch(config);
    }

    return MobileDriverFactory.createDriver(config);
  }
}

export default PlatformDriverFactory;
