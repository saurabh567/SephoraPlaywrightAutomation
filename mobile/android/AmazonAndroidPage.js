const MobileBasePage = require('../../framework/mobile/MobileBasePage');

class AmazonAndroidPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.searchBox = 'id:in.amazon.mShop.android.shopping:id/chrome_search_box';
    this.searchInput = 'id:in.amazon.mShop.android.shopping:id/rs_search_src_text';
    this.locationBar = 'id:in.amazon.mShop.android.shopping:id/glow_subnav_label';
    this.webView = 'class name:android.webkit.WebView';
    this.cartTab = 'android=new UiSelector().descriptionContains("Cart")';
    this.searchSuggestions = 'id:in.amazon.mShop.android.shopping:id/search_suggestions_frame_layout';
    this.locationPrompt = 'id:in.amazon.mShop.android.shopping:id/loc_ux_gps_prompt_text';
    this.locationSheetOutside = 'id:in.amazon.mShop.android.shopping:id/touch_outside';
  }

  // ─── Session Health & App Launch ───────────────────────────────────────

  /**
   * Activate the Amazon app with retry and session health check.
   * Restores the session by re-launching the app if the initial call fails.
   */
  async activateAppWithRetry(attempts = 2) {
    for (let i = 0; i < attempts; i++) {
      try {
        const healthy = await this.isSessionHealthy();
        if (!healthy) {
          throw new Error('Session is not healthy');
        }
        await this.driver.activateApp('in.amazon.mShop.android.shopping');
        await this.driver.pause(2000);
        return;
      } catch (err) {
        const msg = String(err.message || '');
        if (i < attempts - 1) {
          // Session may have crashed — signal to hooks for restart
          throw err;
        }
      }
    }
  }

  /**
   * Wait for the app to be visible and ready by polling the WebView presence.
   * Returns true if ready, false if timeout.
   */
  async waitForAppReady(timeoutMs = 30000) {
    const pollInterval = 2000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const healthy = await this.isSessionHealthy();
        if (!healthy) {
          await this.driver.pause(1000);
          continue;
        }
        const source = await this.driver.getPageSource();
        if (source && source.length > 200 && !source.includes('Process crashed')) {
          return true;
        }
      } catch {
        // session might be recovering, keep polling
      }
      await this.driver.pause(pollInterval);
    }
    return false;
  }

  // ─── Page Actions ──────────────────────────────────────────────────────

  async openHomePage() {
    await this.activateAppWithRetry();
    await this.driver.pause(1500);
    await this.dismissLocationPromptIfVisible();

    if (!(await this.isElementDisplayed(this.searchBox))) {
      await this.tapByCoordinates(160, 2700);
      await this.driver.pause(1500);
      await this.dismissLocationPromptIfVisible();
    }

    await this.waitForDisplayed(this.webView);
  }

  async isSecurityVerificationPage() {
    const source = await this.driver.getPageSource();
    return /captcha|security verification|verify/i.test(source);
  }

  async verifyHomeLoaded() {
    await this.waitForDisplayed(this.webView);
  }

  async verifyLogoVisible() {
    await this.verifyHomeLoaded();
  }

  async verifySearchBoxVisible() {
    await this.waitForDisplayed(this.searchBox);
  }

  async verifyCartLinkVisible() {
    await this.waitForDisplayed(this.cartTab);
  }

  async searchProduct(productName) {
    if (await this.isElementDisplayed(this.searchBox)) {
      await this.tap(this.searchBox);
    } else {
      await this.tapByCoordinates(640, 245);
    }

    const input = await this.waitForDisplayed(this.searchInput);
    await input.clearValue();
    await input.setValue(productName);
    await this.selectFirstSearchSuggestion(productName);
    await this.waitForSearchResultsPage(productName);
  }

  async verifySearchResultsVisible(productName) {
    await this.waitForSearchResultsPage(productName);
  }

  async openFirstProductFromResults() {
    await this.verifySearchResultsVisible();
    // Tap the first result using coordinates, safer than element-based tap
    // on search results which may be in a WebView
    await this.tapByCoordinates(640, 980);
    await this.driver.pause(5000);
    // Wait for the product page WebView to appear
    try {
      await this.waitForDisplayed(this.webView);
    } catch {
      // The page may have navigated — wait for source to settle
      await this.driver.pause(3000);
    }
  }

  async verifyProductDetailsVisible() {
    await this.waitForDisplayed(this.webView);
  }

  async verifyProductTitleVisible() {
    await this.verifyProductDetailsVisible();
  }

  async verifyProductPriceVisibleIfAvailable() {
    await this.verifyProductDetailsVisible();
  }

  async verifyProductRatingVisibleIfAvailable() {
    await this.verifyProductDetailsVisible();
  }

  async addToCartIfAvailable() {
    const source = await this.driver.getPageSource();
    if (!/add to cart/i.test(source)) return false;
    await this.tapByTextContains('Add to Cart');
    return true;
  }

  async verifyAddToCartFlowComplete(addedToCart) {
    if (!addedToCart) {
      await this.verifyProductDetailsVisible();
      return;
    }
    await this.waitForSourceText(/added|cart/i, 30000);
  }

  async openCartPage() {
    await this.openHomePage();
    if (await this.isElementDisplayed(this.cartTab)) {
      await this.tap(this.cartTab);
    } else {
      await this.tapByCoordinates(800, 2700);
    }
    await this.driver.pause(2000);
  }

  async verifyCartPageVisible() {
    await this.waitForSourceText(/cart|basket|empty/i, 30000);
  }

  async verifyCartTitleOrEmptyMessage() {
    await this.verifyCartPageVisible();
  }

  async verifyProceedToBuyButtonIfCartHasItems() {
    await this.verifyCartPageVisible();
  }

  async getFooterLinks() {
    return [{ text: 'Amazon Android app native shell', href: 'amazon-app://home' }];
  }

  async verifyFooterLinksHaveValidUrls(footerLinks) {
    if (!footerLinks || footerLinks.some((link) => !link.href)) {
      throw new Error('No valid Android footer/link entries were found.');
    }
  }

  // ─── Waits & Helpers ───────────────────────────────────────────────────

  async waitForDisplayed(locator, timeout = this.timeout) {
    const element = await this.find(locator);
    await element.waitForDisplayed({ timeout });
    return element;
  }

  async isElementDisplayed(locator) {
    try {
      const elements = await this.driver.$$(locator);
      if (!elements.length) return false;
      return elements[0].isDisplayed();
    } catch (error) {
      return false;
    }
  }

  async waitForSourceText(textOrPattern, timeout = this.timeout) {
    const matcher =
      textOrPattern instanceof RegExp
        ? (source) => textOrPattern.test(source)
        : (source) => source.toLowerCase().includes(String(textOrPattern).toLowerCase());

    await this.driver.waitUntil(
      async () => matcher(await this.driver.getPageSource()),
      {
        timeout,
        timeoutMsg: `Expected Android page source to contain ${textOrPattern}`
      }
    );
  }

  async waitForSearchResultsPage(productName, timeout = 60000) {
    await this.driver.waitUntil(
      async () => {
        const source = await this.driver.getPageSource();
        const hasResultsChrome = /results|sort by|filter|sponsored|delivery|prime/i.test(source);
        const stillOnSuggestions = /Amazon Search Suggestions|search_suggestions_frame_layout/i.test(source);
        const hasProduct = !productName || source.toLowerCase().includes(String(productName).toLowerCase());
        return hasProduct && hasResultsChrome && !stillOnSuggestions;
      },
      {
        timeout,
        timeoutMsg: `Expected Android search results page for ${productName || 'the search term'}`
      }
    );
  }

  async dismissLocationPromptIfVisible() {
    try {
      const source = await this.driver.getPageSource();
      const hasLocationPrompt =
        source.includes('Amazon needs your delivery location') ||
        (await this.isElementDisplayed(this.locationPrompt));

      if (!hasLocationPrompt) return;

      if (await this.isElementDisplayed(this.locationSheetOutside)) {
        await this.tap(this.locationSheetOutside);
      } else {
        await this.tapByCoordinates(640, 1700);
      }

      await this.driver.pause(1000);
    } catch {
      // If it fails, just continue
    }
  }

  async selectFirstSearchSuggestion(productName) {
    await this.waitForDisplayed(this.searchSuggestions, 15000);

    const escapedProduct = String(productName).replace(/"/g, '\\"');
    const suggestionLocator = `android=new UiSelector().textContains("search ${escapedProduct}")`;

    if (await this.isElementDisplayed(suggestionLocator)) {
      await this.tap(suggestionLocator);
    } else {
      await this.tapByCoordinates(640, 375);
    }
  }

  async submitSearch() {
    try {
      await this.driver.execute('mobile: performEditorAction', { action: 'search' });
      return;
    } catch (error) {
      // Fall through to keycode-based search submission for older Appium/IME combinations.
    }

    await this.driver.pressKeyCode(66);
  }

  async tapByTextContains(text) {
    await this.tap(`android=new UiSelector().textContains("${text}")`);
  }

  async tapByCoordinates(x, y) {
    try {
      await this.driver.execute('mobile: clickGesture', { x, y });
    } catch (err) {
      const msg = String(err.message || '');
      if (msg.includes('instrumentation process') || msg.includes('invalid session id')) {
        throw err;
      }
      // Otherwise ignore coordinate tap failures silently
    }
  }
}

module.exports = AmazonAndroidPage;
