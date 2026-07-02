/**
 * AmazonCartPage — unified cart page for Web, iOS Safari, and Android.
 *
 * Architecture:
 *   - Web (Playwright): Uses Playwright locators via BasePage
 *   - iOS Safari (WebDriverIO): Uses MobileAmazonCartPage (platform-aware)
 *   - Android (WebDriverIO): Uses MobileAmazonCartPage (platform-aware)
 *
 * MobileAmazonCartPage handles all platform differences internally:
 *   - Platform-specific selector maps (ios vs android)
 *   - Fallback chain: CSS → XPath → JS execution → URL navigation
 *   - Diagnostic capture on failure
 */
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonCartPage = require('./MobileAmazonCartPage');
const config = require('../config/env.config');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

class AmazonCartPage {
  /**
   * @param {object} page - Playwright page (web) or WebDriverIO driver (mobile)
   */
  constructor(page) {
    // ── Detect mobile driver (WebDriverIO) vs Playwright page ──────────
    if (page && typeof page.locator !== 'function') {
      const isIOS = config.testPlatform === TEST_PLATFORMS.IOS;
      const isSafari = String(config.mobile.browserName || '').toLowerCase() === 'safari';

      if (isIOS && isSafari) {
        // ── iOS Safari: use AmazonIOSSafariPage (CSS selectors in WebView) ──
        const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
        this._mobile = new AmazonIOSSafariPage(page);
        this.page = page;

        // Map AmazonIOSSafariPage cart methods to this interface
        this.openCartPage = () => this._mobile.openCartPage();
        this.verifyCartPageVisible = () => this._mobile.verifyCartPageVisible();
        this.removeItemFromCart = () => this._mobile.removeItemFromCart();
        this.proceedToCheckout = () => this._mobile.proceedToCheckout();
        this.continueShoppingIfPrompted = async () => {};
        this.getCartItems = async () => [];
        this.verifyVisible = (locator) => this._mobile.verifyVisible(locator);

        // Legacy proceedToBuyButton interface
        this.proceedToBuyButton = {
          click: () => this._mobile.proceedToCheckout(),
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

      // Map MobileAmazonCartPage methods to this interface
      this.openCartPage = () => this._mobile.openCartPage();
      this.verifyCartPageVisible = () => this._mobile.verifyCartPageVisible();
      this.continueShoppingIfPrompted = () => this._mobile.continueShoppingIfPrompted();
      this.getCartItems = () => this._mobile.getCartItems();
      this.verifyVisible = (locator) => this._mobile.verifyVisible(locator);
      this.removeItemFromCart = () => this._mobile.removeItemFromCart();
      this.proceedToCheckout = () => this._mobile.proceedToCheckout();

      // Legacy proceedToBuyButton interface (some step defs still use it)
      this.proceedToBuyButton = {
        click: () => this._mobile.proceedToCheckout(),
      };

      this.cartTitle = null;
      this.continueShoppingButton = null;
      this.emptyCartMessage = null;
      this.cartItems = [];

      return;
    }

    // ── Playwright mode (web) ──────────────────────────────────────────
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
