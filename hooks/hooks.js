// Cucumber hooks that manage browser, context, page, screenshots, videos, and traces.
const { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/env.config');
const logger = require('../utils/logger');

let browser;
const workerId = process.env.CUCUMBER_WORKER_ID || 'main';

setDefaultTimeout(config.timeout + 10000);

BeforeAll(async function () {
  fs.ensureDirSync(path.join(config.reportDir, 'screenshots'));
  fs.ensureDirSync(path.join(config.reportDir, 'videos', `worker-${workerId}`));
  fs.ensureDirSync(path.join(config.reportDir, 'traces'));
  const browserType = { chromium, firefox, webkit }[config.browser] || chromium;
  browser = await browserType.launch({ headless: config.headless });
  logger.info(`Browser launched: ${config.browser}, headless: ${config.headless}, worker: ${workerId}`);
});

Before(async function (scenario) {
  this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
  this.artifactName = `${this.scenarioName}_worker_${workerId}`;
  logger.info(`Scenario started: ${scenario.pickle.name}`);

  this.browser = browser;
  this.context = await browser.newContext({
    viewport: config.viewport,
    recordVideo: { dir: path.join(config.reportDir, 'videos', `worker-${workerId}`) }
  });

  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(config.timeout);
  this.page.setDefaultNavigationTimeout(config.timeout);
});

After(async function (scenario) {
  const safeName = this.artifactName;
  const tracePath = path.join(config.reportDir, 'traces', `${safeName}.zip`);

  if (scenario.result.status === Status.FAILED) {
    const screenshotPath = path.join(config.reportDir, 'screenshots', `${safeName}.png`);
    const screenshot = await this.page.screenshot({ path: screenshotPath, fullPage: true });
    await this.attach(screenshot, 'image/png');
    logger.error(`Scenario failed: ${scenario.pickle.name}`);
    logger.error(`Screenshot captured: ${screenshotPath}`);
  } else {
    logger.info(`Scenario passed: ${scenario.pickle.name}`);
  }

  await this.context.tracing.stop({ path: tracePath });
  await this.context.close();
});

AfterAll(async function () {
  if (browser) {
    await browser.close();
    logger.info(`Browser closed successfully for worker: ${workerId}`);
  }
});
