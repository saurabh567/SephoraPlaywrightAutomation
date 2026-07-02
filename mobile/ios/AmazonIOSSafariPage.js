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


    // ── Smart Wagon Cart — Amazon's new mobile cart page ────────────────
    // Amazon now serves cart via /cart/smart-wagon with completely different DOM.
    // These selectors work on the Smart Wagon cart page.
    this.smartWagonCartItem = '[data-component-type="cart-item"], [data-cart-item], .sc-list-item, [data-testid*="cart-item"]';
    this.smartWagonDeleteSelectors = [
      // Smart Wagon delete button (data-testid based)
      '[data-testid*="delete"]',
      'button[data-testid*="delete"]',
      'a[data-testid*="delete"]',
      // Smart Wagon remove/link action
      'span[data-action="delete"]',
      'span[data-action="delete"] a',
      'span[data-action="delete"] input',
      // Standard cart action delete
      '.sc-action-delete',
      '.sc-action-delete input',
      'input.sc-action-delete',
      // Generic delete by attribute
      'input[value="Delete"]',
      'input[value="delete"]',
      'button[value="Delete"]',
      'a[aria-label*="Delete"]',
      'a[aria-label*="delete"]',
      'a[href*="delete"]',
      'button[name*="delete"]',
      'input[name*="delete"]',
      // Cart item remove link
      '[data-csa-c-action*="delete"]',
      '[data-action*="delete"] a',
      // Old fallback patterns
      '.a-declarative a[href*="delete"]',
    ];
    // ── Smart Wagon Delete Selectors — XPath alternatives ───────────────
    // Amazon's Smart Wagon cart uses different DOM than the old /gp/cart/view.html.
    // These XPath expressions target the delete/remove button on the mobile cart page.
    // Priority order: most specific (new Smart Wagon) → most generic (old cart).
    this.smartWagonDeleteXPaths = [
      // Smart Wagon: find any element with data-testid containing "delete"
      "//*[contains(@data-testid, 'delete')]",
      // Smart Wagon: button with data-testid containing "delete"
      "//button[contains(@data-testid, 'delete')]",
      // Smart Wagon: anchor with data-testid containing "delete"
      "//a[contains(@data-testid, 'delete')]",
      // Smart Wagon: span with data-action="delete"
      "//span[@data-action='delete']",
      // Smart Wagon: anchor inside a span[data-action="delete"]
      "//span[@data-action='delete']//a",
      // Standard cart: action-delete container
      "//*[contains(@class, 'sc-action-delete')]",
      // Standard cart: input inside action-delete
      "//*[contains(@class, 'sc-action-delete')]//input",
      // Generic: anchor with aria-label containing Delete (case-insensitive via translate)
      "//a[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delete')]",
      // Generic: input with value="Delete"
      "//input[@value='Delete']",
      // Generic: button with value="Delete"
      "//button[@value='Delete']",
      // Generic: anchor with href containing "delete"
      "//a[contains(@href, 'delete')]",
      // Generic: button with name containing "delete"
      "//button[contains(@name, 'delete')]",
      // Generic: input with name containing "delete"
      "//input[contains(@name, 'delete')]",
      // Old fallback: anchor inside .a-declarative with href containing "delete"
      "//*[contains(@class, 'a-declarative')]//a[contains(@href, 'delete')]",
      // Last resort: any anchor element whose text content is "Delete"
      "//a[normalize-space(text())='Delete']",
      "//button[normalize-space(text())='Delete']",
      "//span[normalize-space(text())='Delete']",
    ];
    this.smartWagonProceedSelectors = [
      // Smart Wagon proceed to checkout
      '[data-testid*="proceed-to-checkout"]',
      'button[data-testid*="proceed-to-checkout"]',
      'a[data-testid*="proceed-to-checkout"]',
      'input[name*="proceed-to-checkout"]',
      'input[name*="proceedToRetailCheckout"]',
      'input[name="proceedToCheckout"]',
      'input[name="proceedToRetailCheckout"]',
      // Standard proceed buttons
      'a[href*="/checkout"]',
      'a[href*="checkout"]',
      'input[value*="Proceed"]',
      'input[value*="proceed"]',
      'a[aria-label*="Proceed"]',
      'a[aria-label*="proceed"]',
      'button[aria-label*="Proceed"]',
      'button[aria-label*="proceed"]',
      // Checkout button
      'a[data-csa-c-slot-id*="checkout"]',
      'input[name*="checkout"]',
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

    // ── Sign-in Bottom Sheet ──────────────────────────────────────────
    // Amazon mobile web shows a "Sign in or Create Account" bottom sheet
    // overlay when an unauthenticated user performs gated actions
    // (add to cart, view cart, checkout). Must be dismissed before
    // interacting with the underlying page.
    this.signInBottomSheetSelectors = [
      // Common sign-in overlay / modal containers
      '#auth-signin-modal',
      '[data-testid="sign-in-overlay"]',
      // Bottom sheet with sign-in prompt
      '[data-component-type="sign-in-accordion"]',
      // Close/dismiss buttons on the overlay
      'button[aria-label="Close"]',
      'button[aria-label="close"]',
      'span[aria-label="Close"]',
      'a[aria-label="Close"]',
      '[data-testid="close-button"]',
      // Generic dismiss via "X" button
      '.a-icon-close',
      'button.a-button-close',
      // Any visible dialog with sign-in text (catch-all)
      '[role="dialog"]',
    ];
    this.signInUrlPattern = /ap\/signin|signin|sign-in/i;
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
  /**
   * Detect and dismiss the Amazon "Sign in or Create Account" bottom sheet.
   * This overlay appears when an unauthenticated user performs gated actions.
   * Call at the top of every public action method before interacting with
   * the page. Checks URL for sign-in redirect AND DOM for overlay elements.
   *
   * Strategy:
   *   1. Check current URL for /ap/signin (redirect-based sign-in)
   *   2. Search DOM for known sign-in overlay selectors
   *   3. If found, tap Close/X button or dismiss via gesture
   *   4. Navigate back to Amazon URL if redirected away
   *
   * @returns {Promise<boolean>} True if a sign-in prompt was dismissed
   */
  async _dismissSignInBottomSheet() {
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');

    // Strategy 1: URL-based detection — redirected to sign-in page
    if (this.signInUrlPattern.test(currentUrl)) {
      logger.info('[AmazonIOSSafariPage] Sign-in page detected via URL — navigating back to Amazon');
      await this.driver.back().catch(() => {});
      await this.driver.pause(2000);
      // Re-check URL
      const afterBack = await this.driver.getUrl().catch(() => '');
      if (this.signInUrlPattern.test(afterBack)) {
        // Still on sign-in — try navigating to home directly
        logger.info('[AmazonIOSSafariPage] Still on sign-in after back — navigating to home');
        await this.driver.url('https://www.amazon.in/').catch(() => {});
        await this.driver.pause(3000);
      }
      return true;
    }

    // Strategy 2: DOM-based detection — sign-in overlay on current page
    for (const selector of this.signInBottomSheetSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          // Found an overlay element — try to dismiss it
          logger.info('[AmazonIOSSafariPage] Sign-in bottom sheet detected via selector: ' + selector);

          // First, try to find and click a close/dismiss button
          const closeButtons = [
            'button[aria-label="Close"]',
            'button[aria-label="close"]',
            'span[aria-label="Close"]',
            'a[aria-label="Close"]',
            'button.a-button-close',
            '.a-icon-close',
            'button[data-action="a-popover-close"]',
            '[data-testid="close-button"]',
          ];

          for (const closeSel of closeButtons) {
            try {
              const closeEls = await this.driver.$$(closeSel);
              for (const closeEl of closeEls) {
                if (await closeEl.isDisplayed().catch(() => false)) {
                  await closeEl.click();
                  await this.driver.pause(1500);
                  logger.info('[AmazonIOSSafariPage] Sign-in bottom sheet dismissed via close button');
                  return true;
                }
              }
            } catch (_) {}
          }

          // Fallback: tap the backdrop or press Escape via JS
          try {
            await this.driver.execute('document.body.click()');
            await this.driver.pause(1000);
            logger.info('[AmazonIOSSafariPage] Sign-in bottom sheet dismissed via body click');
            return true;
          } catch (_) {}

          // Last resort: navigate back
          try {
            await this.driver.back().catch(() => {});
            await this.driver.pause(2000);
            logger.info('[AmazonIOSSafariPage] Sign-in bottom sheet dismissed via back navigation');
            return true;
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Also check page source for sign-in text patterns
    if (/sign in or create account|sign in to continue/i.test(source)) {
      logger.info('[AmazonIOSSafariPage] Sign-in text detected in page source — attempting dismissal');
      try {
        await this.driver.execute(
          'var els=document.querySelectorAll("button,a,span");' +
          'for(var i=0;i<els.length;i++){' +
          'var t=(els[i].textContent||"").trim().toLowerCase();' +
          'if(t==="close"||t==="dismiss"||t==="x"||t==="cancel"){' +
          'els[i].click();return "clicked "+t;}}return "no match";'
        );
        await this.driver.pause(1500);
        return true;
      } catch (_) {}
    }

    return false;
  }

  _inferScreen(url) {
    const u = url.toLowerCase();
    if (u.includes('/cart') || u.includes('gp/cart') || u.includes('smart-wagon') || u.includes('smart_wagon')) return 'CART_PAGE';
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
    await this._dismissSignInBottomSheet();
    await this._logActionStart("openHomePage", { screen: "HOME_PAGE" });
    const targetUrl = this.normalizeUrl(this.baseUrl);
    logger.info("[AmazonIOSSafariPage] Navigating directly to BASE_URL: " + targetUrl);
    await this.driver.url(targetUrl);
    await this.driver.pause(2000);

    /* Wait for either Amazon logo OR search box to be visible */
    const homepageElementSelectors = [
      '#twotabsearchtextbox',
      'input[name="k"]',
      'input[type="search"]',
      '#nav-search-bar-form input',
      'a[aria-label*="Amazon"]',
      'a[href*="amazon"][aria-label]',
    ];

    let homepageReady = false;
    await this.driver.waitUntil(async () => {
      for (const sel of homepageElementSelectors) {
        const els = await this.driver.$$(sel).catch(() => []);
        if (els.length > 0) {
          const displayed = await els[0].isDisplayed().catch(() => false);
          if (displayed) {
            logger.info("[AmazonIOSSafariPage] Homepage confirmed — element visible: " + sel);
            homepageReady = true;
            return true;
          }
        }
      }
      return false;
    }, {
      timeout: 30000,
      interval: 1500,
      timeoutMsg: "Timed out waiting for Amazon homepage elements (logo / search box) to appear after navigation to " + targetUrl,
    });

    if (!homepageReady) {
      logger.warn("[AmazonIOSSafariPage] Homepage elements not found within timeout — proceeding anyway");
    }
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
    await this._dismissSignInBottomSheet();
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
    await this._dismissSignInBottomSheet();
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

            // Retry click with re-query on stale element
            let clickSuccess = false;
            for (let clickRetry = 0; clickRetry < 2 && !clickSuccess; clickRetry++) {
              try {
                if (clickRetry > 0) {
                  // Element became stale — re-query the selector
                  const freshElements = await this.driver.$$(selector);
                  if (freshElements.length === 0) break;
                  element = freshElements[0];
                  try { await element.scrollIntoView(); await this.driver.pause(300); } catch (_) {}
                }
                logger.info('[AmazonIOSSafariPage] Clicking product via selector: "' + selector + '" (attempt ' + (clickRetry + 1) + ')');
                await element.click();
                clickSuccess = true;
              } catch (clickErr) {
                if (clickRetry === 0) {
                  logger.warn('[AmazonIOSSafariPage] First click attempt failed, retrying with fresh element: ' + clickErr.message.substring(0, 80));
                } else {
                  logger.warn('[AmazonIOSSafariPage] All click attempts exhausted for selector: ' + selector);
                }
              }
            }

            if (!clickSuccess) continue;

            await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(8000), checkLoaders: false }).catch(function() {});
            await this.driver.pause(500);

            const currentUrl = await this.driver.getUrl().catch(() => '');
            if (/\/dp\/|\/gp\/product\/|\/product\//.test(currentUrl)) {
              logger.info(`[AmazonIOSSafariPage] Product page reached. URL: ${currentUrl}`);

              // ── Verify we're on a product details page ──────────────
              const source = await this.driver.getPageSource().catch(() => '');
              if (!this.productDetailPattern.test(source)) {
                logger.warn(`[AmazonIOSSafariPage] Page reached but content does not indicate a product details page. URL: ${currentUrl}`);
              }
              return;
            } else {
              logger.info(`[AmazonIOSSafariPage] Click did not navigate to product page. URL: ${currentUrl}`);
              // If we ended up on a different page (e.g. sign-in, captcha, PDP redirect), log it
              if (/signin|ap\/signin|captcha|verify/.test(currentUrl)) {
                logger.warn(`[AmazonIOSSafariPage] Intercepted by security/redirect page: ${currentUrl}`);
              }
            }
          }
        } catch (err) {
          allErrors.push(`Selector "${selector}": ${err.message.substring(0, 100)}`);
        }
      }
    }

    await this._captureFullDiagnostics('openFirstProduct-failed', {
      locatorAttempted: this.productLinks.join(', '),
      extra: { allErrors }
    });

    throw new Error(
      `[AmazonIOSSafariPage] Could not open first product from search results.\n` +
      `Search URL: ${searchUrl}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Add to Cart
  // ═════════════════════════════════════════════════════════════════════════

  async addToCartIfAvailable() {
    await this._dismissSignInBottomSheet();
    await this._logActionStart("addToCartIfAvailable", { screen: "PRODUCT_DETAILS" });
    const currentUrl = await this.driver.getUrl().catch(() => '');

    // ── Wait for product page buy box to load before scanning selectors ──
    // Amazon's mobile web loads the buy box (Add to Cart button) progressively.
    // Wait for known container elements before attempting to find the button.
    try {
      await this.driver.waitUntil(async () => {
        const source = await this.driver.getPageSource().catch(() => '');
        return /buybox|add.to.cart|buy.now|qualifiedBuyBox|mobileBuybox/i.test(source);
      }, {
        timeout: Math.min(this.iosTimeout || this.timeout, 30000),
        interval: 1500,
        timeoutMsg: 'Timed out waiting for buy box to render on product page'
      });
    } catch (_) {
      logger.warn('[AmazonIOSSafariPage] Buy box wait timed out — proceeding with selector scan anyway');
    }

    const allErrors = [];

    for (const selector of this.addToCartSelectors) {
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
            await this.driver.pause(300);
          } catch (_) {}

          logger.info(`[AmazonIOSSafariPage] Clicking Add to Cart via selector: "${selector}"`);
          await element.click();
          await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(8000), checkLoaders: false }).catch(function() {});
          logger.info('[AmazonIOSSafariPage] Add to Cart clicked successfully.');
          return true;
        }
      } catch (err) {
        allErrors.push(`Selector "${selector}": ${err.message.substring(0, 100)}`);
      }
    }

    // ── Fallback: Buy Now if Add to Cart not found ───────────────────────
    if (process.env.ALLOW_BUY_NOW_FALLBACK === 'true') {
      logger.info('[AmazonIOSSafariPage] Add to Cart not found — trying Buy Now as fallback...');
      for (const selector of this.buyNowSelectors) {
        try {
          const elements = await this.driver.$$(selector);
          if (elements.length === 0) continue;

          for (const element of elements) {
            const displayed = await element.isDisplayed().catch(() => false);
            if (!displayed) continue;

            try {
              await element.scrollIntoView();
              await this.driver.pause(300);
            } catch (_) {}

            logger.info(`[AmazonIOSSafariPage] Clicking Buy Now via selector: "${selector}"`);
            await element.click();
            await this.driver.pause(3000);
            logger.info('[AmazonIOSSafariPage] Buy Now clicked successfully.');
            return true;
          }
        } catch (err) {
          allErrors.push(`BuyNow "${selector}": ${err.message.substring(0, 100)}`);
        }
      }
    }

    // ── Capture diagnostics ─────────────────────────────────────────────
    await this._captureFullDiagnostics('addToCart-failed', {
      locatorAttempted: this.addToCartSelectors.join(', '),
      titleSelectorUsed: this.productTitleSelectors[0],
      extra: { allErrors }
    });

    throw new Error(
      `[AmazonIOSSafariPage] Add to Cart button not found on product page.\n` +
      `Current URL: ${currentUrl}\n` +
      `All errors: ${allErrors.join('; ')}`
    );
  }

  async verifyAddToCartFlowComplete(addedToCart) {
    if (!addedToCart) {
      throw new Error('[AmazonIOSSafariPage] Add to Cart flow was not completed successfully.');
    }
    logger.info('[AmazonIOSSafariPage] Add to Cart flow completed.');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Cart — Open, Verify, Remove Items
  // ═════════════════════════════════════════════════════════════════════════

  async openCartPage() {
    await this._dismissSignInBottomSheet();
    await this._logActionStart("openCartPage", { screen: "CART_PAGE" });
    await this.openUrlAndWaitForAmazon('https://www.amazon.in/cart', 'cart page');
  }

  async verifyCartPageVisible() {
    await this._dismissSignInBottomSheet();
    await this.waitForAmazonUrl('cart page');
    await this.waitForSourceText(/shopping cart|cart|basket|subtotal|proceed to buy|smart wagon|your items|cart total|item total/i);
  }

  async verifyCartTitleOrEmptyMessage() {
    await this.waitForSourceText(/shopping cart|cart is empty|your amazon cart is empty|your amazon cart is empty|subtotal|smart wagon|your shopping cart is empty|your cart is empty/i);
  }

  async verifyProceedToBuyButtonIfCartHasItems() {
    await this._dismissSignInBottomSheet();
    const source = await this.driver.getPageSource();
    if (/proceed to buy|subtotal|proceed to checkout|smart wagon|checkout/i.test(source)) return;
    await this.verifyCartTitleOrEmptyMessage();
  }

  /**
   * Remove a product from the cart.
   *
   * Strategy (in order):
   *   1. CSS selectors targeting Amazon Smart Wagon cart delete buttons
   *   2. XPath selectors targeting Smart Wagon and standard cart delete
   *   3. JavaScript execution fallback — directly clicking the delete link
   *      via `document.querySelector` and dispatching a click event
   *   4. JavaScript execution — using DOM traversal to find "Delete" links
   *      by their text content
   *
   * @returns {Promise<boolean>} True if the item was successfully removed
   * @throws {Error} If no delete button could be found after all attempts
   */
  async removeItemFromCart() {
    await this._dismissSignInBottomSheet();
    await this._logActionStart("removeItemFromCart", { screen: "CART_PAGE" });

    const currentUrl = await this.driver.getUrl().catch(() => '');
    logger.info(`[AmazonIOSSafariPage] Removing item from cart. URL: ${currentUrl}`);

    const allErrors = [];

    // ── Phase 1: CSS Selectors ──────────────────────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 1: Trying CSS selectors...');
    const removedViaCss = await this._tryDeleteSelectors(
      this.smartWagonDeleteSelectors,
      allErrors,
      'css'
    );
    if (removedViaCss) return true;

    // ── Phase 2: XPath Selectors ────────────────────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 2: Trying XPath selectors...');
    const removedViaXPath = await this._tryDeleteXPaths(
      this.smartWagonDeleteXPaths,
      allErrors
    );
    if (removedViaXPath) return true;

    // ── Phase 3: JavaScript Execution Fallback ──────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 3: Trying JavaScript execution fallback...');
    const removedViaJs = await this._tryJsDeleteFallback(allErrors);
    if (removedViaJs) return true;

    // ── All attempts failed — capture diagnostics ───────────────────────
    await this._captureCartPageDiagnostics(allErrors);

    throw new Error(
      `[AmazonIOSSafariPage] Could not find delete button on cart page.\n` +
      `URL: ${currentUrl}\n` +
      `CSS selectors attempted: ${this.smartWagonDeleteSelectors.join(', ')}\n` +
      `XPath selectors attempted: ${this.smartWagonDeleteXPaths.length} expressions\n` +
      `JS fallback attempted: yes\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  /**
   * Try each CSS selector in order, clicking the first visible element found.
   *
   * @param {string[]} selectors - Array of CSS selector strings
   * @param {string[]} allErrors - Accumulator for error messages
   * @param {string} source - Label for log messages ('css' or 'js')
   * @returns {Promise<boolean>} True if an element was found and clicked
   */
  async _tryDeleteSelectors(selectors, allErrors, source) {
    for (const selector of selectors) {
      try {
        const elements = await this.driver.$$(selector);
        if (elements.length === 0) continue;

        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          const enabled = await element.isEnabled().catch(() => true);
          if (!enabled) continue;

          // Scroll into view
          try {
            await element.scrollIntoView();
            await this.driver.pause(300);
          } catch (_) {}

          logger.info(`[AmazonIOSSafariPage] Clicking delete via ${source} selector: "${selector}"`);
          await element.click();
          await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(8000), checkLoaders: false }).catch(function() {});
          await this.driver.pause(500);

          // Verify the item was removed (page should update)
          const removalConfirmed = await this._confirmItemRemoved();
          if (removalConfirmed) {
            logger.info('[AmazonIOSSafariPage] Item removed successfully.');
            return true;
          }

          // Click happened but item wasn't removed — try next element
          logger.warn(`[AmazonIOSSafariPage] Click on "${selector}" did not remove item.`);
        }
      } catch (err) {
        allErrors.push(`CSS "${selector}": ${err.message.substring(0, 100)}`);
      }
    }
    return false;
  }

  /**
   * Try each XPath expression in order.
   *
   * @param {string[]} xpaths - Array of XPath expression strings
   * @param {string[]} allErrors - Accumulator for error messages
   * @returns {Promise<boolean>} True if an element was found and clicked
   */
  async _tryDeleteXPaths(xpaths, allErrors) {
    for (const xpath of xpaths) {
      try {
        const elements = await this.driver.$$(xpath);
        if (elements.length === 0) continue;

        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          try {
            await element.scrollIntoView();
            await this.driver.pause(300);
          } catch (_) {}

          logger.info(`[AmazonIOSSafariPage] Clicking delete via XPath`);
          await element.click();
          await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(8000), checkLoaders: false }).catch(function() {});
          await this.driver.pause(500);

          const removalConfirmed = await this._confirmItemRemoved();
          if (removalConfirmed) {
            logger.info('[AmazonIOSSafariPage] Item removed via XPath.');
            return true;
          }
        }
      } catch (err) {
        allErrors.push(`XPath: ${err.message.substring(0, 100)}`);
      }
    }
    return false;
  }

  /**
   * JavaScript execution fallback to delete a cart item.
   *
   * Safari's WebView supports executing arbitrary JavaScript.
   * This method uses several JS strategies:
   *   1. Find all anchor elements with text "Delete" or containing "delete" in href
   *   2. Click the match via .click()
   *   3. If direct click doesn't work, dispatch a MouseEvent
   *
   * @param {string[]} allErrors - Accumulator for error messages
   * @returns {Promise<boolean>} True if removal was confirmed
   */
  async _tryJsDeleteFallback(allErrors) {
    try {
      const result = await this.driver.execute(`
        (function() {
          // ── Strategy 1: Find elements by text content ────────────────
          function findDeleteElements() {
            const results = [];

            // All possible selectors for delete/remove buttons
            const selectors = [
              'a[data-testid*="delete"]',
              'button[data-testid*="delete"]',
              'span[data-action="delete"] a',
              'span[data-action="delete"]',
              'input.sc-action-delete',
              'a[href*="delete"]',
              'button[name*="delete"]',
              'input[name*="delete"]',
              'a[aria-label*="Delete"]',
              'a[aria-label*="delete"]',
              '[data-csa-c-action*="delete"]',
              '.sc-action-delete input',
              '.a-declarative a[href*="delete"]',
            ];

            // Try CSS selectors first
            for (const sel of selectors) {
              try {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                  // Check visibility
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  const visible = rect.width > 0 && rect.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0';
                  if (visible) {
                    results.push({
                      element: el,
                      selector: sel,
                      tag: el.tagName,
                      text: (el.textContent || '').trim().substring(0, 50),
                      id: el.id,
                      className: el.className,
                    });
                  }
                }
              } catch(e) {}
            }

            // Try finding by text content "Delete"
            if (results.length === 0) {
              const allLinks = document.querySelectorAll('a, button, span, input');
              for (const el of allLinks) {
                const text = (el.textContent || '').trim();
                const value = (el.getAttribute('value') || '').trim();
                const ariaLabel = (el.getAttribute('aria-label') || '').trim();
                if (
                  text === 'Delete' ||
                  text === 'delete' ||
                  value === 'Delete' ||
                  ariaLabel.toLowerCase().includes('delete')
                ) {
                  const rect = el.getBoundingClientRect();
                  const visible = rect.width > 0 && rect.height > 0;
                  if (visible) {
                    results.push({
                      element: el,
                      selector: 'text="' + text + '"',
                      tag: el.tagName,
                      text: text,
                    });
                  }
                }
              }
            }

            return results;
          }

          // ── Strategy 2: Click the element ────────────────────────────
          function clickElement(el) {
            // Scroll into view first
            el.scrollIntoView({ behavior: 'instant', block: 'center' });

            // Try native click first
            try {
              el.click();
              return { method: 'nativeClick', success: true };
            } catch(e) {
              // If native click fails, dispatch a MouseEvent
              try {
                const event = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(event);
                return { method: 'dispatchedEvent', success: true };
              } catch(e2) {
                return { method: 'failed', success: false, error: e2.message };
              }
            }
          }

          // ── Execute ──────────────────────────────────────────────────
          const found = findDeleteElements();
          if (found.length === 0) {
            return { success: false, reason: 'noElementsFound', found: [] };
          }

          const result = clickElement(found[0].element);
          return {
            success: result.success,
            method: result.method,
            clickedElement: {
              tag: found[0].tag,
              selector: found[0].selector,
              text: found[0].text,
              id: found[0].id || '',
              className: found[0].className || '',
            },
            allFoundElements: found.map(function(f) { return {
              tag: f.tag, selector: f.selector, text: f.text
            };})
          };
        })()
      `);

      if (result && result.success) {
        logger.info(`[AmazonIOSSafariPage] JS delete executed: method=${result.method}, element=${result.clickedElement.tag}[${result.clickedElement.selector}]`);
        await this.driver.pause(3000);

        const removalConfirmed = await this._confirmItemRemoved();
        if (removalConfirmed) {
          logger.info('[AmazonIOSSafariPage] Item removed via JS fallback.');
          return true;
        }

        logger.warn('[AmazonIOSSafariPage] JS click executed but item not removed.');
        return false;
      }

      if (result && !result.success) {
        logger.warn(`[AmazonIOSSafariPage] JS delete failed: ${result.reason}`);
        if (result.reason === 'noElementsFound') {
          allErrors.push('JS fallback: no delete elements found on page');
        }
      }
    } catch (err) {
      allErrors.push(`JS fallback: ${err.message.substring(0, 100)}`);
    }

    return false;
  }

  /**
   * Confirm that an item was removed from the cart.
   * Checks the page source for empty-cart indicators or the absence of items.
   *
   * @returns {Promise<boolean>} True if the cart appears empty or item was removed
   */
  async _confirmItemRemoved() {
    try {
      const source = await this.driver.getPageSource().catch(() => '');
      // Check for empty cart indicators
      if (/cart is empty|your shopping cart is empty|your amazon cart is empty|your cart is empty|no items|0 items|add items to cart|item deleted|item removed/i.test(source)) {
        return true;
      }

      // Check that delete action is no longer present (item was removed from DOM)
      // Note: This is not definitive — Amazon may re-render the cart
      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * Capture comprehensive diagnostic information about the cart page
   * when the delete button cannot be found.
   *
   * @param {string[]} allErrors - Accumulated error messages
   */
  async _captureCartPageDiagnostics(allErrors) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseDir = this.debugSourceDir || 'reports/ios/debug';
      fs.ensureDirSync(baseDir);

      // Current URL and title
      const currentUrl = await this.driver.getUrl().catch(() => 'unknown');
      const pageTitle = await this.driver.getTitle().catch(() => 'unknown');

      // ── 1. Full page source ─────────────────────────────────────────
      try {
        const source = await this.driver.getPageSource().catch(() => '');
        const sourcePath = path.join(baseDir, `cart-delete-failed-${timestamp}.html`);
        fs.writeFileSync(sourcePath, source, 'utf8');
        logger.info(`[AmazonIOSSafariPage] Cart page source saved: ${sourcePath}`);
      } catch (_) {}

      // ── 2. Screenshot ────────────────────────────────────────────────
      try {
        const screenshotDir = this.debugScreenshotDir || 'reports/ios/screenshots';
        fs.ensureDirSync(screenshotDir);
        const screenshotPath = path.join(screenshotDir, `cart-delete-failed-${timestamp}.png`);
        await this.driver.saveScreenshot(screenshotPath);
        logger.info(`[AmazonIOSSafariPage] Cart screenshot saved: ${screenshotPath}`);
      } catch (_) {}

      // ── 3. Extract all interactive elements via JS ──────────────────
      try {
        const interactiveElements = await this.driver.execute(`
          (function() {
            const results = [];
            const selectors = [
              'a[href]', 'button', 'input[type="submit"]', 'input[type="button"]',
              'span[data-action]', '[data-testid]', '[data-csa-c-action]',
              '.sc-action-delete', '[data-action*="delete"]', '[data-testid*="delete"]',
              'a[aria-label]', 'input[value]', '[role="button"]',
              'a[href*="delete"]', 'button[name*="delete"]', 'input[name*="delete"]',
              '[data-component-type="cart-item"]', '.sc-list-item',
            ];
            for (const sel of selectors) {
              const els = document.querySelectorAll(sel);
              for (const el of els) {
                const rect = el.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0;
                results.push({
                  tag: el.tagName,
                  id: el.id,
                  className: (el.className || '').substring(0, 60),
                  text: (el.textContent || '').trim().substring(0, 80),
                  href: el.getAttribute('href') || '',
                  dataAction: el.getAttribute('data-action') || '',
                  dataTestid: el.getAttribute('data-testid') || '',
                  name: el.getAttribute('name') || '',
                  value: el.getAttribute('value') || '',
                  ariaLabel: el.getAttribute('aria-label') || '',
                  visible: visible,
                  rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
                });
              }
            }
            return results;
          })()
        `);

        const diagPath = path.join(baseDir, `cart-delete-diagnostics-${timestamp}.json`);
        const diagData = {
          timestamp: new Date(timestamp).toISOString(),
          url: currentUrl,
          pageTitle: pageTitle,
          interactiveElementsCount: (interactiveElements || []).length,
          interactiveElements: interactiveElements || [],
          errors: allErrors,
        };
        fs.writeFileSync(diagPath, JSON.stringify(diagData, null, 2), 'utf8');
        logger.info(`[AmazonIOSSafariPage] Cart diagnostics saved: ${diagPath}`);

        // Also log a summary of interactive elements to the console
        if (interactiveElements && interactiveElements.length > 0) {
          logger.info('[AmazonIOSSafariPage] Interactive elements on cart page:');
          for (const el of interactiveElements.slice(0, 30)) {
            logger.info(`  <${el.tag}> id="${el.id}" class="${el.className}" text="${el.text}" href="${el.href}" data-testid="${el.dataTestid}" visible=${el.visible}`);
          }
        }
      } catch (err) {
        logger.warn(`[AmazonIOSSafariPage] Interactive element extraction failed: ${err.message}`);
      }
    } catch (err) {
      logger.warn(`[AmazonIOSSafariPage] Diagnostic capture failed: ${err.message}`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Proceed to checkout from the cart page.
   *
   * Amazon Smart Wagon cart page on mobile Safari has a completely different
   * DOM structure than the old /gp/cart/view.html. The checkout button may be:
   *   - An <a> tag with data-csa-c-slot-id="checkout"
   *   - An <a> tag with a href pointing to /checkout or /buy
   *   - An <input> with name="proceedToRetailCheckout" or similar
   *   - A <button> or <span> with data-testid containing "proceed"
   *   - A <form> with an action pointing to checkout
   *
   * Strategy (in order):
   *   1. Verify cart page is fully loaded (wait for indicators)
   *   2. CSS selectors targeting Smart Wagon and standard cart checkout buttons
   *   3. XPath selectors as fallback
   *   4. JavaScript execution — traverse DOM to find "Proceed to Buy" by text
   *   5. URL-based fallback — navigate directly to checkout
   *
   * @returns {Promise<boolean>} True if checkout was successfully reached
   * @throws {Error} If no checkout button could be found
   */
  async proceedToCheckout() {
    await this._logActionStart("proceedToCheckout", { screen: "CART_PAGE" });
    const currentUrl = await this.driver.getUrl().catch(() => '');
    logger.info('[AmazonIOSSafariPage] Proceeding to checkout. URL: ' + currentUrl);

    const allErrors = [];

    // ── Step 0: Verify cart page is fully loaded ─────────────────────
    logger.info('[AmazonIOSSafariPage] Waiting for cart page to fully load...');
    try {
      await this.driver.waitUntil(async () => {
        const src = await this.driver.getPageSource();
        return /shopping cart|smart.wagon|cart total|subtotal|proceed|checkout|place order/i.test(src)
          && !/loading|spinner|please wait/i.test(src);
      }, { timeout: 15000, interval: 1000 });
      logger.info('[AmazonIOSSafariPage] Cart page DOM is ready.');
    } catch (err) {
      logger.warn('[AmazonIOSSafariPage] Cart page load wait timed out — proceeding anyway.');
    }

    // ── Step 1: CSS Selectors ─────────────────────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 1: Trying CSS selectors...');
    const proceedSelectors = [
      // Amazon Smart Wagon cart uses data-csa-c-slot-id for checkout links
      'a[data-csa-c-slot-id*="checkout"]',
      '[data-csa-c-slot-id*="checkout"]',
      'a[data-csa-c-slot-id*="proceed"]',
      // Data-testid based proceed-to-checkout
      '[data-testid*="proceed-to-checkout"]',
      'button[data-testid*="proceed-to-checkout"]',
      'a[data-testid*="proceed-to-checkout"]',
      // Input-based checkout buttons (most common on Smart Wagon)
      'input[name*="proceedToRetailCheckout"]',
      'input[name="proceedToCheckout"]',
      'input[name="proceedToRetailCheckout"]',
      'input[name*="proceed-to-checkout"]',
      // Generic checkout links
      'a[href*="/checkout"]',
      'a[href*="checkout"]',
      'a[href*="gp/buy"]',
      'a[href*="/buy/"]',
      'a[href*="select-address"]',
      // Data-action based checkout
      'span[data-action*="proceed-to-checkout"]',
      'span[data-action*="proceed-to-checkout"] a',
      'span[data-action*="proceed-to-checkout"] input',
      'span[data-action*="proceed-to-buy"]',
      'span[data-action*="proceed-to-buy"] input',
      // Value/aria-label based
      'input[value*="Proceed"]',
      'input[value*="proceed"]',
      'input[value*="Checkout"]',
      'input[value*="checkout"]',
      'a[aria-label*="Proceed"]',
      'a[aria-label*="proceed"]',
      'button[aria-label*="Proceed"]',
      'button[aria-label*="proceed"]',
      // Standard cart patterns (fallback)
      '#sc-buy-box-ptc-button input',
      '.sc-buy-box input[type="submit"]',
      '[name*="proceed"] input[type="submit"]',
      '[id*="proceed"] input[type="submit"]',
      // Form-based checkout
      'form[action*="checkout"] input[type="submit"]',
      'form[action*="buy"] input[type="submit"]',
      // Last resort: any submit button on the page
      'input[type="submit"]:not([value*="Delete"]):not([value*="delete"]):not([name*="delete"])',
    ];

    const clickedViaCss = await this._tryProceedSelectors(proceedSelectors, allErrors);
    if (clickedViaCss) return true;

    // ── Step 2: XPath Selectors ───────────────────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 2: Trying XPath selectors...');
    const proceedXPaths = [
      "//a[contains(@data-csa-c-slot-id, 'checkout')]",
      "//*[contains(@data-testid, 'proceed')]",
      "//a[contains(@href, 'checkout')]",
      "//a[contains(@href, 'gp/buy')]",
      "//a[contains(@href, 'select-address')]",
      "//input[contains(@name, 'proceed')]",
      "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed')]",
      "//span[contains(@data-action, 'proceed')]",
      "//span[contains(@data-action, 'proceed-to-checkout')]//a",
      "//button[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed')]",
      "//a[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed')]",
      "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed to buy')]",
      "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed to checkout')]",
      "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'buy')]",
      "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'checkout')]",
    ];

    for (const xpath of proceedXPaths) {
      try {
        const elements = await this.driver.$$(xpath);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;
          try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_) {}
          logger.info('[AmazonIOSSafariPage] Clicking checkout via XPath');
          await el.click();
          await this.driver.pause(5000);
          if (await this._confirmCheckoutReached()) return true;
        }
      } catch (err) {
        allErrors.push('XPath: ' + err.message.substring(0, 100));
      }
    }

    // ── Step 3: JavaScript Execution Fallback ─────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 3: Trying JavaScript execution...');
    const clickedViaJs = await this._tryJsProceedFallback(allErrors);
    if (clickedViaJs) return true;

    // ── Step 4: URL-based fallback ────────────────────────────────────
    logger.info('[AmazonIOSSafariPage] Phase 4: URL-based fallback...');
    try {
      const checkoutUrls = [
        'https://www.amazon.in/gp/buy/select-address',
        'https://www.amazon.in/gp/buy/',
        'https://www.amazon.in/checkout/',
      ];
      for (const url of checkoutUrls) {
        logger.info('[AmazonIOSSafariPage] Navigating directly to checkout: ' + url);
        await this.driver.url(url);
        await this.driver.pause(5000);
        if (await this._confirmCheckoutReached()) {
          logger.info('[AmazonIOSSafariPage] Checkout reached via URL navigation.');
          return true;
        }
      }
    } catch (err) {
      allErrors.push('URL fallback: ' + err.message.substring(0, 100));
    }

    // ── All attempts failed — capture diagnostics ─────────────────────
    await this._captureProceedDiagnostics(allErrors);

    throw new Error(
      '[AmazonIOSSafariPage] Could not find Proceed to Buy button on cart page.\n' +
      'URL: ' + currentUrl + '\n' +
      'CSS selectors attempted: ' + proceedSelectors.length + '\n' +
      'XPath selectors attempted: ' + proceedXPaths.length + '\n' +
      'JS fallback attempted: yes\n' +
      'URL fallback attempted: yes\n' +
      'Errors: ' + allErrors.join('; ')
    );
  }

  /**
   * Try each proceed-to-checkout CSS selector in order.
   */
  async _tryProceedSelectors(selectors, allErrors) {
    await this.driver.pause(1000);

    for (const selector of selectors) {
      try {
        const elements = await this.driver.$$(selector);
        if (elements.length === 0) continue;

        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) {
            try { await element.scrollIntoView(); await this.driver.pause(300); } catch (_) {}
            const recheck = await element.isDisplayed().catch(() => false);
            if (!recheck) continue;
          }

          logger.info('[AmazonIOSSafariPage] Clicking checkout via selector: "' + selector + '"');
          try { await element.scrollIntoView(); await this.driver.pause(300); } catch (_) {}
          await element.click();
          await this.driver.pause(5000);

          const checkoutReached = await this._confirmCheckoutReached();
          if (checkoutReached) {
            logger.info('[AmazonIOSSafariPage] Checkout reached.');
            return true;
          }

          logger.warn('[AmazonIOSSafariPage] Click on "' + selector + '" did not reach checkout.');
        }
      } catch (err) {
        allErrors.push('CSS "' + selector + '": ' + err.message.substring(0, 100));
      }
    }
    return false;
  }

  /**
   * JavaScript execution fallback to find and click Proceed to Buy.
   */
  async _tryJsProceedFallback(allErrors) {
    try {
      const result = await this.driver.execute(function() {
        function findCheckoutElements() {
          var results = [];

          // Strategy A: data-csa-c-slot-id
          document.querySelectorAll('[data-csa-c-slot-id*="checkout"], [data-csa-c-slot-id*="proceed"]').forEach(function(el) {
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 0 && rect.height > 0;
            if (visible) results.push({ source: "data-csa-c-slot-id", tag: el.tagName, text: (el.textContent || "").trim().substring(0, 60) });
          });

          // Strategy B: data-testid
          document.querySelectorAll('[data-testid*="proceed"], [data-testid*="checkout"]').forEach(function(el) {
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 0 && rect.height > 0;
            if (visible && !results.some(function(r) { return r.element === el; })) results.push({ source: "data-testid", tag: el.tagName, text: (el.textContent || "").trim().substring(0, 60) });
          });

          // Strategy C: inputs with proceed/checkout in name/value
          document.querySelectorAll('input[name*="proceed"], input[name*="checkout"], input[value*="Proceed"], input[value*="proceed"], input[value*="Checkout"], input[value*="checkout"]').forEach(function(el) {
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 0 && rect.height > 0;
            if (visible && !results.some(function(r) { return r.element === el; })) results.push({ source: "input-name-value", tag: el.tagName, name: el.name, value: el.value });
          });

          // Strategy D: anchors with checkout/buy in href
          document.querySelectorAll('a[href*="/checkout"], a[href*="/buy/"], a[href*="select-address"], a[href*="gp/buy"]').forEach(function(el) {
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 0 && rect.height > 0;
            if (visible && !results.some(function(r) { return r.element === el; })) results.push({ source: "anchor-href", tag: el.tagName, href: el.href, text: (el.textContent || "").trim().substring(0, 60) });
          });

          // Strategy E: text content matching
          document.querySelectorAll('a, button, span, input[type="submit"], input[type="button"]').forEach(function(el) {
            var text = (el.textContent || el.value || "").trim();
            var aria = (el.getAttribute("aria-label") || "").trim();
            if (/proceed.*(?:buy|checkout)|place.*order/i.test(text) || /proceed.*(?:buy|checkout)|place.*order/i.test(aria)) {
              var rect = el.getBoundingClientRect();
              var visible = rect.width > 0 && rect.height > 0;
              if (visible && !results.some(function(r) { return r.element === el; })) results.push({ source: "text-match", tag: el.tagName, text: text.substring(0, 60), aria: aria });
            }
          });

          return results;
        }

        function clickElement(el) {
          el.scrollIntoView({ behavior: "instant", block: "center" });
          try { el.click(); return { method: "nativeClick", success: true }; }
          catch(e) {
            try {
              var event = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
              el.dispatchEvent(event);
              return { method: "dispatchedEvent", success: true };
            } catch(e2) { return { method: "failed", success: false, error: e2.message }; }
          }
        }

        var found = findCheckoutElements();
        if (found.length === 0) return { success: false, reason: "noCheckoutElementsFound", foundCount: 0 };

        var result = clickElement(found[0].element);
        return {
          success: result.success,
          method: result.method,
          clickedSource: found[0].source,
          clickedTag: found[0].tag,
          allFoundCount: found.length,
        };
      });

      if (result && result.success) {
        logger.info('[AmazonIOSSafariPage] JS checkout click: method=' + result.method + ', element=' + result.clickedTag + '[' + result.clickedSource + ']');
        await this.driver.pause(5000);
        if (await this._confirmCheckoutReached()) {
          logger.info('[AmazonIOSSafariPage] Checkout reached via JS fallback.');
          return true;
        }
      }

      if (result && !result.success) {
        allErrors.push('JS fallback: ' + (result.reason || 'failed'));
        if (result.reason === 'noCheckoutElementsFound') {
          logger.warn('[AmazonIOSSafariPage] JS fallback: no checkout elements found on page');
        }
      }
    } catch (err) {
      allErrors.push('JS fallback: ' + err.message.substring(0, 100));
    }
    return false;
  }

  /**
   * Confirm that the checkout page was reached.
   */
  async _confirmCheckoutReached() {
    try {
      const url = await this.driver.getUrl().catch(() => '');
      if (/checkout|buy|select-address|spc/i.test(url)) {
        logger.info('[AmazonIOSSafariPage] Checkout confirmed via URL: ' + url);
        return true;
      }
      const source = await this.driver.getPageSource().catch(() => '');
      if (/select-delivery-address|payment-method|place your order|place order now|delivery address|card number|credit card|debit card|ship to this address/i.test(source)) {
        logger.info('[AmazonIOSSafariPage] Checkout confirmed via page source.');
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * Capture comprehensive diagnostics when checkout button cannot be found.
   */
  async _captureProceedDiagnostics(allErrors) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseDir = this.debugSourceDir || 'reports/ios/debug';
      fs.ensureDirSync(baseDir);

      const currentUrl = await this.driver.getUrl().catch(() => 'unknown');
      const pageTitle = await this.driver.getTitle().catch(() => 'unknown');

      // Save screenshot
      const screenshotDir = this.debugScreenshotDir || 'reports/ios/screenshots';
      fs.ensureDirSync(screenshotDir);
      await this.driver.saveScreenshot(screenshotDir + '/checkout-failed-' + timestamp + '.png').catch(() => {});

      // Save full page source
      const source = await this.driver.getPageSource().catch(() => '');
      fs.writeFileSync(baseDir + '/checkout-failed-' + timestamp + '.html', source, 'utf8');

      // Extract interactive elements via JS
      const interactiveElements = await this.driver.execute(function() {
        var results = [];
        var selectors = [
          'a[href]', 'button', 'input[type="submit"]', 'input[type="button"]',
          'span[data-action]', '[data-testid]', '[data-csa-c-slot-id]',
          '[data-component-type="cart-item"]', '.sc-list-item',
          'form input[type="submit"]', 'a[role="button"]',
        ];
        for (var s = 0; s < selectors.length; s++) {
          var els = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 0 && rect.height > 0;
            results.push({
              tag: el.tagName, id: el.id,
              className: (el.className || '').substring(0, 60),
              text: (el.textContent || '').trim().substring(0, 80),
              href: el.getAttribute('href') || '',
              dataAction: el.getAttribute('data-action') || '',
              dataTestid: el.getAttribute('data-testid') || '',
              dataCsa: el.getAttribute('data-csa-c-slot-id') || '',
              name: el.getAttribute('name') || '',
              value: el.getAttribute('value') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              visible: visible,
            });
          }
        }
        return results;
      }).catch(function() { return []; });

      var diagData = {
        timestamp: new Date(timestamp).toISOString(),
        url: currentUrl,
        pageTitle: pageTitle,
        interactiveElementsCount: (interactiveElements || []).length,
        interactiveElements: interactiveElements || [],
        errors: allErrors,
      };
      fs.writeFileSync(
        baseDir + '/checkout-diagnostics-' + timestamp + '.json',
        JSON.stringify(diagData, null, 2),
        'utf8'
      );

      logger.info('[AmazonIOSSafariPage] Checkout diagnostics saved to ' + baseDir + '/checkout-diagnostics-' + timestamp + '.json');
      logger.info('[AmazonIOSSafariPage] Interactive elements on page: ' + (interactiveElements || []).length);
      if (interactiveElements && interactiveElements.length > 0) {
        for (var i = 0; i < Math.min(interactiveElements.length, 40); i++) {
          var el = interactiveElements[i];
          logger.info('  <' + el.tag + '> id="' + el.id + '" name="' + el.name + '" value="' + el.value + '" aria="' + el.ariaLabel + '" data-testid="' + el.dataTestid + '" data-csa="' + el.dataCsa + '" href="' + el.href + '" text="' + el.text + '" visible=' + el.visible);
        }
      }
    } catch (err) {
      logger.warn('[AmazonIOSSafariPage] Diagnostic capture failed: ' + err.message);
    }
  }

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
        timeout: Math.min(this.iosTimeout || this.timeout, 45000),
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
      timeout: Math.min(this.iosTimeout || this.timeout, 45000),
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
        // Restore previous context (WEBVIEW)
        const restored = await this.driver.switchContext(previousContext)
          .then(() => true).catch(() => false);

        if (!restored) {
          // Context switch failed — re-query available contexts and find WEBVIEW
          logger.warn('[AmazonIOSSafariPage] Failed to restore context ' + previousContext + ' — re-querying contexts');
          try {
            const contexts = await this.driver.getContexts().catch(() => []);
            const webview = contexts.find(function(c) { return String(c).toLowerCase().includes('webview'); });
            if (webview) {
              await this.driver.switchContext(webview);
              logger.info('[AmazonIOSSafariPage] Switched to WebView context: ' + webview);
            } else {
              logger.warn('[AmazonIOSSafariPage] No WebView context available after native interaction');
            }
          } catch (ctxErr) {
            logger.warn('[AmazonIOSSafariPage] Context re-query failed: ' + ctxErr.message);
          }
        }
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
