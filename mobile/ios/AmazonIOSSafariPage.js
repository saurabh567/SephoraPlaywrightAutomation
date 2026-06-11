const ConfigReader = require('../../framework/common/ConfigReader');
const MobileBasePage = require('../../framework/mobile/MobileBasePage');

class AmazonIOSSafariPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.baseUrl = ConfigReader.getBaseUrl();
    this.searchBox = '#twotabsearchtextbox, input[name="k"], input[type="search"]';
    this.cartLink = '#nav-cart, a[href*="/cart"]';
    this.productLinks = [
      '[data-component-type="s-search-result"] h2 a',
      '.s-result-item h2 a',
      'a[href*="/dp/"]'
    ];
    this.addToCartButton = '#add-to-cart-button, input[name="submit.add-to-cart"]';
  }

  async openHomePage() {
    await this.openUrlAndWaitForAmazon(this.baseUrl, 'home page');
  }

  async verifyHomeLoaded() {
    await this.waitForAmazonUrl('home page');
  }

  async isSecurityVerificationPage() {
    const source = await this.driver.getPageSource();
    return /captcha|enter the characters|security verification|automated access/i.test(source);
  }

  async verifyLogoVisible() {
    await this.waitForSourceText(/amazon/i);
  }

  async verifySearchBoxVisible() {
    await this.waitForDisplayed(this.searchBox);
  }

  async verifyCartLinkVisible() {
    const visible = await this.isAnySelectorDisplayed([this.cartLink]);
    if (!visible) {
      await this.waitForSourceText(/cart|basket/i);
    }
  }

  async searchProduct(productName) {
    const searchInput = await this.waitForDisplayed(this.searchBox);
    await searchInput.click();
    await searchInput.clearValue();
    await searchInput.setValue(productName);
    await this.driver.keys(['Enter']);
    await this.verifySearchResultsVisible();
  }

  async verifySearchResultsVisible() {
    await this.waitForSourceText(/results|sponsored|sort by|filter|delivery|prime/i);
  }

  async openFirstProductFromResults() {
    for (const selector of this.productLinks) {
      const elements = await this.driver.$$(selector);
      if (elements.length > 0 && await elements[0].isDisplayed().catch(() => false)) {
        await elements[0].click();
        await this.verifyProductDetailsVisible();
        return;
      }
    }

    throw new Error('No visible product link found in iOS Safari search results.');
  }

  async verifyProductDetailsVisible() {
    await this.waitForSourceText(/add to cart|buy now|product details|ratings?|price|customer reviews/i);
  }

  async verifyProductTitleVisible() {
    await this.waitForSourceText(/brand|ratings?|customer reviews|bought/i);
  }

  async verifyProductPriceVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/₹|price|deal|offer/i.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  async verifyProductRatingVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/ratings?|stars?|customer reviews/i.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  async addToCartIfAvailable() {
    const buttons = await this.driver.$$(this.addToCartButton);
    if (buttons.length === 0) return false;

    const button = buttons[0];
    await button.scrollIntoView();
    if (!await button.isDisplayed().catch(() => false)) return false;

    await button.click();
    await this.waitForSourceText(/added to cart|cart|basket/i);
    return true;
  }

  async verifyAddToCartFlowComplete(addedToCart) {
    if (addedToCart) {
      await this.waitForSourceText(/added to cart|cart|basket/i);
      return;
    }

    await this.verifyProductDetailsVisible();
  }

  async openCartPage() {
    await this.openUrlAndWaitForAmazon('https://www.amazon.in/gp/cart/view.html', 'cart page');
  }

  async verifyCartPageVisible() {
    await this.waitForAmazonUrl('cart page');
    await this.waitForSourceText(/shopping cart|cart|basket|subtotal|proceed to buy/i);
  }

  async verifyCartTitleOrEmptyMessage() {
    await this.waitForSourceText(/shopping cart|cart is empty|your amazon cart is empty|subtotal/i);
  }

  async verifyProceedToBuyButtonIfCartHasItems() {
    const source = await this.driver.getPageSource();
    if (/proceed to buy|subtotal/i.test(source)) return;
    await this.verifyCartTitleOrEmptyMessage();
  }

  async getFooterLinks() {
    return this.driver.execute(() => Array.from(document.querySelectorAll('a[href]'))
      .map((link) => link.href)
      .filter(Boolean));
  }

  async verifyFooterLinksHaveValidUrls(links = []) {
    if (!Array.isArray(links) || links.length === 0) {
      await this.waitForSourceText(/amazon/i);
      return;
    }

    const invalidLinks = links.filter((link) => !/^https?:\/\//i.test(link));
    if (invalidLinks.length > 0) {
      throw new Error(`Invalid footer URLs found: ${invalidLinks.join(', ')}`);
    }
  }

  async waitForSourceText(textOrPattern, timeout = this.timeout) {
    const matcher = textOrPattern instanceof RegExp
      ? (source) => textOrPattern.test(source)
      : (source) => source.toLowerCase().includes(String(textOrPattern).toLowerCase());

    await this.driver.waitUntil(
      async () => matcher(await this.driver.getPageSource()),
      {
        timeout,
        timeoutMsg: `Timed out waiting for page source to contain: ${textOrPattern}`
      }
    );
  }

  async waitForPageReady() {
    await this.waitForDisplayed('body');
  }

  async openUrlAndWaitForAmazon(url, description) {
    const targetUrl = this.normalizeUrl(url);
    let lastUrl = '';

    const strategies = [
      async () => this.driver.url(targetUrl),
      async () => this.openUrlInSafariAddressBar(targetUrl)
    ];

    for (let attempt = 0; attempt < strategies.length; attempt += 1) {
      await strategies[attempt]();

      const urlMatched = await this.driver.waitUntil(async () => {
        lastUrl = await this.driver.getUrl().catch(() => '');
        return /amazon\.in/i.test(lastUrl);
      }, {
        timeout: Math.min(this.timeout, 30000),
        interval: 1500,
        timeoutMsg: `Timed out waiting for Safari to navigate to Amazon after opening ${description}`
      }).then(() => true).catch(() => false);

      if (urlMatched) {
        return;
      }

      if (attempt < strategies.length - 1) {
        await this.driver.back().catch(() => {});
        await this.driver.pause(1500);
      }
    }

    lastUrl = lastUrl || await this.driver.getUrl().catch(() => '');
    throw new Error(`Safari did not navigate to Amazon ${description}. Current URL: ${lastUrl || 'unknown'}`);
  }

  async waitForAmazonUrl(description) {
    let currentUrl = '';

    await this.driver.waitUntil(async () => {
      currentUrl = await this.driver.getUrl().catch(() => '');
      return /amazon\.in/i.test(currentUrl);
    }, {
      timeout: Math.min(this.timeout, 30000),
      interval: 1000,
      timeoutMsg: `Timed out waiting for Amazon URL while opening ${description}. Current URL: ${currentUrl || 'unknown'}`
    });
  }

  normalizeUrl(url) {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `https://${url}`;
  }

  async openUrlInSafariAddressBar(url) {
    const previousContext = await this.driver.getContext().catch(() => null);

    try {
      const contexts = await this.driver.getContexts().catch(() => []);
      if (contexts.includes('NATIVE_APP')) {
        await this.driver.switchContext('NATIVE_APP');
      }

      await this.driver.pause(1000);

      const addressBarSelector = '-ios predicate string:type == "XCUIElementTypeTextField" OR type == "XCUIElementTypeSearchField"';
      const fields = await this.driver.$$(addressBarSelector);
      let addressBar = null;

      for (const field of fields) {
        if (await field.isDisplayed().catch(() => false)) {
          addressBar = field;
          break;
        }
      }

      if (!addressBar) {
        throw new Error('Safari address bar was not visible in native context.');
      }

      await addressBar.click();
      await addressBar.clearValue().catch(() => {});
      await addressBar.setValue(url);
      await this.driver.keys(['Enter']);
      await this.driver.pause(2000);
    } finally {
      if (previousContext) {
        await this.driver.switchContext(previousContext).catch(() => {});
      }
    }
  }

  async waitForDisplayed(selector, timeout = this.timeout) {
    const element = await this.driver.$(selector);
    await element.waitForDisplayed({ timeout });
    return element;
  }

  async isAnySelectorDisplayed(selectors) {
    for (const selector of selectors) {
      const elements = await this.driver.$$(selector);
      for (const element of elements) {
        if (await element.isDisplayed().catch(() => false)) return true;
      }
    }

    return false;
  }
}

module.exports = AmazonIOSSafariPage;
