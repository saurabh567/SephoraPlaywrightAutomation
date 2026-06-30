/**
 * MobileAmazonCartPage — Appium/WebDriverIO page object for Amazon cart.
 */
const MobileBasePage = require('../framework/mobile/MobileBasePage');

class MobileAmazonCartPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.cartTitle = this.driver.$('~cart-title');
    this.continueShoppingButton = this.driver.$('~continue-shopping-button');
    this.emptyCartMessage = this.driver.$('~empty-cart-message');
    this.cartItems = [];
    this.proceedToBuyButton = this.driver.$('~proceed-to-checkout-button');
  }

  async openCartPage() {
    try {
      await this.driver.url('https://www.amazon.in/gp/cart/view.html');
    } catch (e) {
      // Native app — may not support url navigation
    }
    await this.driver.pause(3000);
  }

  async verifyCartPageVisible() {
    await this.driver.pause(2000);
    // Check if cart page is loaded by looking for cart-specific elements
    const hasTitle = await this.cartTitle.isDisplayed().catch(() => false);
    const hasEmpty = await this.emptyCartMessage.isDisplayed().catch(() => false);
    if (!hasTitle && !hasEmpty) {
      // Fallback: check URL if web context
      throw new Error('Cart page not visible');
    }
  }

  async continueShoppingIfPrompted() {
    try {
      const btn = this.driver.$('~continue-shopping-button');
      if (await btn.isDisplayed()) {
        await btn.click();
        await this.driver.pause(2000);
      }
    } catch (e) {
      // No prompt
    }
  }

  /**
   * Get all cart item elements.
   */
  async getCartItems() {
    try {
      return await this.driver.$$('[data-asin], .sc-list-item');
    } catch (e) {
      return [];
    }
  }

  async verifyVisible(locator) {
    const element = typeof locator === 'string' ? this.driver.$(locator) : locator;
    if (!(await element.isDisplayed())) {
      throw new Error(`Element not visible: ${locator}`);
    }
  }
}

module.exports = MobileAmazonCartPage;
