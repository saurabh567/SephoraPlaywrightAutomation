import logger from '../utils/logger';
import MobileBasePage from '../framework/mobile/MobileBasePage';
/**
 * MobileAmazonHomePage — Appium/WebDriverIO page object for Amazon India.
 * Extends MobileBasePage and uses platform-aware locators.
 *
 * Locator strategy: uses `~` (accessibility id) for Android, automatically
 * resolved to `name:` strategy for iOS via MobileBasePage.resolveSelector().
 *
 * Note: For iOS Safari (WebView), AmazonIOSSafariPage is used instead —
 * see AmazonHomePage constructor dispatch.
 */

class MobileAmazonHomePage extends MobileBasePage {
  [key: string]: any;
  constructor(driver: any) {
    super(driver);

    // Use this.resolveSelector() for platform-aware locator resolution.
    // On Android: '~nav-logo' stays as-is (accessibility id).
    // On iOS: '~nav-logo' → 'name:nav-logo' (name strategy).
    this.logo = driver.$(this.resolveSelector('~nav-logo'));
    this.continueShoppingButton = driver.$(this.resolveSelector('~continue-shopping-button'));
    this.searchBox = driver.$(this.resolveSelector('~search-box'));
    this.searchButton = driver.$(this.resolveSelector('~search-button'));
    this.accountLink = driver.$(this.resolveSelector('~nav-account-list'));
    this.cartLink = driver.$(this.resolveSelector('~nav-cart'));
    this.cartBadge = driver.$(this.resolveSelector('~nav-cart-badge'));
  }

  async openHomePage() {
    // Navigate to the Amazon home page.
    // For hybrid/web apps, the url() command navigates the browser directly.
    // For native apps, url() may not be supported — in that case, the app
    // should already be on the home page after session creation.
    const canNavigate = await this.driver.getUrl().then((url: any) => {
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
      const btn = this.driver.$(this.resolveSelector('~continue-shopping-button'));
      if (await btn.isDisplayed()) {
        await btn.click();
        await this.driver.pause(2000);
      }
    } catch (e: any) {
      // No prompt — continue
    }
  }

  /**
   * Search for a product on Amazon.
   *
   * Strategy (in priority order):
   *   1. Type into search box, then click the search button
   *   2. Fallback: Type into search box, then press Enter key
   *   3. Fallback: Click the search button directly
   *
   * Using the search button click is more reliable than pressKeyCode(66)
   * because the Enter key may not trigger search in all WebView contexts
   * or app versions. The button click explicitly triggers the search action.
   */
  async searchProduct(productName: any) {
    try {
      // Step 1: Find and focus the search box
      const search = this.driver.$(this.resolveSelector('~search-box'));
      await search.waitForDisplayed({ timeout: 10000 });
      await search.click();
      await search.setValue(productName);
      await this.driver.pause(500); // Brief pause for input to settle

      // Step 2: Try clicking the search button first (more reliable than Enter key)
      try {
        const btn = this.driver.$(this.resolveSelector('~search-button'));
        const btnDisplayed = await btn.isDisplayed().catch(() => false);
        if (btnDisplayed) {
          await btn.click();
          logger.info('[MobileAmazonHomePage] Search triggered via search button click');
          await this.driver.pause(2000);
          return;
        }
      } catch (e: any) {
        logger.warn('[MobileAmazonHomePage] Search button click failed, trying Enter key: ' + e.message);
      }

      // Step 3: Fallback — press Enter key (Android key code 66)
      try {
        await this.driver.pressKeyCode(66); // ENTER on Android
        logger.info('[MobileAmazonHomePage] Search triggered via Enter key');
        await this.driver.pause(2000);
        return;
      } catch (e: any) {
        logger.warn('[MobileAmazonHomePage] Enter key also failed: ' + e.message);
      }
    } catch (e: any) {
      // Final fallback: try clicking search button directly
      logger.warn('[MobileAmazonHomePage] Search input failed, trying search button directly: ' + e.message);
      try {
        const btn = this.driver.$(this.resolveSelector('~search-button'));
        await btn.click();
        await this.driver.pause(2000);
      } catch (e2: any) {
        logger.warn('[MobileAmazonHomePage] All search methods failed: ' + e2.message);
      }
    }
  }

  async openCart() {
    try {
      const cart = this.driver.$(this.resolveSelector('~nav-cart'));
      await cart.waitForDisplayed({ timeout: 5000 });
      await cart.click();
    } catch (e: any) {
      // Fallback: navigate via URL if web context
      try {
        await this.driver.url('https://www.amazon.in/gp/cart/view.html');
      } catch (e2: any) {
        throw new Error('Could not open cart: ' + e.message);
      }
    }
  }

  async verifyVisible(locator: any) {
    const element = typeof locator === 'string' ? this.driver.$(this.resolveSelector(locator)) : locator;
    if (!(await element.isDisplayed())) {
      throw new Error(`Element not visible: ${locator}`);
    }
  }
}

export default MobileAmazonHomePage;
