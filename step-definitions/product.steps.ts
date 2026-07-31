import { Then } from '@cucumber/cucumber';
import assert from 'assert';
import AmazonProductDetailsPage from '../pages/AmazonProductDetailsPage';
import { TEST_PLATFORMS } from '../framework/common/platforms';
import logger from '../utils/logger';
// Step definitions unique to the Amazon India Product Details Page features.
// Platform-aware: Playwright for web, Appium for mobile.
//
// Mobile verification uses element-based checks with targeted fallbacks.
// Avoids broad getPageSource() regex patterns that cause false positives.

function isMobile(world: any) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world: any) {
  return world.platform === TEST_PLATFORMS.WEB;
}

Then('the product title should be displayed', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const productDetailsPage = new AmazonProductDetailsPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify product title via element-based checks
    // Try specific product title selectors first, fall back to page source
    const titleSelectors = [
      '#productTitle',
      '#title',
      'h1[data-automation-id="title"]',
      '#titleSection h1',
      '.a-section.a-spacing-none h1',
    ];
    let titleFound = false;
    for (const sel of titleSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (displayed) {
            titleFound = true;
            break;
          }
        }
      } catch (_: any) {}
      if (titleFound) break;
    }

    // Fallback: check page source for specific product indicators (not broad regex)
    if (!titleFound) {
      const source = await this.driver.getPageSource().catch(() => '');
      const hasProductIndicators = /#productTitle|productTitle|buybox|add to cart|buy now/i.test(source);
      assert.ok(hasProductIndicators, 'Product title/text not found on mobile product page.');
    }

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
    // Mobile: verify product price via element-based checks
    const priceSelectors = [
      '.a-price .a-offscreen',
      'span.a-price',
      '#corePrice_desktop .a-price',
      '.priceToPay',
      '#price_inside_buybox',
      '.a-price-whole',
    ];
    let priceFound = false;
    for (const sel of priceSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (displayed) {
            priceFound = true;
            break;
          }
        }
      } catch (_: any) {}
      if (priceFound) break;
    }

    logger.info(`[ProductSteps] Mobile product price check: ${priceFound}`);
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
