// Amazon India cart page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
// For iOS Safari, delegates to AmazonIOSSafariPage which uses WebView CSS selectors.
//
// CRITICAL: No silent fallbacks. If Proceed to Buy button is not found,
// the operation MUST throw so the scenario fails. All try/catch blocks
// that would hide failures have been removed.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonCartPage = require('./MobileAmazonCartPage');
const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
const config = require('../config/env.config');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

class AmazonCartPage {
  constructor(page) {
    // Detect mobile driver (WebDriverIO) vs Playwright page
    if (page && typeof page.locator !== 'function') {
      // ── iOS Safari: delegate to AmazonIOSSafariPage ──
      const isIOS = config.testPlatform === TEST_PLATFORMS.IOS;
      const isSafari = String(config.mobile.browserName || '').toLowerCase() === 'safari';

      if (isIOS && isSafari) {
        this._iosSafari = new AmazonIOSSafariPage(page);
        this.page = page;

        // Map methods to match MobileAmazonCartPage interface
        this.openCartPage = () =>
          this._iosSafari.openCartPage();

        this.verifyCartPageVisible = () =>
          this._iosSafari.verifyCartPageVisible();

        this.continueShoppingIfPrompted = async () => {
          // No-op for iOS Safari — no continue-shopping prompt in WebView
        };

        this.getCartItems = async () => {
          const items = await page.$$('[data-asin], .sc-list-item').catch(() => []);
          return items;
        };

        this.verifyVisible = async (locator) => {
          // Delegate to AmazonIOSSafariPage.verifyVisible which handles
          // both CSS selector strings and WebDriverIO element references.
          await this._iosSafari.verifyVisible(locator);
        };

        // ════════════════════════════════════════════════════════════════
        // Proceed to Buy button — MUST throw if not found.
        // No silent fallback to hardcoded URL.
        // ════════════════════════════════════════════════════════════════
        this.proceedToBuyButton = {
          click: async () => {
            // Comprehensive mobile selectors for Proceed to Buy / Checkout
            const proceedSelectors = [
              'input[name="proceedToRetailCheckout"]',
              'input[value*="Proceed to Buy"]',
              'input[value*="Proceed to checkout"]',
              'a[href*="gp/buy/select-address"]',
              'a[href*="checkout"]',
              'span[data-action*="proceed-to-checkout"] a',
              'span[data-action*="proceed-to-buy"] input',
              '#sc-buy-box-ptc-button input',
              '.sc-buy-box input[type="submit"]',
              'input[name="proceedToCheckout"]',
              '[name*="proceed"] input[type="submit"]',
              '[id*="proceed"] input[type="submit"]',
            ];

            let button = null;
            let foundSelector = null;

            for (const selector of proceedSelectors) {
              const elements = await page.$$(selector);
              for (const el of elements) {
                const displayed = await el.isDisplayed().catch(() => false);
                if (displayed) {
                  button = el;
                  foundSelector = selector;
                  break;
                }
              }
              if (button) break;
            }

            if (!button) {
              // Capture diagnostic data before failing
              const currentUrl = await page.getUrl().catch(() => 'unknown');
              try {
                const screenshotsDir = 'reports/ios/screenshots';
                const fs = require('fs-extra');
                fs.ensureDirSync(screenshotsDir);
                await page.saveScreenshot(`${screenshotsDir}/debug-proceed-to-buy-not-found.png`);
              } catch (_) {}

              // Log all interactive elements for debugging
              try {
                const allButtons = await page.$$('input[type="submit"], button[type="submit"], a[role="button"], a[href*="proceed"], a[href*="checkout"]');
                const buttonInfo = [];
                for (const btn of allButtons) {
                  const val = await btn.getAttribute('value').catch(() => '');
                  const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
                  const id = await btn.getAttribute('id').catch(() => '');
                  const name = await btn.getAttribute('name').catch(() => '');
                  const text = await btn.getText().catch(() => '');
                  const disp = await btn.isDisplayed().catch(() => false);
                  const href = await btn.getAttribute('href').catch(() => '');
                  buttonInfo.push(`id="${id}" name="${name}" value="${val}" aria-label="${ariaLabel}" text="${text}" href="${href}" displayed=${disp}`);
                }
                logger.warn(`[AmazonCartPage] Interactive elements on page:\n  ${buttonInfo.join('\n  ')}`);
              } catch (_) {}

              throw new Error(
                `[AmazonCartPage] Proceed to Buy button NOT FOUND on cart page.\n` +
                `Current URL: ${currentUrl}\n` +
                `Attempted selectors: ${proceedSelectors.join(', ')}\n` +
                `This means the cart page may not contain a checkout button, ` +
                `or the button is in an unexpected format.`
              );
            }

            // Scroll to the button before clicking
            try {
              await button.scrollIntoView();
              await page.pause(500);
            } catch (_) {}

            logger.info(`[AmazonCartPage] Found Proceed to Buy via selector: "${foundSelector}"`);
            await button.click();
            await page.pause(3000);
            logger.info('[AmazonCartPage] Proceed to Buy clicked.');
          }
        };

        this.cartTitle = null;
        this.continueShoppingButton = null;
        this.emptyCartMessage = null;
        this.cartItems = [];

        return;
      }

      // ── Android / iOS App: use MobileAmazonCartPage ──
      this._mobile = new MobileAmazonCartPage(page);
      this.page = page;
      return;
    }

    // Playwright mode
    this.__base = new BasePage(page);
    const bp = Object.getOwnPropertyNames(BasePage.prototype);
    for (const key of bp) {
      if (key !== 'constructor' && typeof this.__base[key] === 'function') {
        this[key] = this.__base[key].bind(this.__base);
      }
    }

    this.page = page;
    this.cartTitle = page.getByRole('heading', { name: /shopping cart|cart/i }).first();
    this.continueShoppingButton = page
      .locator('input[type="submit"], .a-button-input, button')
      .filter({ hasText: /continue shopping/i })
      .or(page.locator('input[type="submit"][aria-labelledby], .a-button-input').first())
      .first();
    this.emptyCartMessage = page.getByText(/your amazon cart is empty|cart is empty|shopping cart is empty/i).first();
    this.cartItems = page.locator('[data-name="Active Items"] [data-asin], .sc-list-item');
    this.proceedToBuyButton = page.locator('input[name="proceedToRetailCheckout"], input[value*="Proceed to Buy"]').first();
  }

  async openCartPage() {
    if (this._mobile) return this._mobile.openCartPage();
    await this.__base.open('/gp/cart/view.html');
    await this.continueShoppingIfPrompted();
  }

  async verifyCartPageVisible() {
    if (this._mobile) return this._mobile.verifyCartPageVisible();
    await expect(this.page).toHaveURL(/cart|gp\/cart/i, { timeout: 60000 });
    await expect(this.cartTitle.or(this.emptyCartMessage).first()).toBeVisible({ timeout: 60000 });
  }

  async continueShoppingIfPrompted() {
    if (this._mobile) return this._mobile.continueShoppingIfPrompted();
    const promptTextVisible = await this.page
      .getByText(/click the button below to continue shopping/i)
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (promptTextVisible) {
      await this.continueShoppingButton.click({ force: true });
      await this.page.waitForLoadState('domcontentloaded');
    }
  }

  async verifyVisible(locator) {
    if (this._mobile) return this._mobile.verifyVisible(locator);
    await expect(locator).toBeVisible({ timeout: 60000 });
  }
}

module.exports = AmazonCartPage;
