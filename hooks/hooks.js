// Cucumber hooks that manage browser, context, page, screenshots, videos, and traces.
const { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/env.config');
const logger = require('../utils/logger');
const WebDriverFactory = require('../framework/web/WebDriverFactory');
const MobileDriverFactory = require('../framework/mobile/MobileDriverFactory');
const ScreenshotUtility = require('../framework/common/ScreenshotUtility');
const { TEST_PLATFORMS } = require('../framework/common/platforms');

let browser;
const workerId = process.env.CUCUMBER_WORKER_ID || 'main';
const isWebExecution = config.testPlatform === TEST_PLATFORMS.WEB;

setDefaultTimeout(config.timeout + 10000);

BeforeAll(async function () {
  fs.ensureDirSync(path.join(config.reportDir, 'screenshots'));
  fs.ensureDirSync(path.join(config.reportDir, 'videos', `worker-${workerId}`));
  fs.ensureDirSync(path.join(config.reportDir, 'traces'));

  if (isWebExecution) {
    browser = await WebDriverFactory.launch(config);
    logger.info(`Browser launched: ${config.browser}, headless: ${config.headless}, worker: ${workerId}`);
  } else {
    logger.info(`Mobile platform selected: ${config.testPlatform}. Appium session will start per scenario.`);
  }
});

Before(async function (scenario) {
  this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
  this.artifactName = `${this.scenarioName}_worker_${workerId}`;
  logger.info(`Scenario started: ${scenario.pickle.name}`);

  this.platform = config.testPlatform;

  if (isWebExecution) {
    this.browser = browser;
    this.context = await WebDriverFactory.newContext(browser, config);
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeout);
    this.page.setDefaultNavigationTimeout(config.timeout);
    return;
  }

  this.driver = await MobileDriverFactory.createDriver(config);
});

After(async function (scenario) {
  const safeName = this.artifactName;
  const tracePath = path.join(config.reportDir, 'traces', `${safeName}.zip`);

  if (scenario.result.status === Status.FAILED) {
    const screenshotPath = path.join(config.reportDir, 'screenshots', `${safeName}.png`);
    const screenshot = await ScreenshotUtility.capture({
      page: this.page,
      driver: this.driver,
      filePath: screenshotPath
    });
    await this.attach(screenshot, 'image/png');
    logger.error(`Scenario failed: ${scenario.pickle.name}`);
    logger.error(`Screenshot captured: ${screenshotPath}`);
  } else {
    logger.info(`Scenario passed: ${scenario.pickle.name}`);
  }

  if (this.context) {
    await this.context.tracing.stop({ path: tracePath });
    await this.context.close();
  }

  if (this.driver) {
    await this.driver.deleteSession();
  }
});

AfterAll(async function () {
  if (isWebExecution && browser) {
    await browser.close();
    logger.info(`Browser closed successfully for worker: ${workerId}`);
  }
});
