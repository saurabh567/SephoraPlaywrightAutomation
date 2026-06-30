// Amazon India product details page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonProductDetailsPage = require('./MobileAmazonProductDetailsPage');

class AmazonProductDetailsPage {
  constructor(page) {
    // Detect mobile driver
    if (page && typeof page.locator !== 'function') {
      this._mobile = new MobileAmazonProductDetailsPage(page);
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
    this.productTitle = page.locator('#productTitle').first();
    this.price = page.locator('.a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen').first();
    this.rating = page.locator('#acrPopover, span[data-hook="rating-out-of-text"]').first();
    this.quantityDropdown = page.locator('#quantity').first();
    this.addToCartButton = page.locator('#add-to-cart-button').first();
    this.buyNowButton = page.locator('#buy-now-button').first();
    this.cartConfirmation = page.getByText(/added to cart|added to basket/i).first();
    this.cartLink = page.locator('#nav-cart').first();
  }

  async openProductPage(productUrl) {
    if (this._mobile) return this._mobile.openProductPage(productUrl);
    await this.__base.open(productUrl || '/s?k=laptop');
  }

  async selectQuantity(quantity) {
    if (this._mobile) return this._mobile.selectQuantity(quantity);
    const visible = await this.quantityDropdown.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await this.quantityDropdown.selectOption(String(quantity));
    }
  }

  async addToCartIfAvailable() {
    if (this._mobile) return this._mobile.addToCartIfAvailable();
    const canAddToCart = await this.addToCartButton.isVisible({ timeout: 10000 }).catch(() => false);
    if (!canAddToCart) {
      return false;
    }
    await this.addToCartButton.click();
    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    return true;
  }

  async openCartFromHeader() {
    if (this._mobile) return this._mobile.openCartFromHeader();
    await this.cartLink.click();
  }

  async verifyProductDetailsVisible() {
    if (this._mobile) return this._mobile.verifyProductDetailsVisible();
    await expect(this.productTitle).toBeVisible({ timeout: 60000 });
  }
}

module.exports = AmazonProductDetailsPage;
