// Amazon India cart page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonCartPage = require('./MobileAmazonCartPage');

class AmazonCartPage {
  constructor(page) {
    // Detect mobile driver
    if (page && typeof page.locator !== 'function') {
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
