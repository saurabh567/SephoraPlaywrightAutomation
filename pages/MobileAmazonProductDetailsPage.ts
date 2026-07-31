import MobileBasePage from '../framework/mobile/MobileBasePage';
/**
 * MobileAmazonProductDetailsPage — Appium/WebDriverIO page object for Amazon product details.
 * Uses platform-aware locators via MobileBasePage.
 */

class MobileAmazonProductDetailsPage extends MobileBasePage {
  [key: string]: any;
  constructor(driver: any) {
    super(driver);
    this.productTitle = null;
    this.addToCartButton = this.driver.$(this.resolveSelector('~add-to-cart-button'));
    this.buyNowButton = this.driver.$(this.resolveSelector('~buy-now-button'));
    this.cartConfirmation = this.driver.$(this.resolveSelector('~cart-confirmation'));
    this.cartLink = this.driver.$(this.resolveSelector('~nav-cart'));
  }

  async openProductPage(productUrl: any) {
    try {
      await this.driver.url(productUrl || 'https://www.amazon.in');
    } catch (e: any) {
      // Native app — may not support url navigation
    }
    await this.driver.pause(3000);
  }

  async selectQuantity(quantity: any) {
    try {
      const qty = this.driver.$(this.resolveSelector('~quantity-selector'));
      if (await qty.isDisplayed()) {
        await qty.click();
        const option = this.driver.$(this.resolveSelector(`~quantity-${quantity}`));
        if (await option.isDisplayed()) {
          await option.click();
        }
      }
    } catch (e: any) {
      // Quantity selector not available
    }
  }

  async addToCartIfAvailable() {
    try {
      const btn = this.driver.$(this.resolveSelector('~add-to-cart-button'));
      if (await btn.isDisplayed()) {
        await btn.click();
        await this.driver.pause(3000);
        return true;
      }
    } catch (e: any) {
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
    } catch (e: any) {
      // Not available
    }

    return false;
  }

  async openCartFromHeader() {
    try {
      await this.cartLink.click();
      await this.driver.pause(2000);
    } catch (e: any) {
      // Try navigating directly
      try {
        await this.driver.url('https://www.amazon.in/gp/cart/view.html');
      } catch (e2: any) {
        throw new Error('Could not open cart: ' + e.message);
      }
    }
  }

  async verifyProductDetailsVisible() {
    await this.driver.pause(2000);
    const title = this.driver.$(this.resolveSelector('~product-title'));
    if (!(await title.isDisplayed().catch(() => false))) {
      // Fallback: check for any product content
      const content = this.driver.$('#productTitle');
      if (!(await content.isDisplayed().catch(() => false))) {
        throw new Error('Product details page not visible');
      }
    }
  }
}

export default MobileAmazonProductDetailsPage;
