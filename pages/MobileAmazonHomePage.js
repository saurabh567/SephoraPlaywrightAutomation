/**
 * MobileAmazonHomePage — Appium/WebDriverIO page object for Amazon India.
 * Extends MobileBasePage and uses platform-aware locators.
 *
 * Locator strategy: uses `~` (accessibility id) for Android, automatically
 * resolved to `name:` strategy for iOS via MobileBasePage.resolveLocator().
 *
 * Note: For iOS Safari (WebView), AmazonIOSSafariPage is used instead —
 * see AmazonHomePage constructor dispatch.
 */
const MobileBasePage = require('../framework/mobile/MobileBasePage');

class MobileAmazonHomePage extends MobileBasePage {
  constructor(driver) {
    super(driver);

    // Use this.createLocator() for platform-aware locator resolution.
    // On Android: '~nav-logo' stays as-is (accessibility id).
    // On iOS: '~nav-logo' → 'name:nav-logo' (name strategy).
    this.logo = driver.$(this.createLocator('~nav-logo'));
    this.continueShoppingButton = driver.$(this.createLocator('~continue-shopping-button'));
    this.searchBox = driver.$(this.createLocator('~search-box'));
    this.searchButton = driver.$(this.createLocator('~search-button'));
    this.accountLink = driver.$(this.createLocator('~nav-account-list'));
    this.cartLink = driver.$(this.createLocator('~nav-cart'));
    this.cartBadge = driver.$(this.createLocator('~nav-cart-badge'));
  }

  async openHomePage() {
    // Navigate to the Amazon home page.
    // For hybrid/web apps, the url() command navigates the browser directly.
    // For native apps, url() may not be supported — in that case, the app
    // should already be on the home page after session creation.
    const canNavigate = await this.driver.getUrl().then(url => {
      // Native app's getUrl() may throw or return a non-http URL
      return !url || url.startsWith('http');
    }).catch(() => false);

    if (canNavigate) {
      await this.driver.url('https://www.amazon.in');
    }
    await this.driver.pause(2000);
  }

  async waitForAmazonReady() {
    await this.driver.pause(1000);
  }

  async continueShoppingIfPrompted() {
    // Mobile-specific: dismiss any interstitial or continue-shopping prompt
    try {
      const btn = this.driver.$(this.createLocator('~continue-shopping-button'));
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
      const search = this.driver.$(this.createLocator('~search-box'));
      await search.waitForDisplayed({ timeout: 10000 });
      await search.click();
      await search.setValue(productName);
      // Press Enter / search action
      await this.driver.pressKeyCode(66); // ENTER on Android
    } catch (e) {
      // Fallback: use search button
      try {
        const btn = this.driver.$(this.createLocator('~search-button'));
        await btn.click();
      } catch (e2) {
        // Ignore — search may already have triggered
      }
    }
  }

  async openCart() {
    try {
      const cart = this.driver.$(this.createLocator('~nav-cart'));
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
    const element = typeof locator === 'string' ? this.driver.$(this.resolveLocator(locator)) : locator;
    if (!(await element.isDisplayed())) {
      throw new Error(`Element not visible: ${locator}`);
    }
  }
}

module.exports = MobileAmazonHomePage;
