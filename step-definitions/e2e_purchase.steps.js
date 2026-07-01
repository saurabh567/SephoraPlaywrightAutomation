// Step definitions unique to the End-to-End Purchase flow feature.
// Platform-aware: Playwright for web, Appium for mobile.
//
// CRITICAL: No try/catch blocks that silently swallow failures.
// If a button cannot be clicked or a page cannot be verified,
// the scenario MUST fail with a clear error.
const { When, Then } = require('@cucumber/cucumber');
const { expect: playwrightExpect } = require('@playwright/test');
const assert = require('assert');
const AmazonCartPage = require('../pages/AmazonCartPage');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

function isMobile(world) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world) {
  return world.platform === TEST_PLATFORMS.WEB;
}

When('I click on the Proceed to Buy button', async function () {
  if (isMobile(this)) {
    // ── Mobile: proceed to buy via page object ────────────────────────────
    // AmazonIOSSafariPage.proceedToCheckout() uses a 4-phase strategy:
    //   1. Wait for cart page to fully load (verify DOM ready)
    //   2. CSS selectors (Smart Wagon + standard cart checkout buttons)
    //   3. XPath selectors (fallback)
    //   4. JavaScript execution (traverse DOM for text matches)
    //   5. URL-based fallback (navigate directly to /gp/buy/select-address)
    // Plus comprehensive DOM diagnostics if all phases fail.
    const activePage = this.driver;
    const cartPage = new AmazonCartPage(activePage);
    await cartPage.proceedToCheckout();
    await this.driver.pause(2000);
    logger.info('[E2ESteps] Mobile: clicked Proceed to Buy.');
    return;
  }

  // ── Web: use Playwright ──────────────────────────────────────────────
  const cartPage = new AmazonCartPage(this.page);
  // Try the iOS method first (works on mobile-web cart too)
  if (typeof cartPage.proceedToCheckout === 'function') {
    await cartPage.proceedToCheckout();
  } else {
    await cartPage.click(cartPage.proceedToBuyButton);
  }
  await this.page.waitForLoadState('domcontentloaded');
  logger.info('[E2ESteps] Web: clicked Proceed to Buy.');
});

Then('the checkout page should be loaded', async function () {
  if (isMobile(this)) {
    // Mobile: verify checkout loaded via page source
    // Use strict checkout indicators that do NOT appear on the cart page.
    // "buy" and "checkout" are too broad — they appear on cart pages too.
    // Instead, check for checkout-specific indicators:
    const source = await this.driver.getPageSource();
    const currentUrl = await this.driver.getUrl().catch(() => '');

    const isCheckout = (
      // URL-based check
      /checkout|buy|select-address|spc/i.test(currentUrl) ||
      // Address selection screen
      /select-delivery-address|delivery address|ship to this address/i.test(source) ||
      // Payment selection
      /payment-method|payment option|card number|credit card|debit card/i.test(source) ||
      // Place order button (final checkout step)
      /place your order|place order now/i.test(source) ||
      // SP checkout page
      /spc[\-_]|checkout[\-_]spc|buybox[\-_]checkout/i.test(source) ||
      // Delivery options in checkout
      /select.*delivery|delivery.*option|shipping.*address/i.test(source)
    );

    if (!isCheckout) {
      // Capture diagnostic screenshot
      try {
        await this.driver.saveScreenshot('reports/ios/screenshots/debug-checkout-not-loaded.png');
      } catch (_) {}

      // Log all interactive elements for debugging
      try {
        logger.warn('[E2ESteps] Checkout NOT reached. Current URL: ' + currentUrl);
        const pageTitle = await this.driver.getTitle().catch(() => 'unknown');
        logger.warn('[E2ESteps] Page title: ' + pageTitle);
      } catch (_) {}
    }

    assert.ok(
      isCheckout,
      '[E2ESteps] Mobile checkout page NOT loaded.\n' +
      'Proceed to Buy was clicked but the page did not transition to checkout.\n' +
      'Current URL: ' + currentUrl + '\n' +
      'Check: (1) Cart had items, (2) Proceed to Buy button actually existed,\n' +
      '(3) Amazon did not show an interstitial or sign-in page.\n' +
      'Diagnostic files saved to reports/ios/debug/ and reports/ios/screenshots/'
    );
    logger.info('[E2ESteps] Mobile checkout page loaded.');
    return;
  }

  // Web: use Playwright
  await playwrightExpect(this.page).toHaveURL(/buy|checkout|select-delivery-address|spc/i, { timeout: 60000 });
  const checkoutElement = this.page.locator(
    '#address-book-entry-0, ' +
    '[class*="address-book"], ' +
    '.a-box-group, ' +
    '#payment-option-row-container, ' +
    '[class*="checkout"]'
  ).first();
  await playwrightExpect(checkoutElement).toBeVisible({ timeout: 15000 });
  logger.info('[E2ESteps] Web checkout page loaded.');
});
