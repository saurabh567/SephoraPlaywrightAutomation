const { chromium, firefox, webkit } = require('playwright');

/**
 * WebDriverFactory - Launches Playwright browser instances.
 * Uses config/executionConfig.js as the single source of truth for headless/headed mode.
 * The headless parameter is ALWAYS resolved dynamically from executionConfig at launch time.
 */
const executionConfig = require('../../config/executionConfig');

class WebDriverFactory {
  static async launch(config) {
    const browserType = { chromium, firefox, webkit }[config.browser] || chromium;
    // ALWAYS read headless from the single source of truth at launch time
    return browserType.launch({ headless: executionConfig.isHeadless });
  }

  static async newContext(browser, config) {
    return browser.newContext({
      viewport: config.viewport,
      recordVideo: { dir: `${config.reportDir}/videos/worker-${process.env.CUCUMBER_WORKER_ID || 'main'}` }
    });
  }
}

module.exports = WebDriverFactory;
