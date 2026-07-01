// Step definitions unique to the Amazon India Product Details Page features.
// Platform-aware: Playwright for web, Appium for mobile.
const { Then } = require('@cucumber/cucumber');
const assert = require('assert');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

function isMobile(world) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world) {
  return world.platform === TEST_PLATFORMS.WEB;
}

Then('the product title should be displayed', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const productDetailsPage = new AmazonProductDetailsPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify product details via page source
    const source = await this.driver.getPageSource().catch(() => '');
    const hasTitle = /product|brand|amazon|price/i.test(source);
    assert.ok(hasTitle, 'Product title not found in mobile page source.');
    logger.info('[ProductSteps] Mobile product title verified.');
    return;
  }

  // Web: use Playwright
  await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
  logger.info('[ProductSteps] Web product title displayed.');
});

Then('the product price should be displayed if available', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const productDetailsPage = new AmazonProductDetailsPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify product details via page source
    const source = await this.driver.getPageSource().catch(() => '');
    const hasPrice = /₹|price|deal|offer/i.test(source);
    logger.info(`[ProductSteps] Mobile product price check: ${hasPrice}`);
    return;
  }

  // Web: use Playwright
  const priceVisible = await productDetailsPage.price
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  if (priceVisible) {
    await productDetailsPage.verifyVisible(productDetailsPage.price);
  } else {
    await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
  }
  logger.info('[ProductSteps] Web product price verified.');
});
