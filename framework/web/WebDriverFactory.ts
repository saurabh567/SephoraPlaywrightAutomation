import { chromium, firefox, webkit } from 'playwright';
import executionConfig from '../../config/executionConfig';

/**
 * WebDriverFactory - Launches Playwright browser instances.
 * Uses config/executionConfig.js as the single source of truth for headless/headed mode.
 * The headless parameter is ALWAYS resolved dynamically from executionConfig at launch time.
 */

class WebDriverFactory {
  static async launch(config: any) {
    const browserType = ({ chromium, firefox, webkit } as Record<string, any>)[config.browser] || chromium;
    // ALWAYS read headless from the single source of truth at launch time
    return browserType.launch({ headless: executionConfig.isHeadless });
  }

  static async newContext(browser: any, config: any) {
    return browser.newContext({
      viewport: config.viewport,
      recordVideo: { dir: `${config.reportDir}/videos/worker-${process.env.CUCUMBER_WORKER_ID || 'main'}` }
    });
  }
}

export default WebDriverFactory;
