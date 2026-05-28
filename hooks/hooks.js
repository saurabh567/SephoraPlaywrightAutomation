const { Before, After, BeforeAll, AfterAll, Status } = require('@cucumber/cucumber');
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/env.config');
const logger = require('../utils/logger');
const HomePage = require('../pages/HomePage');
const LoginPage = require('../pages/LoginPage');
const MakeupFacePage = require('../pages/MakeupFacePage');
const ProductDetailsPage = require('../pages/ProductDetailsPage');
const CartPage = require('../pages/CartPage');
require('./world');

let browser;

BeforeAll(async function () {
  fs.ensureDirSync('reports/screenshots');
  fs.ensureDirSync('reports/videos');
  fs.ensureDirSync('reports/traces');
  const browserType = { chromium, firefox, webkit }[config.browser] || chromium;
  browser = await browserType.launch({ headless: config.headless });
  logger.info(`Browser launched: ${config.browser}, headless: ${config.headless}`);
});

Before(async function (scenario) {
  this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
  logger.info(`Scenario started: ${scenario.pickle.name}`);

  this.browser = browser;
  this.context = await browser.newContext({
    viewport: config.viewport,
    recordVideo: { dir: 'reports/videos/' }
  });

  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(config.timeout);

  this.pages.homePage = new HomePage(this.page);
  this.pages.loginPage = new LoginPage(this.page);
  this.pages.makeupFacePage = new MakeupFacePage(this.page);
  this.pages.productDetailsPage = new ProductDetailsPage(this.page);
  this.pages.cartPage = new CartPage(this.page);
});

After(async function (scenario) {
  const safeName = this.scenarioName;
  const tracePath = path.join('reports/traces', `${safeName}.zip`);

  if (scenario.result.status === Status.FAILED) {
    const screenshotPath = path.join('reports/screenshots', `${safeName}.png`);
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
    logger.info('Browser closed successfully.');
  }
});
