/**
 * MobileAmazonProductDetailsPage — Appium/WebDriverIO page object for Amazon product details.
 */
const MobileBasePage = require('../framework/mobile/MobileBasePage');

class MobileAmazonProductDetailsPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.productTitle = null;
    this.addToCartButton = this.driver.$('~add-to-cart-button');
    this.buyNowButton = this.driver.$('~buy-now-button');
    this.cartConfirmation = this.driver.$('~cart-confirmation');
    this.cartLink = this.driver.$('~nav-cart');
  }

  async openProductPage(productUrl) {
    try {
      await this.driver.url(productUrl || 'https://www.amazon.in');
    } catch (e) {
      // Native app — may not support url navigation
    }
    await this.driver.pause(3000);
  }

  async selectQuantity(quantity) {
    try {
      const qty = this.driver.$('~quantity-selector');
      if (await qty.isDisplayed()) {
        await qty.click();
        const option = this.driver.$(`~quantity-${quantity}`);
        if (await option.isDisplayed()) {
          await option.click();
        }
      }
    } catch (e) {
      // Quantity selector not available
    }
  }

  async addToCartIfAvailable() {
    try {
      const btn = this.driver.$('~add-to-cart-button');
      if (await btn.isDisplayed()) {
        await btn.click();
        await this.driver.pause(3000);
        return true;
      }
    } catch (e) {
      // Button not found
    }

    // Fallback: try by XPath
    try {
      const btn = this.driver.$('//*[@id="add-to-cart-button"]');
      if (await btn.isDisplayed({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        await this.driver.pause(3000);
        return true;
      }
    } catch (e) {
      // Not available
    }

    return false;
  }

  async openCartFromHeader() {
    try {
      await this.cartLink.click();
      await this.driver.pause(2000);
    } catch (e) {
      // Try navigating directly
      try {
        await this.driver.url('https://www.amazon.in/gp/cart/view.html');
      } catch (e2) {
        throw new Error('Could not open cart: ' + e.message);
      }
    }
  }

  async verifyProductDetailsVisible() {
    await this.driver.pause(2000);
    const title = this.driver.$('~product-title');
    if (!(await title.isDisplayed().catch(() => false))) {
      // Fallback: check for any product content
      const content = this.driver.$('#productTitle');
      if (!(await content.isDisplayed().catch(() => false))) {
        throw new Error('Product details page not visible');
      }
    }
  }
}

module.exports = MobileAmazonProductDetailsPage;
