const { chromium, firefox, webkit } = require('playwright');

class WebDriverFactory {
  static async launch(config) {
    const browserType = { chromium, firefox, webkit }[config.browser] || chromium;
    return browserType.launch({ headless: config.headless });
  }

  static async newContext(browser, config) {
    return browser.newContext({
      viewport: config.viewport,
      recordVideo: { dir: `${config.reportDir}/videos/worker-${process.env.CUCUMBER_WORKER_ID || 'main'}` }
    });
  }
}

module.exports = WebDriverFactory;
