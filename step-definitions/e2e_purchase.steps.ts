import { When, Then } from '@cucumber/cucumber';
import { expect as playwrightExpect } from '@playwright/test';
import assert from 'assert';
import AmazonCartPage from '../pages/AmazonCartPage';
import { TEST_PLATFORMS } from '../framework/common/platforms';
import logger from '../utils/logger';
// Step definitions unique to the End-to-End Purchase flow feature.
// Platform-aware: Playwright for web, Appium for mobile.
//
// CRITICAL: No try/catch blocks that silently swallow failures.
// If a button cannot be clicked or a page cannot be verified,
// the scenario MUST fail with a clear error.

function isMobile(world: any) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world: any) {
  return world.platform === TEST_PLATFORMS.WEB;
}

When('I click on the Proceed to Buy button', async function () {
  if (isMobile(this)) {
    const activePage = this.driver;
    const cartPage = new AmazonCartPage(activePage);
    await cartPage.proceedToCheckout();
    await this.driver.pause(2000);
    logger.info('[E2ESteps] Mobile: clicked Proceed to Buy.');
    return;
  }

  // Web: use Playwright
  const cartPage = new AmazonCartPage(this.page);
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
    // Mobile: verify checkout loaded via URL and element-based checks
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');

    // URL-based check (most reliable)
    const isCheckoutUrl = /checkout|buy|select-address|spc/i.test(currentUrl);

    // Element-based checks (more specific than broad regex)
    let checkoutElementsFound = false;
    const checkoutSelectors = [
      '//*[contains(text(), "Select a delivery address")]',
      '//*[contains(text(), "Delivery address")]',
      '//*[contains(text(), "Ship to this address")]',
      '//*[contains(text(), "Payment method")]',
      '//*[contains(text(), "Place your order")]',
      '//*[contains(@class, "address-book")]',
      '//*[contains(@class, "payment-option")]',
    ];
    for (const sel of checkoutSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            checkoutElementsFound = true;
            break;
          }
        }
      } catch (_: any) {}
      if (checkoutElementsFound) break;
    }

    // Source-based check (last resort, with specific patterns)
    const isCheckoutSource = (
      /select.*delivery.*address|ship to this address|payment.*method|place your order/i.test(source)
    );

    const isCheckout = isCheckoutUrl || checkoutElementsFound || isCheckoutSource;

    if (!isCheckout) {
      try {
        await this.driver.saveScreenshot('reports/ios/screenshots/debug-checkout-not-loaded.png');
      } catch (_: any) {}
      try {
        const pageTitle = await this.driver.getTitle().catch(() => 'unknown');
        logger.warn('[E2ESteps] Checkout NOT reached. Current URL: ' + currentUrl + ', Title: ' + pageTitle);
      } catch (_: any) {}
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
