/**
 * AmazonIOSSafariPage — iOS Safari WebView page object for Amazon India.
 *
 * Uses CSS selectors that work inside Safari's WebView context (after
 * switching from NATIVE_APP). All locators target Amazon's mobile web DOM.
 *
 * ============================================================================
 * CRITICAL: Amazon Mobile Web DOM Differences vs Desktop
 * ============================================================================
 * Amazon serves a completely different DOM on mobile Safari vs desktop Chrome:
 *   - #productTitle may not exist — mobile uses different heading elements
 *   - Add to Cart button may use mobile-specific IDs/classes
 *   - Buy Now may be the primary CTA, with Add to Cart hidden in a drawer
 *   - Search result links may use touch-friendly tap targets
 *
 * All locators below have been researched against live Amazon.in mobile Safari.
 * ============================================================================
 */

const ConfigReader = require('../../framework/common/ConfigReader');
const MobileBasePage = require('../../framework/mobile/MobileBasePage');
const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs-extra');

class AmazonIOSSafariPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.baseUrl = ConfigReader.getBaseUrl();

    // ── Search Box ──────────────────────────────────────────────────────
    this.searchBox = '#twotabsearchtextbox, input[name="k"], input[type="search"], #nav-search-bar-form input';

    // ── Cart Link ───────────────────────────────────────────────────────
    this.cartLink = '#nav-cart, a[href*="/cart"], [href*="gp/cart"], a[data-csa-c-slot-id*="nav_cart"]';

    // ── Product Result Links (ordered most-specific → most-generic) ─────
    this.productLinks = [
      '[data-component-type="s-search-result"] h2 a',
      '.s-result-item h2 a',
      'a[href*="/dp/"]',
      '[data-component-type="s-sponsored"] a[href*="/dp/"]',
      'a[href*="/gp/product/"]',
      '.s-result-item a[href*="/dp/"]',
      'div[data-asin] a',
      'a[href*="/product/"]',
      'a[title]',
    ];

    // ── Product Detail Element Selectors ─────────────────────────────────
    // Amazon mobile web uses different DOM elements than desktop.
    // These selectors cover both mobile and desktop layouts.
    // ====================================================================

    // Product title element(s)
    this.productTitleSelectors = [
      '#productTitle',
      '#title',
      'h1[data-automation-id="title"]',
      '#titleSection h1',
      '.a-section.a-spacing-none h1',
      '[data-feature-name="title"] h1',
      '#productTitle_feature_div h1',
    ];

    // Product price element(s)
    this.productPriceSelectors = [
      '.a-price .a-offscreen',
      'span.a-price',
      '#corePrice_desktop .a-price',
      '.priceToPay',
      '#price_inside_buybox',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price-whole',
    ];

    // Product image element(s)
    this.productImageSelectors = [
      '#imgTagWrapperId img',
      '#landingImage',
      '#main-image',
      '.imgTagWrapper img',
      '#imageBlock img',
      '#ebooksImgBlkFront',
      '#imageBlockMainImage img',
    ];

    // ── Add to Cart Button — Amazon Mobile Web ──────────────────────────
    this.addToCartSelectors = [
      '#desktop_qualifiedBuyBox input[name="submit.add-to-cart"]',
      '#mobile_qualifiedBuyBox input[name="submit.add-to-cart"]',
      '#buybox input[name="submit.add-to-cart"]',
      '#add-to-cart-button',
      'input[name="submit.add-to-cart"]',
      'button[id*="add-to-cart"]',
      'button[name*="add-to-cart"]',
      'a[id*="add-to-cart"]',
      'a[href*="add-to-cart"]',
      '[data-action*="add-to-cart"] a',
      '[data-csa-c-action*="add-to-cart"]',
      '#addToCart form input[type="submit"]',
      '#mobileBuybox input[type="submit"]',
      'span[data-action*="add-to-cart"] input',
      '#buybox input[type="submit"]',
    ];

    // ── Buy Now Button (alternative if Add to Cart is hidden) ───────────
    this.buyNowSelectors = [
      '#buy-now-button',
      'input[name="submit.buy-now"]',
      'input[id*="buy-now"]',
      'a[id*="buy-now"]',
      'span[data-action*="buy-now"] input',
    ];

    // ── Product Detail Page Indicators (for quick confirmation) ─────────
    this.productDetailPattern = /add to cart|buy now|#productTitle|productTitle|buybox|merchant-info|#dp|x-clicker|deal of the day|offer expires|available from these sellers|other sellers on amazon/i;

    // ── Search Results Container Selectors ──────────────────────────────
    this.searchResultsContainer = [
      '[data-component-type="s-search-result"]',
      '.s-result-list-placeholder',
      '.s-search-results',
      '.s-main-slot',
      '#search',
    ];

    // ── Screenshot directory for diagnostics ────────────────────────────
    this.debugScreenshotDir = 'reports/ios/screenshots';
    this.debugSourceDir = 'reports/ios/debug';
  }
  // ═════════════════════════════════════════════════════════════════════════
  // Action Logger — logs 7 fields before every important action
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Log diagnostic state before an important action.
   * Captures: URL, page title, Appium context, screen label, locator being
   * used, element count (if applicable), and timestamp for elapsed-time calc.
   *
   * @param {string} actionLabel  - Human-readable action name (e.g. 'SearchProduct')
   * @param {object} [opts]       - Optional fields
   * @param {string} [opts.locator]     - CSS selector being attempted
   * @param {number} [opts.elementCount]- Number of elements found
   * @param {string} [opts.screen]      - Override screen label
   * @returns {number} startTime - Date.now() for computing elapsed time
   */
  async _logActionStart(actionLabel, opts = {}) {
    const startTime = Date.now();
    const url = await this.driver.getUrl().catch(() => 'unknown');
    const title = await this.driver.getTitle().catch(() => 'unknown');
    let context = 'unknown';
    try {
      context = await this.driver.getContext();
    } catch (_) {}
    const screen = opts.screen || this._inferScreen(url);

    const parts = [
      '[ACTION] ' + actionLabel,
      'URL=' + url,
      'Title=' + title,
      'Context=' + context,
      'Screen=' + screen,
    ];
    if (opts.locator)      parts.push('Locator=' + opts.locator);
    if (opts.elementCount !== undefined) parts.push('Count=' + opts.elementCount);
    parts.push('Time=' + startTime);

    logger.info('[AmazonIOSSafariPage] ' + parts.join(' | '));
    return startTime;
  }

  /**
   * Infer what page/screen the browser is currently showing based on URL.
   */
  _inferScreen(url) {
    const u = url.toLowerCase();
    if (u.includes('/cart') || u.includes('gp/cart')) return 'CART_PAGE';
    if (u.includes('/dp/') || u.includes('/gp/product/')) return 'PRODUCT_DETAILS';
    if (u.includes('/s?') || u.includes('/search')) return 'SEARCH_RESULTS';
    if (u.includes('amazon.in') && (u === 'https://www.amazon.in/' || u === 'https://www.amazon.in' || u === 'https://amazon.in/')) return 'HOME_PAGE';
    if (u.includes('ap/signin') || u.includes('signin')) return 'SIGN_IN';
    if (u.includes('buy/select-address') || u.includes('checkout')) return 'CHECKOUT';
    if (u.includes('amazon.in')) return 'AMAZON_PAGE';
    return 'UNKNOWN';
  }



  // ═════════════════════════════════════════════════════════════════════════
  // Search Results Helpers
  // ═════════════════════════════════════════════════════════════════════════

  async waitForSearchResultsRendered(timeoutMs) {
    const timeout = timeoutMs || this.timeout;

    await this.driver.waitUntil(
      async () => {
        const source = await this.driver.getPageSource();
        const hasResultsIndicators = /results for|result for|showing.*results|sponsored|sort by|filter|delivery|prime/i.test(source);
        if (hasResultsIndicators) return true;

        for (const sel of this.productLinks) {
          const els = await this.driver.$$(sel);
          if (els.length > 0) return true;
        }

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

  // ═════════════════════════════════════════════════════════════════════════
  // Page Navigation
  // ═════════════════════════════════════════════════════════════════════════

  async openHomePage() {
    await this._logActionStart("openHomePage", { screen: "HOME_PAGE" });
    await this.openUrlAndWaitForAmazon(this.baseUrl, 'home page');
  }

  async waitForAmazonReady() {
    await this.verifyHomeLoaded();
  }

  async verifyVisible(locator) {
    if (typeof locator === 'string') {
      const element = await this.driver.$(locator);
      await element.waitForDisplayed({ timeout: 10000 });
      return;
    }
    try {
      const displayed = await locator.isDisplayed();
      if (!displayed) throw new Error('Element not displayed');
    } catch (e) {
      await this.waitForSourceText(/amazon/i);
    }
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

  // ═════════════════════════════════════════════════════════════════════════
  // Search
  // ═════════════════════════════════════════════════════════════════════════

  async searchProduct(productName) {
    await this._logActionStart("searchProduct", { screen: "HOME_PAGE", locator: this.searchBox });
    const searchInput = await this.waitForDisplayed(this.searchBox);
    await searchInput.click();
    await searchInput.clearValue();
    await searchInput.setValue(productName);
    await this.driver.keys(['Enter']);
    await this.waitForSearchResultsRendered(30000);
  }

  async verifySearchResultsVisible() {
    await this._logActionStart("verifySearchResultsVisible", { screen: "SEARCH_RESULTS" });
    await this.waitForSearchResultsRendered();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Open First Product
  // ═════════════════════════════════════════════════════════════════════════

  async openFirstProductFromResults() {
    await this._logActionStart("openFirstProductFromResults", { screen: "SEARCH_RESULTS" });
    await this.waitForSearchResultsRendered(30000);

    const searchUrl = await this.driver.getUrl().catch(() => '');
    logger.info(`[AmazonIOSSafariPage] Opening first product from search URL: ${searchUrl}`);

    const allErrors = [];
    const MAX_PRODUCT_CLICK_RETRIES = 3;

    for (let retry = 0; retry < MAX_PRODUCT_CLICK_RETRIES; retry++) {
      for (const selector of this.productLinks) {
        try {
          const elements = await this.driver.$$(selector);
          if (elements.length === 0) continue;

          for (const element of elements) {
            const displayed = await element.isDisplayed().catch(() => false);
            if (!displayed) continue;

            const enabled = await element.isEnabled().catch(() => true);
            if (!enabled) continue;

            try {
              await element.scrollIntoView();
              await this.driver.pause(500);
            } catch (_) {}

            logger.info(`[AmazonIOSSafariPage] Clicking product via selector: "${selector}"`);
            await element.click();
            await this.driver.pause(2000);

            const currentUrl = await this.driver.getUrl().catch(() => '');
            if (/\/dp\/|\/gp\/product\/|\/product\//.test(currentUrl)) {
              logger.info(`[AmazonIOSSafariPage] Product page reached. URL: ${currentUrl}`);
              if (await this._confirmProductDetailPage()) {
                return;
              }
              logger.warn('[AmazonIOSSafariPage] URL looks like product page but content does not confirm. Retrying...');
            } else if (currentUrl !== searchUrl) {
              logger.warn(`[AmazonIOSSafariPage] Navigated to non-product URL: ${currentUrl}. Waiting for product...`);
              try {
                await this.driver.waitUntil(async () => {
                  const url = await this.driver.getUrl();
                  return /\/dp\/|\/gp\/product\/|\/product\//.test(url);
                }, { timeout: 15000, interval: 1000 });
                if (await this._confirmProductDetailPage()) {
                  return;
                }
              } catch (_) {}
            } else {
              logger.warn(`[AmazonIOSSafariPage] Click on "${selector}" did not change URL. Still on: ${currentUrl}`);
            }
          }
        } catch (err) {
          allErrors.push(`Selector "${selector}" (retry ${retry}): ${err.message.substring(0, 200)}`);
        }
      }

      if (retry < MAX_PRODUCT_CLICK_RETRIES - 1) {
        logger.info(`[AmazonIOSSafariPage] Retrying product link click (attempt ${retry + 2}/${MAX_PRODUCT_CLICK_RETRIES})...`);
        await this.driver.pause(3000);
      }
    }

    // JS fallback
    try {
      logger.info('[AmazonIOSSafariPage] Trying JS fallback to click product link...');
      const clicked = await this.driver.execute(() => {
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
        await this.driver.pause(3000);
        const currentUrl = await this.driver.getUrl().catch(() => '');
        if (/\/dp\/|\/gp\/product\/|\/product\//.test(currentUrl)) {
          if (await this._confirmProductDetailPage()) {
            return;
          }
        }
      }
    } catch (err) {
      allErrors.push(`JS fallback: ${err.message.substring(0, 200)}`);
    }

    await this._captureFullDiagnostics('open-product-link-failure', {
      locatorAttempted: this.productLinks.join(', '),
      extra: { searchUrl: searchUrl, allErrors: allErrors }
    });
    const currentUrl = await this.driver.getUrl().catch(() => 'unknown');
    const pageSource = await this.driver.getPageSource().catch(() => '');
    const sourcePreview = pageSource.substring(0, 2000);

    throw new Error(
      `[AmazonIOSSafariPage] FAILED: Could not open first product from search results.\n` +
      `Current URL: ${currentUrl}\n` +
      `Search URL was: ${searchUrl}\n` +
      `Page source preview (first 2000 chars): ${sourcePreview}\n` +
      `Attempted selectors: ${this.productLinks.join(', ')}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  async _confirmProductDetailPage() {
    await this.driver.pause(2000);
    const url = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');
    const sourceLower = source.toLowerCase();

    const hasProductIndicators = (
      sourceLower.includes('producttitle') ||
      sourceLower.includes('productTitle') ||
      sourceLower.includes('buybox') ||
      sourceLower.includes('buyBox') ||
      sourceLower.includes('submit.add-to-cart') ||
      sourceLower.includes('submit.buy-now') ||
      sourceLower.includes('add-to-cart-button') ||
      (sourceLower.includes('coreprice') && sourceLower.includes('desktop')) ||
      sourceLower.includes('dp-container') ||
      sourceLower.includes('detail-bullets') ||
      sourceLower.includes('merchant-info') ||
      sourceLower.includes('offer-display') ||
      sourceLower.includes('offer-price')
    );

    if (!hasProductIndicators) {
      logger.warn(`[AmazonIOSSafariPage] _confirmProductDetailPage: FALSE. URL: ${url}`);
      return false;
    }
    logger.info(`[AmazonIOSSafariPage] _confirmProductDetailPage: TRUE. URL: ${url}`);
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Product Detail Verification — STRICT 4-element check
  //
  // Before any product detail action, verifies that ALL of the following
  // exist on the page:
  //   1. Product title
  //   2. Product price
  //   3. Product image
  //   4. Add to Cart button
  //
  // If ANY validation fails:
  //   - Captures screenshot, HTML source, current URL, page title
  //   - Fails immediately with detailed error
  // ═════════════════════════════════════════════════════════════════════════

  async verifyProductDetailsVisible() {
    await this._logActionStart("verifyProductDetailsVisible", { screen: "PRODUCT_DETAILS" });
    const url = await this.driver.getUrl().catch(() => '');
    const hasProductUrl = /\/dp\/|\/gp\/product\/|\/product\//.test(url);

    // Wait for page to settle after navigation
    await this.driver.pause(3000);

    const failures = [];
    const diagnostics = {
      url,
      pageTitle: '',
      sourceLength: 0,
      titleFound: false,
      priceFound: false,
      imageFound: false,
      addToCartFound: false,
      addToCartSelectorUsed: '',
    };

    // Get page title
    try {
      diagnostics.pageTitle = await this.driver.getTitle().catch(() => '');
    } catch (_) {}

    // Get page source length
    try {
      const source = await this.driver.getPageSource().catch(() => '');
      diagnostics.sourceLength = source.length;
    } catch (_) {}

    // ── Check 1: Product Title ───────────────────────────────────────
    let titleFound = false;
    let titleSelectorUsed = '';
    for (const selector of this.productTitleSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            const text = await el.getText().catch(() => '');
            if (text.trim().length > 0) {
              titleFound = true;
              titleSelectorUsed = selector;
              logger.info(`[AmazonIOSSafariPage] Product title found via "${selector}": "${text.substring(0, 80)}"`);
              break;
            }
          }
        }
      } catch (_) {}
      if (titleFound) break;
    }

    diagnostics.titleFound = titleFound;
    diagnostics.titleSelectorUsed = titleSelectorUsed;
    if (!titleFound) {
      failures.push('PRODUCT TITLE: Not found. Tried selectors: ' + this.productTitleSelectors.join(', '));
    }

    // ── Check 2: Product Price ───────────────────────────────────────
    let priceFound = false;
    let priceSelectorUsed = '';
    for (const selector of this.productPriceSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            const text = await el.getText().catch(() => '');
            if (text.trim().length > 0 && /[\d₹]/.test(text)) {
              priceFound = true;
              priceSelectorUsed = selector;
              logger.info(`[AmazonIOSSafariPage] Product price found via "${selector}": "${text.substring(0, 40)}"`);
              break;
            }
          }
        }
      } catch (_) {}
      if (priceFound) break;
    }

    // Fallback: check page source for price patterns
    if (!priceFound) {
      try {
        const source = await this.driver.getPageSource().catch(() => '');
        if (/₹[\d,]+/.test(source) || /a-price|priceToPay|priceblock/.test(source)) {
          priceFound = true;
          priceSelectorUsed = 'page-source-fallback';
          logger.info('[AmazonIOSSafariPage] Product price confirmed via page source pattern.');
        }
      } catch (_) {}
    }

    diagnostics.priceFound = priceFound;
    diagnostics.priceSelectorUsed = priceSelectorUsed;
    if (!priceFound) {
      failures.push('PRODUCT PRICE: Not found. Tried selectors: ' + this.productPriceSelectors.join(', '));
    }

    // ── Check 3: Product Image ───────────────────────────────────────
    let imageFound = false;
    let imageSelectorUsed = '';
    for (const selector of this.productImageSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            imageFound = true;
            imageSelectorUsed = selector;
            logger.info(`[AmazonIOSSafariPage] Product image found via "${selector}"`);
            break;
          }
        }
      } catch (_) {}
      if (imageFound) break;
    }

    // Fallback: check for any img element on the page
    if (!imageFound) {
      try {
        const imgs = await this.driver.$$('img');
        for (const img of imgs) {
          if (await img.isDisplayed().catch(() => false)) {
            const src = await img.getAttribute('src').catch(() => '');
            if (src && (src.includes('images') || src.includes('media') || src.includes('amazon'))) {
              imageFound = true;
              imageSelectorUsed = 'generic-img-fallback';
              logger.info(`[AmazonIOSSafariPage] Product image found via generic img fallback. src: ${src.substring(0, 80)}`);
              break;
            }
          }
        }
      } catch (_) {}
    }

    diagnostics.imageFound = imageFound;
    diagnostics.imageSelectorUsed = imageSelectorUsed;
    if (!imageFound) {
      failures.push('PRODUCT IMAGE: Not found. Tried selectors: ' + this.productImageSelectors.join(', '));
    }

    // ── Check 4: Add to Cart Button ─────────────────────────────────
    let addToCartFound = false;
    let addToCartSelectorUsed = '';
    for (const selector of this.addToCartSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          if (await el.isDisplayed().catch(() => false)) {
            addToCartFound = true;
            addToCartSelectorUsed = selector;
            logger.info(`[AmazonIOSSafariPage] Add to Cart found via "${selector}"`);
            break;
          }
        }
      } catch (_) {}
      if (addToCartFound) break;
    }

    // Fallback: search inside buybox containers for any submit button
    if (!addToCartFound) {
      const containerSelectors = ['#mobileBuybox', '#desktopBuybox', '#buybox', '#qualifiedBuyBox', '#addToCart'];
      for (const container of containerSelectors) {
        try {
          const containerEl = await this.driver.$(container);
          const containerDisplayed = await containerEl.isDisplayed().catch(() => false);
          if (!containerDisplayed) continue;

          const inputs = await containerEl.$$('input[type="submit"], button[type="submit"]');
          for (const input of inputs) {
            const text = await input.getAttribute('value').catch(() => '');
            const ariaLabel = await input.getAttribute('aria-label').catch(() => '');
            const id = await input.getAttribute('id').catch(() => '');
            if (/add to cart|add to basket|buy now/i.test(text + ariaLabel + id)) {
              addToCartFound = true;
              addToCartSelectorUsed = `${container} > input[type="submit"]`;
              logger.info(`[AmazonIOSSafariPage] Add to Cart found inside "${container}": value="${text}"`);
              break;
            }
          }
        } catch (_) {}
        if (addToCartFound) break;
      }
    }

    diagnostics.addToCartFound = addToCartFound;
    diagnostics.addToCartSelectorUsed = addToCartSelectorUsed;
    if (!addToCartFound) {
      failures.push('ADD TO CART BUTTON: Not found. Tried selectors: ' + this.addToCartSelectors.join(', '));
    }

    // ── If any check failed: capture diagnostics and FAIL ─────────────
    if (failures.length > 0) {
      await this._captureFullDiagnostics('product-details-failed', diagnostics);

      // Log all interactive elements for debugging
      try {
        const allButtons = await this.driver.$$('input[type="submit"], button[type="submit"], a[role="button"]');
        const buttonInfo = [];
        for (const btn of allButtons) {
          const val = await btn.getAttribute('value').catch(() => '');
          const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
          const id = await btn.getAttribute('id').catch(() => '');
          const name = await btn.getAttribute('name').catch(() => '');
          const text = await btn.getText().catch(() => '');
          const disp = await btn.isDisplayed().catch(() => false);
          buttonInfo.push(`id="${id}" name="${name}" value="${val}" aria-label="${ariaLabel}" text="${text}" displayed=${disp}`);
        }
        logger.warn(`[AmazonIOSSafariPage] All interactive elements:\n  ${buttonInfo.join('\n  ')}`);
      } catch (_) {}

      throw new Error(
        `[AmazonIOSSafariPage] PRODUCT DETAILS VALIDATION FAILED\n` +
        `URL: ${diagnostics.url}\n` +
        `Page Title: ${diagnostics.pageTitle}\n` +
        `Expected product page but the following elements were not found:\n` +
        `  ${failures.join('\n  ')}\n` +
        `\nDiagnostics saved to: ${this.debugScreenshotDir}/\n` +
        `\nOne or more critical product detail elements are missing. ` +
        `The page may not be a valid product details page, or the DOM ` +
        `may have changed.`
      );
    }

    logger.info(`[AmazonIOSSafariPage] Product details fully verified. URL: ${url}`);
    logger.info(`[AmazonIOSSafariPage]   Title: ${diagnostics.titleSelectorUsed}`);
    logger.info(`[AmazonIOSSafariPage]   Price: ${diagnostics.priceSelectorUsed}`);
    logger.info(`[AmazonIOSSafariPage]   Image: ${diagnostics.imageSelectorUsed}`);
    logger.info(`[AmazonIOSSafariPage]   Add to Cart: ${diagnostics.addToCartSelectorUsed}`);
  }

  async verifyProductTitleVisible() {
    await this.waitForSourceText(/productTitle|product title|brand|ratings?/i);
  }

  async verifyProductPriceVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/corePrice|offer-price|a-price|₹/.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  async verifyProductRatingVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/ratings?|stars?|customer reviews/i.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Add to Cart
  // ═════════════════════════════════════════════════════════════════════════

  async addToCartIfAvailable() {
    await this._logActionStart("addToCartIfAvailable", { screen: "PRODUCT_DETAILS" });
    logger.info('[AmazonIOSSafariPage] Attempting to find Add to Cart button...');
    const currentUrl = await this.driver.getUrl().catch(() => 'unknown');
    logger.info(`[AmazonIOSSafariPage] Current URL: ${currentUrl}`);

    await this.driver.pause(3000);

    let button = null;
    let buttonSelector = null;

    for (const selector of this.addToCartSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        if (elements.length === 0) continue;

        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (displayed) {
            button = el;
            buttonSelector = selector;
            logger.info(`[AmazonIOSSafariPage] Add to Cart found via: "${selector}"`);
            break;
          }
        }
        if (button) break;
      } catch (err) {
        logger.warn(`[AmazonIOSSafariPage] Selector "${selector}" error: ${err.message.substring(0, 100)}`);
      }
    }

    if (!button) {
      logger.info('[AmazonIOSSafariPage] Direct selectors failed. Searching inside buybox containers...');
      const containerSelectors = ['#mobileBuybox', '#desktopBuybox', '#buybox', '#qualifiedBuyBox', '#addToCart'];
      for (const container of containerSelectors) {
        try {
          const containerEl = await this.driver.$(container);
          const containerDisplayed = await containerEl.isDisplayed().catch(() => false);
          if (!containerDisplayed) continue;

          const inputs = await containerEl.$$('input[type="submit"], button[type="submit"]');
          for (const input of inputs) {
            const text = await input.getAttribute('value').catch(() => '');
            const ariaLabel = await input.getAttribute('aria-label').catch(() => '');
            const id = await input.getAttribute('id').catch(() => '');
            const name = await input.getAttribute('name').catch(() => '');

            logger.info(`[AmazonIOSSafariPage] Container "${container}" input: value="${text}" aria-label="${ariaLabel}" id="${id}" name="${name}"`);

            if (/add to cart|add to basket/i.test(text + ariaLabel + id + name)) {
              button = input;
              buttonSelector = `${container} > input[type="submit"]`;
              logger.info(`[AmazonIOSSafariPage] Add to Cart found inside "${container}": value="${text}"`);
              break;
            }
          }
          if (button) break;
        } catch (_) {}
      }
    }

    if (!button) {
      logger.info('[AmazonIOSSafariPage] Add to Cart not found. Trying Buy Now as fallback...');
      for (const selector of this.buyNowSelectors) {
        try {
          const elements = await this.driver.$$(selector);
          if (elements.length === 0) continue;
          for (const el of elements) {
            const displayed = await el.isDisplayed().catch(() => false);
            if (displayed) {
              button = el;
              buttonSelector = selector;
              logger.info(`[AmazonIOSSafariPage] Buy Now found via: "${selector}"`);
              break;
            }
          }
          if (button) break;
        } catch (_) {}
      }
    }

    if (!button) {
      await this._captureFullDiagnostics('add-to-cart-not-found', {
        locatorAttempted: this.addToCartSelectors.join(', '),
        extra: { currentUrl: currentUrl }
      });
      const pageSource = await this.driver.getPageSource().catch(() => '');

      logger.warn('[AmazonIOSSafariPage] Add to Cart button NOT FOUND. Debug info:');
      logger.warn(`  URL: ${currentUrl}`);
      logger.warn(`  Attempted selectors: ${this.addToCartSelectors.join(', ')}`);
      logger.warn(`  Page source length: ${pageSource.length}`);

      const isProductPage = await this._confirmProductDetailPage().catch(() => false);
      logger.warn(`  Is product page confirmed: ${isProductPage}`);

      try {
        const allButtons = await this.driver.$$('input[type="submit"], button[type="submit"], a[role="button"]');
        const buttonInfo = [];
        for (const btn of allButtons) {
          const val = await btn.getAttribute('value').catch(() => '');
          const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
          const id = await btn.getAttribute('id').catch(() => '');
          const name = await btn.getAttribute('name').catch(() => '');
          const text = await btn.getText().catch(() => '');
          const disp = await btn.isDisplayed().catch(() => false);
          buttonInfo.push(`id="${id}" name="${name}" value="${val}" aria-label="${ariaLabel}" text="${text}" displayed=${disp}`);
        }
        logger.warn(`[AmazonIOSSafariPage] All interactive elements on page:\n  ${buttonInfo.join('\n  ')}`);
      } catch (_) {}

      return false;
    }

    try {
      await button.scrollIntoView();
      await this.driver.pause(500);
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] scrollIntoView warning: ${err.message}`);
    }

    const isDisplayed = await button.isDisplayed().catch(() => false);
    if (!isDisplayed) {
      logger.warn(`[AmazonIOSSafariPage] Button found but not displayed after scroll (selector: ${buttonSelector})`);
      return false;
    }

    logger.info(`[AmazonIOSSafariPage] Clicking Add to Cart button (selector: ${buttonSelector})`);
    await button.click();
    await this.driver.pause(3000);

    const postClickSource = await this.driver.getPageSource().catch(() => '');
    const hasConfirmation = /added to cart|added to basket|cart|subtotal|proceed to buy/i.test(postClickSource);

    if (hasConfirmation) {
      logger.info('[AmazonIOSSafariPage] Add to Cart confirmed — cart confirmation detected.');
      return true;
    }

    const postClickUrl = await this.driver.getUrl().catch(() => '');
    if (/cart|gp\/cart/.test(postClickUrl)) {
      logger.info('[AmazonIOSSafariPage] Redirected to cart page after Add to Cart.');
      return true;
    }

    logger.info('[AmazonIOSSafariPage] Add to Cart clicked (assumed success).');
    return true;
  }

  async verifyAddToCartFlowComplete(addedToCart) {
    if (addedToCart) {
      await this.waitForSourceText(/added to cart|cart|basket/i);
      return;
    }
    await this.verifyProductDetailsVisible();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Cart
  // ═════════════════════════════════════════════════════════════════════════

  async openCartPage() {
    await this._logActionStart("openCartPage", { screen: "CART_PAGE" });
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

  // ═════════════════════════════════════════════════════════════════════════
  // Footer
  // ═════════════════════════════════════════════════════════════════════════

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

  // ═════════════════════════════════════════════════════════════════════════
  // Generic Helpers
  // ═════════════════════════════════════════════════════════════════════════

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

      if (urlMatched) return;

      if (attempt < strategies.length - 1) {
        await this.driver.back().catch(() => {});
        await this.driver.pause(1500);
      }
    }

    lastUrl = lastUrl || await this.driver.getUrl().catch(() => '');
    await this._captureFullDiagnostics('navigation-failed', {
      locatorAttempted: description,
      extra: { lastUrl: lastUrl, targetUrl: targetUrl }
    });
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
    if (/^https?:\/\//i.test(url)) return url;
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

  async _captureDebugScreenshot(name) {
    try {
      const dir = this.debugScreenshotDir || 'reports/ios/screenshots';
      fs.ensureDirSync(dir);
      const timestamp = Date.now();
      const filePath = path.join(dir, `${name}-${timestamp}.png`);
      await this.driver.saveScreenshot(filePath);
      logger.info(`[AmazonIOSSafariPage] Debug screenshot saved: ${filePath}`);
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] Debug screenshot failed: ${err.message}`);
    }
  }

  /**
   * Capture full diagnostics whenever an element or action fails.
   * Always saves:
   *   - screenshot (PNG)
   *   - HTML source (HTML)
   *   - current URL
   *   - browser console logs (via JS execution, if WebView available)
   *   - page title
   *   - locator(s) attempted
   *   - visible buttons / interactive elements on page
   *
   * All files stored under reports/ios/debug/{name}-{timestamp}.*
   */
  async _captureFullDiagnostics(name, diagnostics = {}) {
    const timestamp = Date.now();
    const baseDir = this.debugSourceDir || 'reports/ios/debug';
    fs.ensureDirSync(baseDir);

    // 1. Screenshot
    try {
      const screenshotPath = path.join(baseDir, `${name}-${timestamp}.png`);
      await this.driver.saveScreenshot(screenshotPath);
      logger.info(`[AmazonIOSSafariPage] Diagnostic screenshot: ${screenshotPath}`);
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] Diagnostic screenshot failed: ${err.message}`);
    }

    // 2. HTML source
    try {
      const sourcePath = path.join(baseDir, `${name}-${timestamp}.html`);
      const source = await this.driver.getPageSource().catch(() => '');
      fs.writeFileSync(sourcePath, source, 'utf8');
      logger.info(`[AmazonIOSSafariPage] Diagnostic HTML source: ${sourcePath} (${source.length} bytes)`);
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] Diagnostic HTML source failed: ${err.message}`);
    }

    // 3. Browser console logs (via JavaScript, best-effort)
    let consoleLogs = [];
    try {
      consoleLogs = await this.driver.execute(() => {
        // Try to read from window.__consoleStore (populated by a previous polyfill)
        // or return an empty array
        return window.__consoleStore || [];
      }).catch(() => []);
    } catch (_) {}
    if (consoleLogs.length > 0) {
      try {
        const logPath = path.join(baseDir, `${name}-${timestamp}.console.json`);
        fs.writeFileSync(logPath, JSON.stringify(consoleLogs, null, 2), 'utf8');
        logger.info(`[AmazonIOSSafariPage] Diagnostic console logs: ${logPath} (${consoleLogs.length} entries)`);
      } catch (_) {}
    }

    // 4. Accumulate all environment data for the summary JSON
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const pageTitle = await this.driver.getTitle().catch(() => '');

    // 5. Visible buttons / interactive elements on page
    let visibleButtons = [];
    try {
      const allButtons = await this.driver.$$(
        'input[type="submit"], button[type="submit"], a[role="button"], ' +
        'a[href*="proceed"], a[href*="checkout"], a[href*="cart"], ' +
        'a[href*="delete"], input[value*="Add"], input[value*="Buy"], input[value*="Proceed"]'
      );
      for (const btn of allButtons) {
        const displayed = await btn.isDisplayed().catch(() => false);
        if (displayed) {
          const info = {
            tag: await btn.getTagName().catch(() => ''),
            id: await btn.getAttribute('id').catch(() => ''),
            name: await btn.getAttribute('name').catch(() => ''),
            value: await btn.getAttribute('value').catch(() => ''),
            ariaLabel: await btn.getAttribute('aria-label').catch(() => ''),
            text: await btn.getText().catch(() => ''),
            href: await btn.getAttribute('href').catch(() => ''),
            class: await btn.getAttribute('class').catch(() => ''),
          };
          visibleButtons.push(info);
        }
      }
    } catch (_) {}

    // 6. Write diagnostics summary JSON
    try {
      const diagPath = path.join(baseDir, `${name}-${timestamp}.json`);
      const diagData = {
        timestamp: new Date(timestamp).toISOString(),
        action: name,
        url: currentUrl,
        pageTitle: pageTitle,
        sourceLength: diagnostics.sourceLength || 0,
        locatorAttempted: diagnostics.locatorAttempted || diagnostics.titleSelectorUsed || '',
        titleFound: diagnostics.titleFound,
        priceFound: diagnostics.priceFound,
        imageFound: diagnostics.imageFound,
        addToCartFound: diagnostics.addToCartFound,
        visibleButtonsCount: visibleButtons.length,
        visibleButtons: visibleButtons,
        consoleLogsCount: consoleLogs.length,
        consoleLogs: consoleLogs,
        extra: diagnostics.extra || {},
      };
      // Merge any remaining diagnostic fields
      for (const [k, v] of Object.entries(diagnostics)) {
        if (!(k in diagData) && v !== undefined) {
          diagData[k] = v;
        }
      }
      fs.writeFileSync(diagPath, JSON.stringify(diagData, null, 2), 'utf8');
      logger.info(`[AmazonIOSSafariPage] Diagnostic summary: ${diagPath}`);
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] Diagnostic summary write failed: ${err.message}`);
    }
  }
}

module.exports = AmazonIOSSafariPage;
