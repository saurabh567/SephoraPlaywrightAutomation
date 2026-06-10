// Amazon India product details page locators and actions.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class AmazonProductDetailsPage extends BasePage {
  constructor(page) {
    super(page);
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
    await this.open(productUrl || '/s?k=laptop');
  }

  async selectQuantity(quantity) {
    const visible = await this.quantityDropdown.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await this.quantityDropdown.selectOption(String(quantity));
    }
  }

  async addToCartIfAvailable() {
    const canAddToCart = await this.addToCartButton.isVisible({ timeout: 10000 }).catch(() => false);
    if (!canAddToCart) {
      return false;
    }

    await this.addToCartButton.click();
    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    return true;
  }

  async openCartFromHeader() {
    await this.cartLink.click();
  }

  async verifyProductDetailsVisible() {
    await expect(this.productTitle).toBeVisible({ timeout: 60000 });
  }
}

module.exports = AmazonProductDetailsPage;
