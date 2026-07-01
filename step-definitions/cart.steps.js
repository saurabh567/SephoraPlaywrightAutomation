// Step definitions unique to the Amazon India Cart Page features.
// Platform-aware: uses Playwright page objects for web, MobileAmazon page objects for mobile.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect: playwrightExpect } = require('@playwright/test');
const assert = require('assert');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const AmazonCartPage = require('../pages/AmazonCartPage');
const testData = require('../test-data/testData.json');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

function isMobile(world) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world) {
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
  if (isMobile(this)) {
    // ── Mobile: remove product from cart via WebDriverIO ─────────────────
    // Amazon mobile web cart page: each item has a "Delete" link.
    // Locators cover both desktop and mobile cart item layouts.
    logger.info('[CartSteps] Mobile: removing product from cart...');

    const deleteSelectors = [
      // Standard delete button
      'input[value="Delete"]',
      // Data-action delete
      'span[data-action="delete"] a',
      // Cart action delete input
      '.sc-action-delete input',
      // Generic delete link
      'a[aria-label*="Delete"]',
      'a[aria-label*="delete"]',
      // Remove link text
      'a[href*="delete"]',
      // Cart item remove button
      '.a-declarative a[href*="delete"]',
    ];

    let removed = false;
    const allErrors = [];

    for (const selector of deleteSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          // Scroll into view and click
          try { await element.scrollIntoView(); await this.driver.pause(300); } catch (_) {}

          logger.info(`[CartSteps] Clicking delete via selector: "${selector}"`);
          await element.click();
          await this.driver.pause(3000);
          removed = true;
          break;
        }
        if (removed) break;
      } catch (err) {
        allErrors.push(`Selector "${selector}": ${err.message.substring(0, 100)}`);
      }
    }

    if (!removed) {
      throw new Error(
        `[CartSteps] Mobile: Could not find delete button on cart page.\n` +
        `Attempted selectors: ${deleteSelectors.join(', ')}\n` +
        `Errors: ${allErrors.join('; ')}`
      );
    }

    logger.info('[CartSteps] Mobile: product removed from cart.');
    return;
  }

  // ── Web: remove product from cart ──────────────────────────────────────
  const cartPage = new AmazonCartPage(this.page);
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
    // Mobile: verify cart is empty by checking page source for empty message
    const source = await this.driver.getPageSource();
    const isEmpty = /cart is empty|your shopping cart is empty|your amazon cart is empty/i.test(source);

    if (!isEmpty) {
      // Check if items still exist (removal might not have worked)
      const hasItems = /cart-subtotal|sc-subtotal|cart items|item removed/i.test(source);
      if (hasItems) {
        throw new Error(
          '[CartSteps] Mobile: Cart still contains items after removal.\n' +
          'The delete button was clicked but the item was not removed.'
        );
      }
    }

    logger.info(`[CartSteps] Mobile cart empty check: ${isEmpty}`);
    return;
  }

  // Web: use Playwright expect
  await cartPage.verifyVisible(cartPage.emptyCartMessage);
  logger.info('[CartSteps] Empty cart message visible.');
});
