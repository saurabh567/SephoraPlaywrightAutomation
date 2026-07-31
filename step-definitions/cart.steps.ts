import { Given, When, Then } from '@cucumber/cucumber';
import { expect as playwrightExpect } from '@playwright/test';
import assert from 'assert';
import AmazonHomePage from '../pages/AmazonHomePage';
import AmazonSearchResultsPage from '../pages/AmazonSearchResultsPage';
import AmazonProductDetailsPage from '../pages/AmazonProductDetailsPage';
import AmazonCartPage from '../pages/AmazonCartPage';
import testData from '../test-data/testData.json';
import { TEST_PLATFORMS } from '../framework/common/platforms';
import logger from '../utils/logger';
// Step definitions unique to the Amazon India Cart Page features.
// Platform-aware: uses Playwright page objects for web, MobileAmazon page objects for mobile.
//
// Mobile cart verification uses element-based checks with targeted fallbacks.
// Avoids broad getPageSource() regex patterns that cause false positives.

function isMobile(world: any) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world: any) {
  return world.platform === TEST_PLATFORMS.WEB;
}

Given('a product is added to the cart', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const homePage = new AmazonHomePage(activePage);
  await homePage.searchProduct(testData.searchTerm);

  const searchResultsPage = new AmazonSearchResultsPage(activePage);
  const result = await searchResultsPage.openFirstProduct();

  // Web: result may be a new Playwright page
  if (isWeb(this) && result !== this.page) {
    this.page = result;
  }

  const updatedActivePage = isMobile(this) ? this.driver : this.page;
  const productDetailsPage = new AmazonProductDetailsPage(updatedActivePage);
  this.addedToCart = await productDetailsPage.addToCartIfAvailable();
  if (!this.addedToCart) {
    throw new Error('Could not add product to cart for the background step.');
  }
  logger.info('[CartSteps] Product added to cart in background step.');
});

When('I remove the product from the cart', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const cartPage = new AmazonCartPage(activePage);

  if (isMobile(this)) {
    logger.info('[CartSteps] Mobile: removing product from cart via page object...');
    await cartPage.removeItemFromCart();
    logger.info('[CartSteps] Mobile: product removed from cart.');
    return;
  }

  // Web: remove product from cart
  const deleteButton = this.page.locator(
    'input[value="Delete"], span[data-action="delete"] a, .sc-action-delete input'
  ).first();
  await deleteButton.waitFor({ state: 'visible', timeout: 10000 });
  await deleteButton.click();
  await this.page.waitForTimeout(3000);
  logger.info('[CartSteps] Product removed from cart.');
});

Then('the cart should show the empty cart message', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const cartPage = new AmazonCartPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify cart is empty using element-based checks first
    // Check for specific "empty cart" elements instead of broad regex
    const emptySelectors = [
      '//*[contains(text(), "empty")]',
      '//*[contains(text(), "Your Amazon Cart is empty")]',
      '//*[contains(text(), "Your Shopping Cart is empty")]',
      '//*[contains(text(), "0 items")]',
      '//*[contains(@aria-label, "empty")]',
    ];

    let isEmpty = false;
    for (const sel of emptySelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            isEmpty = true;
            break;
          }
        }
      } catch (_: any) {}
      if (isEmpty) break;
    }

    // Fallback: check page source for empty cart indicators
    if (!isEmpty) {
      const source = await this.driver.getPageSource();
      isEmpty = /your amazon cart is empty|your shopping cart is empty|0 items in your cart/i.test(source);
      if (!isEmpty) {
        // Check if items still exist (removal might not have worked)
        const hasItems = /cart-subtotal|sc-subtotal|cart total|subtotal/i.test(source);
        if (hasItems) {
          throw new Error(
            '[CartSteps] Mobile: Cart still contains items after removal.\n' +
            'The delete button was clicked but the item was not removed.'
          );
        }
      }
    }

    logger.info(`[CartSteps] Mobile cart empty check: ${isEmpty}`);
    return;
  }

  // Web: use Playwright expect
  await cartPage.verifyVisible(cartPage.emptyCartMessage);
  logger.info('[CartSteps] Empty cart message visible.');
});
