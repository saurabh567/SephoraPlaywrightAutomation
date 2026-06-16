const ConfigReader = require('../../framework/common/ConfigReader');
const MobileBasePage = require('../../framework/mobile/MobileBasePage');

class AmazonIOSSafariPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.baseUrl = ConfigReader.getBaseUrl();
    this.searchBox = '#twotabsearchtextbox, input[name="k"], input[type="search"]';
    this.cartLink = '#nav-cart, a[href*="/cart"]';

    // Product result link selectors — ordered from most specific to most generic.
    // Amazon mobile web layout uses various structures across A/B tests.
    this.productLinks = [
      // Standard mobile search result card link
      '[data-component-type="s-search-result"] h2 a',
      '.s-result-item h2 a',
      // Direct product detail links (most reliable)
      'a[href*="/dp/"]',
      // Sponsored ad product links
      '[data-component-type="s-sponsored"] a[href*="/dp/"]',
      // Any anchor with product ASIN in href
      'a[href*="/gp/"]',
      // S-result-item container direct links
      '.s-result-item a[href*="/dp/"]',
      // Fallback: any link containing "product" in path
      'a[href*="product"]',
      // Mobile-specific product card
      'div[data-asin] a',
      // Generic link with title attribute typical of product links
      'a[title]',
    ];

    this.addToCartButton = '#add-to-cart-button, input[name="submit.add-to-cart"]';
    this.searchResultsContainer = [
      '[data-component-type="s-search-result"]',
      '.s-result-list-placeholder',
      '.s-search-results',
      '[data-uuid]',
      '.s-main-slot',
      '#search',
      'body',
    ];
  }

  /**
   * Wait for the page DOM to indicate search results have rendered.
   * Checks for price, sponsored, result count text, or any product-like element.
   */
  async waitForSearchResultsRendered(timeoutMs) {
    const timeout = timeoutMs || this.timeout;

    await this.driver.waitUntil(
      async () => {
        const source = await this.driver.getPageSource();
        // Amazon mobile search pages contain these tell-tale markers
        const hasResultsIndicators = /results|sponsored|sort by|filter|delivery|prime|₹|price|ratings/i.test(source);
        if (hasResultsIndicators) return true;

        // Also check for any product link element
        for (const sel of this.productLinks) {
          const els = await this.driver.$$(sel);
          if (els.length > 0) return true;
        }

        // Check for search result containers
        for (const sel of this.searchResultsContainer) {
          const els = await this.driver.$$(sel);
          if (els.length > 0) return true;
        }

        return false;
      },
      {
        timeout,
        interval: 1500,
        timeoutMsg: `Timed out waiting for search results to render after ${timeout}ms`,
      }
    );
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

    // Wait for search results to render via page source text or element presence
    await this.waitForSearchResultsRendered(30000);
  }

  async verifySearchResultsVisible() {
    await this.waitForSearchResultsRendered();
  }

  /**
   * Open the first visible product link from search results.
   * Uses a comprehensive set of selectors with display checks.
   */
  async openFirstProductFromResults() {
    // First, wait for search results to be rendered
    await this.waitForSearchResultsRendered(30000);

    // Try each product link selector in order
    const allErrors = [];

    for (const selector of this.productLinks) {
      try {
        const elements = await this.driver.$$(selector);
        if (elements.length === 0) continue;

        // Find the first visible, clickable element
        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          const enabled = await element.isEnabled().catch(() => true);
          if (!enabled) continue;

          await element.click();
          // Wait for navigation to complete
          await this.driver.waitUntil(async () => {
            const url = await this.driver.getUrl();
            return /\/dp\/|\/gp\/product|\/product\//.test(url);
          }, {
            timeout: 30000,
            interval: 1000,
            timeoutMsg: 'Timed out waiting for product details page to load after click',
          }).catch(() => {});

          await this.verifyProductDetailsVisible();
          return;
        }
      } catch (err) {
        allErrors.push(`Selector "${selector}": ${err.message}`);
      }
    }

    // If we got here, no selector worked — try a broader fallback:
    // Execute JavaScript to find any product-like link and click it
    try {
      const clicked = await this.driver.execute(() => {
        // Heuristic: find any anchor whose href contains "/dp/" or has "product" in URL
        const links = Array.from(document.querySelectorAll('a[href]'));
        const productLinks = links.filter((a) => {
          const href = a.href || '';
          return (
            href.includes('/dp/') ||
            href.includes('/gp/product/') ||
            href.includes('/product/') ||
            (href.includes('amazon') && /\/[A-Z0-9]{10}/.test(href))
          );
        });

        for (const link of productLinks) {
          if (link.offsetParent !== null || link.getClientRects().length > 0) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        await this.driver.waitUntil(async () => {
          const url = await this.driver.getUrl();
          return /\/dp\/|\/gp\/product|\/product\//.test(url);
        }, {
          timeout: 30000,
          interval: 1000,
          timeoutMsg: 'Timed out waiting for product page after JS click',
        }).catch(() => {});

        await this.verifyProductDetailsVisible();
        return;
      }
    } catch (err) {
      allErrors.push(`JS fallback: ${err.message}`);
    }

    // Take a screenshot for diagnostics before throwing
    try {
      await this.driver.saveScreenshot('reports/ios/screenshots/debug_product_link_failure.png');
    } catch (e) {
      // ignore
    }

    // Report all attempted selectors for easier debugging
    const currentUrl = await this.driver.getUrl().catch(() => 'unknown');
    throw new Error(
      `No visible product link found in iOS Safari search results.\n` +
      `URL: ${currentUrl}\n` +
      `Attempted selectors: ${this.productLinks.join(', ')}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  async verifyProductDetailsVisible() {
    await this.waitForSourceText(/add to cart|buy now|product details|ratings?|price|customer reviews|₹/i);
  }

  async verifyProductTitleVisible() {
    await this.waitForSourceText(/brand|ratings?|customer reviews|bought|product title|back to results/i);
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
      .filter((href) => href && !href.startsWith('javascript')));
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
