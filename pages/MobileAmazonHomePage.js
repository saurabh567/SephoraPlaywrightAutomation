/**
 * MobileAmazonHomePage — Appium/WebDriverIO page object for Amazon India.
 * Extends MobileBasePage and uses native mobile selectors.
 */
const MobileBasePage = require('../framework/mobile/MobileBasePage');

class MobileAmazonHomePage extends MobileBasePage {
  constructor(driver) {
    super(driver);

    // Native / hybrid Appium selectors
    this.logo = driver.$('~nav-logo');
    this.continueShoppingButton = driver.$('~continue-shopping-button');
    this.searchBox = driver.$('~search-box');
    this.searchButton = driver.$('~search-button');
    this.accountLink = driver.$('~nav-account-list');
    this.cartLink = driver.$('~nav-cart');
    this.cartBadge = driver.$('~nav-cart-badge');
  }

  async openHomePage() {
    // For hybrid apps, navigate to the home URL if web context is available.
    // For native apps, the app should already be on the home page.
    try {
      await this.driver.url('https://www.amazon.in');
    } catch (e) {
      // Native app — may not support url() navigation
    }
    await this.driver.pause(2000);
  }

  async waitForAmazonReady() {
    await this.driver.pause(1000);
  }

  async continueShoppingIfPrompted() {
    // Mobile-specific: dismiss any interstitial or continue-shopping prompt
    try {
      const btn = this.driver.$('~continue-shopping-button');
      if (await btn.isDisplayed()) {
        await btn.click();
        await this.driver.pause(2000);
      }
    } catch (e) {
      // No prompt — continue
    }
  }

  async searchProduct(productName) {
    try {
      const search = this.driver.$('~search-box');
      await search.waitForDisplayed({ timeout: 10000 });
      await search.click();
      await search.setValue(productName);
      // Press Enter / search action
      await this.driver.pressKeyCode(66); // ENTER on Android
    } catch (e) {
      // Fallback: use search button
      try {
        const btn = this.driver.$('~search-button');
        await btn.click();
      } catch (e2) {
        // Ignore — search may already have triggered
      }
    }
  }

  async openCart() {
    try {
      const cart = this.driver.$('~nav-cart');
      await cart.waitForDisplayed({ timeout: 5000 });
      await cart.click();
    } catch (e) {
      // Fallback: navigate via URL if web context
      try {
        await this.driver.url('https://www.amazon.in/gp/cart/view.html');
      } catch (e2) {
        throw new Error('Could not open cart: ' + e.message);
      }
    }
  }

  async verifyVisible(locator) {
    const element = typeof locator === 'string' ? this.driver.$(locator) : locator;
    if (!(await element.isDisplayed())) {
      throw new Error(`Element not visible: ${locator}`);
    }
  }
}

module.exports = MobileAmazonHomePage;
