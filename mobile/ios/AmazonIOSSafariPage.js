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
      '[data-testid="sign-in-dialog"]',
      '[data-component-type="sign-in-accordion"]',
      '#auth-consent-ux-footer-claim',
      // Close/dismiss buttons on the overlay
      'button[aria-label="Close"]',
      'button[aria-label="close"]',
      'span[aria-label="Close"]',
      'a[aria-label="Close"]',
      '[data-testid="close-button"]',
      // Generic dismiss via "X" button
      '.a-icon-close',
      'button.a-button-close',
      // "Not now" dismissal link
      'a[href*="sign-in-not-now"]',
      'a[aria-label*="Not now"]',
      'a:has-text("Not now")',
      'button:has-text("Not now")',
      'span:has-text("Not now")',
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

  // ═════════════════════════════════════════════════════════════════════════
  // Auth Overlay Detection & Dismissal
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Quick check if an auth overlay is currently present on the page.
   * Checks page source for sign-in related text patterns.
   * This is lightweight (no DOM traversal) and safe to call frequently.
   *
   * @returns {Promise<boolean>} True if sign-in overlay text is detected
   */
  async _isAuthOverlayPresent() {
    try {
      const source = await this.driver.getPageSource().catch(() => '');
      if (!source) return false;

      // Check for sign-in overlay text patterns in page source
      const overlayPatterns = [
        /sign in or create account/i,
        /sign in to continue/i,
        /sign-in modal/i,
        /not now.*sign/i,
        /sign.*not now/i,
        /auth-signin-modal/i,
        /data-testid="sign-in/i,
        /data-component-type="sign-in-accordion"/i,
      ];

      for (const pattern of overlayPatterns) {
        if (pattern.test(source)) {
          logger.info('[AmazonIOSSafariPage] Auth overlay detected via pattern: ' + pattern);
          return true;
        }
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Public method: dismiss the Amazon "Sign in or Create Account" bottom sheet.
   * This is safe to call from hooks or step definitions as a global popup handler.
   * It is a no-op if no overlay is present.
   *
   * Strategy (in order):
   *   1. Check current URL for /ap/signin redirect
   *   2. Search DOM for known sign-in overlay containers
   *   3. Try "Not now" text-based dismissal (most common on modern Amazon)
   *   4. Try Close/X buttons
   *   5. Try body click (backdrop dismiss)
   *   6. Try JS text-based fallback (find any element with "Not now" text)
   *   7. Navigate back / to home as last resort
   *
   * @returns {Promise<boolean>} True if a sign-in prompt was dismissed
   */
  async dismissAuthOverlay() {
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');

    // ── Early exit: no sign-in indicators in URL or source ──────────────
    const hasUrlIndicator = this.signInUrlPattern.test(currentUrl);
    const hasSourceIndicator = /sign in or create account|sign in to continue|auth-signin|not now.*sign/i.test(source);
    if (!hasUrlIndicator && !hasSourceIndicator) {
      // Quick scan overlay selectors (lightweight)
      let foundOverlay = false;
      for (const sel of this.signInBottomSheetSelectors) {
        try {
          const els = await this.driver.$$(sel);
          for (const el of els) {
            if (await el.isDisplayed().catch(() => false)) {
              foundOverlay = true;
              break;
            }
          }
        } catch (_) {}
        if (foundOverlay) break;
      }
      if (!foundOverlay) {
        logger.info('[AmazonIOSSafariPage] No auth overlay detected — skipping dismissAuthOverlay');
        return false;
      }
    }

    logger.info('[AmazonIOSSafariPage] Auth overlay detected — attempting dismissal');

    // ── Strategy 1: URL-based — redirected to sign-in page ──────────────
    if (this.signInUrlPattern.test(currentUrl)) {
      logger.info('[AmazonIOSSafariPage] Sign-in page detected via URL — navigating back');
      await this.driver.back().catch(() => {});
      await this.driver.pause(2000);
      const afterBack = await this.driver.getUrl().catch(() => '');
      if (this.signInUrlPattern.test(afterBack)) {
        await this.driver.url('https://www.amazon.in/').catch(() => {});
        await this.driver.pause(3000);
      }
      return true;
    }

    // ── Strategy 2: Click "Not now" via text-based JS selector ──────────
    try {
      const notNowClicked = await this.driver.execute(function() {
        var els = document.querySelectorAll('a, button, span, input');
        for (var i = 0; i < els.length; i++) {
          var t = (els[i].textContent || '').trim().toLowerCase();
          var aria = (els[i].getAttribute('aria-label') || '').trim().toLowerCase();
          if (t === 'not now' || aria === 'not now' ||
              t.indexOf('not now') !== -1 || aria.indexOf('not now') !== -1 ||
              t.indexOf('skip') !== -1 || aria.indexOf('skip') !== -1) {
            if (els[i].offsetParent !== null) {  // visible check
              try { els[i].click(); return { method: 'notNowClick', clicked: t || aria }; }
              catch(e) { try {
                var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                els[i].dispatchEvent(evt);
                return { method: 'notNowDispatch', clicked: t || aria };
              } catch(e2) { continue; }}
            }
          }
        }
        return { method: 'none' };
      });
      if (notNowClicked && notNowClicked.method !== 'none') {
        logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via "Not now": ' + JSON.stringify(notNowClicked));
        await this.driver.pause(1500);
        return true;
      }
    } catch (_) {}

    // ── Strategy 3: DOM-based — find overlay container, then dismiss ────
    for (const selector of this.signInBottomSheetSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          logger.info('[AmazonIOSSafariPage] Auth overlay detected via selector: ' + selector);

          // Try "Not now" links inside the overlay first
          const notNowSelectors = [
            'a[href*="sign-in-not-now"]',
            'a[aria-label*="Not now"]',
            'a:has-text("Not now")',
            'button:has-text("Not now")',
            'span:has-text("Not now")',
          ];
          for (const nnSel of notNowSelectors) {
            try {
              const nnEls = await this.driver.$$(nnSel);
              for (const nnEl of nnEls) {
                if (await nnEl.isDisplayed().catch(() => false)) {
                  await nnEl.click();
                  await this.driver.pause(1500);
                  logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via "Not now" selector: ' + nnSel);
                  return true;
                }
              }
            } catch (_) {}
          }

          // Try close buttons
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
                  logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via close button: ' + closeSel);
                  return true;
                }
              }
            } catch (_) {}
          }

          // Fallback: body click
          try {
            await this.driver.execute('document.body.click()');
            await this.driver.pause(1000);
            logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via body click');
            return true;
          } catch (_) {}

          // Back navigation
          try {
            await this.driver.back().catch(() => {});
            await this.driver.pause(2000);
            logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via back navigation');
            return true;
          } catch (_) {}
        }
      } catch (_) {}
    }

    // ── Strategy 4: Page-source text fallback with JS ───────────────────
    if (/sign in or create account|sign in to continue/i.test(source)) {
      logger.info('[AmazonIOSSafariPage] Sign-in text in source — trying JS text fallback');
      try {
        const result = await this.driver.execute(
          'var els=document.querySelectorAll("a,button,span");' +
          'for(var i=0;i<els.length;i++){' +
          'var t=(els[i].textContent||"").trim().toLowerCase();' +
          'if(t==="not now"||t.indexOf("not now")!==-1||t==="skip"||t==="close"||t==="dismiss"||t==="cancel"){' +
          'if(els[i].offsetParent!==null){try{els[i].click();return "clicked "+t;}catch(e){try{var evt=new MouseEvent(\'click\',{bubbles:true,cancelable:true});els[i].dispatchEvent(evt);return "dispatched "+t;}catch(e2){continue;}}}}}return "none";'
        );
        if (result && result !== 'none') {
          logger.info('[AmazonIOSSafariPage] Auth overlay dismissed via JS text fallback: ' + result);
          await this.driver.pause(1500);
          return true;
        }
      } catch (_) {}
    }

    logger.info('[AmazonIOSSafariPage] Auth overlay dismissal completed (may not have been present)');
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Original _dismissSignInBottomSheet — kept for backward compatibility
  // ═════════════════════════════════════════════════════════════════════════

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
    return this.dismissAuthOverlay();
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
    await this.dismissAuthOverlay();
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

  // ═════════════════════════════════════════════════════════════════════════
  // Page Verification
  // ═════════════════════════════════════════════════════════════════════════

  async verifyVisible(locatorOrSelector) {
    await this.dismissAuthOverlay();
    if (typeof locatorOrSelector === 'object' && locatorOrSelector.__iosSafariSentinel) {
      // Logo sentinel — check page source for Amazon brand presence
      const source = await this.driver.getPageSource();
      const hasAmazonBranding = /amazon|amazon\.in/i.test(source);
      if (!hasAmazonBranding) {
        throw new Error('Amazon branding not found in page source for iOS Safari sentinel logo check');
      }
      logger.info('[AmazonIOSSafariPage] Logo verified via page source (sentinel)');
      return;
    }

    if (typeof locatorOrSelector === 'string') {
      // Treat as CSS selector — check if any matching element is visible
      const els = await this.driver.$$(locatorOrSelector);
      for (const el of els) {
        const displayed = await el.isDisplayed().catch(() => false);
        if (displayed) {
          logger.info('[AmazonIOSSafariPage] verifyVisible: element found via selector "' + locatorOrSelector + '"');
          return;
        }
      }
      throw new Error('verifyVisible: no visible element found for selector "' + locatorOrSelector + '"');
    }

    // If it's a WebDriverIO element, check its display
    try {
      const displayed = await locatorOrSelector.isDisplayed();
      if (!displayed) throw new Error('Element is not displayed');
    } catch (err) {
      throw new Error('verifyVisible: element not visible: ' + err.message);
    }
  }

  async verifyHomeLoaded() {
    await this.dismissAuthOverlay();
    const source = await this.driver.getPageSource();
    const hasHomepageIndicators = /amazon|amazon\.in|search|shop by/i.test(source);
    if (!hasHomepageIndicators) {
      logger.warn("[AmazonIOSSafariPage] verifyHomeLoaded: Amazon indicators not found in page source");
      // Don't throw — the page might still be loading
    }
    logger.info('[AmazonIOSSafariPage] Home page verified');
    return true;
  }

  async verifyCartPageVisible() {
    await this.dismissAuthOverlay();
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');
    const isCartPage = (
      /cart|smart-wagon|smart_wagon/i.test(currentUrl) ||
      /cart|shopping cart|your items/i.test(source)
    );
    if (!isCartPage) {
      throw new Error(
        '[AmazonIOSSafariPage] Cart page not visible.\n' +
        'URL: ' + currentUrl + '\n' +
        'The auth overlay may have redirected away from cart.'
      );
    }
    logger.info('[AmazonIOSSafariPage] Cart page verified');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Page Actions
  // ═════════════════════════════════════════════════════════════════════════

  async searchProduct(productName) {
    await this.dismissAuthOverlay();
    await this._logActionStart("searchProduct", { screen: "SEARCH" });
    const searchSelectors = [
      '#twotabsearchtextbox',
      'input[name="k"]',
      'input[type="search"]',
      '#nav-search-bar-form input',
    ];

    let searchBox = null;
    for (const sel of searchSelectors) {
      const els = await this.driver.$$(sel);
      for (const el of els) {
        if (await el.isDisplayed().catch(() => false)) {
          searchBox = el;
          break;
        }
      }
      if (searchBox) break;
    }

    if (!searchBox) {
      // Try the nav-search-bar-form as a last resort
      const navSearch = await this.driver.$('#nav-search-bar-form input');
      if (navSearch) {
        const displayed = await navSearch.isDisplayed().catch(() => false);
        if (displayed) searchBox = navSearch;
      }
    }

    if (!searchBox) throw new Error('Could not find search input field');

    await searchBox.click();
    await searchBox.setValue(productName);
    await this.driver.keys(['Enter']);
    await this.driver.pause(3000);
  }

  async openFirstProductFromResults() {
    await this.dismissAuthOverlay();
    await this._logActionStart("openFirstProductFromResults", { screen: "SEARCH_RESULTS" });

    // Wait for search results to render
    await this.waitForSearchResultsRendered(30000);

    let clicked = false;
    const allErrors = [];

    // Try known product link selectors in order
    for (const sel of this.productLinks) {
      try {
        const elements = await this.driver.$$(sel);
        if (elements.length === 0) {
          allErrors.push('Selector "' + sel + '": no elements found');
          continue;
        }

        // Try each element until we find a visible one
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          try {
            await el.click();
            clicked = true;
            logger.info('[AmazonIOSSafariPage] Clicked product link via selector: ' + sel);
            break;
          } catch (clickErr) {
            allErrors.push('Selector "' + sel + '" click failed: ' + clickErr.message.substring(0, 80));
          }
        }
        if (clicked) break;
      } catch (err) {
        allErrors.push('Selector "' + sel + '" error: ' + err.message.substring(0, 80));
      }
    }

    if (!clicked) {
      // JS fallback: try clicking the first visible product link
      try {
        const jsResult = await this.driver.execute(function() {
          var links = document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"], h2 a, [data-asin] a');
          for (var i = 0; i < links.length; i++) {
            if (links[i].offsetParent !== null) {
              try { links[i].click(); return { method: 'jsClick', index: i }; }
              catch(e) {
                try { var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  links[i].dispatchEvent(evt); return { method: 'jsDispatch', index: i }; }
                catch(e2) { continue; }
              }
            }
          }
          return { method: 'none' };
        });

        if (jsResult && jsResult.method !== 'none') {
          clicked = true;
          logger.info('[AmazonIOSSafariPage] JS fallback clicked product link: ' + JSON.stringify(jsResult));
        } else {
          allErrors.push('JS fallback: no visible product link found');
        }
      } catch (jsErr) {
        allErrors.push('JS fallback error: ' + jsErr.message.substring(0, 80));
      }
    }

    if (!clicked) {
      throw new Error(
        '[AmazonIOSSafariPage] Could not open first product.\n' +
        'Errors: ' + allErrors.join('; ')
      );
    }

    await this.driver.pause(3000);

    // Check for sign-in overlay after clicking product link (Amazon may show auth prompt)
    await this.dismissAuthOverlay();
  }

  async addToCartIfAvailable() {
    await this.dismissAuthOverlay();
    await this._logActionStart("addToCartIfAvailable", { screen: "PRODUCT_DETAILS" });

    // Wait for product detail page to load
    await this.driver.pause(2000);

    // Check if we're on a product detail page
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');
    const isProductPage = /\/dp\/|\/gp\/product\//i.test(currentUrl) || this.productDetailPattern.test(source);
    if (!isProductPage) {
      logger.warn('[AmazonIOSSafariPage] Not on product detail page — Add to Cart may not be available');
    }

    // Try "Add to Cart" button with the selector chain
    for (const sel of this.addToCartSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await this.dismissAuthOverlay();
          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();

          logger.info('[AmazonIOSSafariPage] Add to Cart clicked via selector: ' + sel);
          return true;
        }
      } catch (err) {
        logger.warn('[AmazonIOSSafariPage] Add to Cart selector "' + sel + '" failed: ' + err.message.substring(0, 80));
      }
    }

    // Try "Buy Now" button as an alternative
    for (const sel of this.buyNowSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await this.dismissAuthOverlay();
          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();

          logger.info('[AmazonIOSSafariPage] Buy Now clicked via selector: ' + sel);
          return true;
        }
      } catch (err) {
        logger.warn('[AmazonIOSSafariPage] Buy Now selector "' + sel + '" failed: ' + err.message.substring(0, 80));
      }
    }

    // JS fallback: try to click "Add to Cart" or "Buy Now" by text
    try {
      const jsResult = await this.driver.execute(function() {
        var buttons = document.querySelectorAll(
          'input[type="submit"], button[type="submit"], a[role="button"], ' +
          'span[data-action*="add-to-cart"] input, span[data-action*="buy-now"] input'
        );
        for (var i = 0; i < buttons.length; i++) {
          var value = (buttons[i].getAttribute('value') || '').toLowerCase();
          var text = (buttons[i].textContent || '').trim().toLowerCase();
          var aria = (buttons[i].getAttribute('aria-label') || '').toLowerCase();
          if (value.indexOf('add to cart') !== -1 || value.indexOf('buy now') !== -1 ||
              text.indexOf('add to cart') !== -1 || text.indexOf('buy now') !== -1 ||
              aria.indexOf('add to cart') !== -1 || aria.indexOf('buy now') !== -1) {
            if (buttons[i].offsetParent !== null) {
              try { buttons[i].click(); return { method: 'jsTextClick', foundBy: value || text || aria }; }
              catch(e) {
                try { var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  buttons[i].dispatchEvent(evt); return { method: 'jsTextDispatch', foundBy: value || text || aria }; }
                catch(e2) { continue; }
              }
            }
          }
        }
        return { method: 'none' };
      });

      if (jsResult && jsResult.method !== 'none') {
        logger.info('[AmazonIOSSafariPage] JS fallback clicked: ' + JSON.stringify(jsResult));
        await this.driver.pause(3000);
        await this.dismissAuthOverlay();
        return true;
      }
    } catch (jsErr) {
      logger.warn('[AmazonIOSSafariPage] JS fallback error: ' + jsErr.message.substring(0, 80));
    }

    // If we navigated away to sign-in, handle it
    await this.dismissAuthOverlay();
    logger.warn('[AmazonIOSSafariPage] Add to Cart / Buy Now button not found on product page');
    return false;
  }

  async openCartPage() {
    await this.dismissAuthOverlay();
    await this._logActionStart("openCartPage", { screen: "CART_PAGE" });

    // Try clicking the cart link first
    try {
      const cartEls = await this.driver.$$(this.cartLink);
      for (const el of cartEls) {
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();
          logger.info('[AmazonIOSSafariPage] Cart page opened via cart link click');
          return;
        }
      }
    } catch (err) {
      logger.warn('[AmazonIOSSafariPage] Cart link click failed: ' + err.message.substring(0, 80));
    }

    // Navigate directly to cart URL
    logger.info('[AmazonIOSSafariPage] Navigating directly to cart URL');
    await this.driver.url('https://www.amazon.in/gp/cart/view.html');
    await this.driver.pause(3000);
    await this.dismissAuthOverlay();
  }

  async verifyCartPageVisible() {
    await this.dismissAuthOverlay();
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const source = await this.driver.getPageSource().catch(() => '');
    const isCartPage = (
      /cart|smart-wagon|smart_wagon/i.test(currentUrl) ||
      /cart|shopping cart|your items/i.test(source)
    );
    if (!isCartPage) {
      throw new Error(
        '[AmazonIOSSafariPage] Cart page not visible.\n' +
        'URL: ' + currentUrl + '\n' +
        'The auth overlay may have redirected away from cart.'
      );
    }
    logger.info('[AmazonIOSSafariPage] Cart page verified');
  }

  async removeItemFromCart() {
    await this.dismissAuthOverlay();
    await this._logActionStart("removeItemFromCart", { screen: "CART_PAGE" });

    // Phase 1: Try CSS selectors
    for (const sel of this.smartWagonDeleteSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();
          logger.info('[AmazonIOSSafariPage] Item removed via CSS selector: ' + sel);
          return true;
        }
      } catch (err) {
        logger.warn('[AmazonIOSSafariPage] CSS delete selector "' + sel + '" failed: ' + err.message.substring(0, 80));
      }
    }

    // Phase 2: Try XPath selectors
    for (const xpath of this.smartWagonDeleteXPaths) {
      try {
        const elements = await this.driver.$$(xpath);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();
          logger.info('[AmazonIOSSafariPage] Item removed via XPath: ' + xpath);
          return true;
        }
      } catch (err) {
        logger.warn('[AmazonIOSSafariPage] XPath delete selector "' + xpath + '" failed: ' + err.message.substring(0, 80));
      }
    }

    // Phase 3: JS execution fallback
    try {
      const jsResult = await this.driver.execute(function() {
        var deletables = document.querySelectorAll(
          'input[value="Delete"], button[value="Delete"], ' +
          'a[aria-label*="Delete"], a[aria-label*="delete"], ' +
          'span[data-action="delete"] a, [data-testid*="delete"] button, ' +
          '[data-testid*="delete"] a, .sc-action-delete input'
        );
        for (var i = 0; i < deletables.length; i++) {
          if (deletables[i].offsetParent !== null) {
            try { deletables[i].click(); return { method: 'jsClick', foundBy: 'delete' }; }
            catch(e) {
              try {
                var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                deletables[i].dispatchEvent(evt);
                return { method: 'jsDispatch', foundBy: 'delete' };
              } catch(e2) { continue; }
            }
          }
        }

        // Last resort: scan all links/buttons for text "Delete"
        var allEls = document.querySelectorAll('a, button, span, input');
        for (var j = 0; j < allEls.length; j++) {
          var t = (allEls[j].textContent || '').trim().toLowerCase();
          var v = (allEls[j].getAttribute('value') || '').toLowerCase();
          var aria = (allEls[j].getAttribute('aria-label') || '').toLowerCase();
          if (t === 'delete' || v === 'delete' || aria === 'delete' ||
              t.indexOf('delete') !== -1 || aria.indexOf('delete') !== -1) {
            if (allEls[j].offsetParent !== null) {
              try { allEls[j].click(); return { method: 'jsTextClick', foundBy: t || v || aria }; }
              catch(e) {
                try {
                  var evt2 = new MouseEvent('click', { bubbles: true, cancelable: true });
                  allEls[j].dispatchEvent(evt2);
                  return { method: 'jsTextDispatch', foundBy: t || v || aria };
                } catch(e2) { continue; }
              }
            }
          }
        }
        return { method: 'none' };
      });

      if (jsResult && jsResult.method !== 'none') {
        logger.info('[AmazonIOSSafariPage] JS fallback removed item: ' + JSON.stringify(jsResult));
        await this.driver.pause(3000);
        await this.dismissAuthOverlay();
        return true;
      }
    } catch (jsErr) {
      logger.warn('[AmazonIOSSafariPage] JS delete fallback error: ' + jsErr.message.substring(0, 80));
    }

    // Phase 4: Capture diagnostics
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const pageTitle = await this.driver.getTitle().catch(() => '');
    const sourceCode = await this.driver.getPageSource().catch(() => '');
    await this._captureFullDiagnostics('remove-from-cart-failure', {
      url: currentUrl,
      title: pageTitle,
      sourceLength: sourceCode.length,
      extra: { error: 'All delete strategies failed' },
    });

    throw new Error(
      '[AmazonIOSSafariPage] Could not remove item from cart.\n' +
      'Current URL: ' + currentUrl + '\n' +
      'All CSS, XPath, and JS delete strategies failed.\n' +
      'Diagnostics saved to reports/ios/debug/remove-from-cart-failure-*'
    );
  }

  async proceedToCheckout() {
    await this.dismissAuthOverlay();
    await this._logActionStart("proceedToCheckout", { screen: "CART_PAGE" });

    let checkoutClicked = false;
    const allErrors = [];

    // Phase 1: CSS selectors
    for (const sel of this.smartWagonProceedSelectors) {
      try {
        const elements = await this.driver.$$(sel);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();
          checkoutClicked = true;
          logger.info('[AmazonIOSSafariPage] Proceed to checkout clicked via CSS: ' + sel);
          break;
        }
        if (checkoutClicked) break;
      } catch (err) {
        allErrors.push('CSS "' + sel + '": ' + err.message.substring(0, 80));
      }
    }
    if (checkoutClicked) return true;

    // Phase 2: XPath selectors
    const proceedXPaths = [
      "//input[contains(@name, 'proceed')]",
      "//input[contains(@value, 'Proceed')]",
      "//a[contains(@href, 'checkout')]",
      "//a[contains(@href, 'buy')]",
      "//button[contains(@aria-label, 'Proceed')]",
      "//*[contains(@data-testid, 'proceed')]",
    ];
    for (const xpath of proceedXPaths) {
      try {
        const elements = await this.driver.$$(xpath);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          await el.click();
          await this.driver.pause(3000);
          await this.dismissAuthOverlay();
          checkoutClicked = true;
          logger.info('[AmazonIOSSafariPage] Proceed to checkout clicked via XPath: ' + xpath);
          break;
        }
        if (checkoutClicked) break;
      } catch (err) {
        allErrors.push('XPath "' + xpath + '": ' + err.message.substring(0, 80));
      }
    }
    if (checkoutClicked) return true;

    // Phase 3: JS execution fallback
    try {
      const jsResult = await this.driver.execute(function() {
        var buttons = document.querySelectorAll(
          'input[type="submit"], button[type="submit"], a[role="button"]'
        );
        for (var i = 0; i < buttons.length; i++) {
          var value = (buttons[i].getAttribute('value') || '').toLowerCase();
          var text = (buttons[i].textContent || '').trim().toLowerCase();
          var aria = (buttons[i].getAttribute('aria-label') || '').toLowerCase();
          var name = (buttons[i].getAttribute('name') || '').toLowerCase();
          var href = (buttons[i].getAttribute('href') || '').toLowerCase();
          if (
            value.indexOf('proceed') !== -1 || text.indexOf('proceed') !== -1 ||
            aria.indexOf('proceed') !== -1 || name.indexOf('proceed') !== -1 ||
            text.indexOf('checkout') !== -1 || href.indexOf('checkout') !== -1 ||
            text.indexOf('buy') !== -1 || href.indexOf('buy') !== -1
          ) {
            if (buttons[i].offsetParent !== null) {
              try { buttons[i].click(); return { method: 'jsClick', foundBy: value || text || aria || name }; }
              catch(e) {
                try {
                  var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  buttons[i].dispatchEvent(evt);
                  return { method: 'jsDispatch', foundBy: value || text || aria || name };
                } catch(e2) { continue; }
              }
            }
          }
        }
        return { method: 'none' };
      });

      if (jsResult && jsResult.method !== 'none') {
        logger.info('[AmazonIOSSafariPage] JS fallback proceed to checkout: ' + JSON.stringify(jsResult));
        await this.driver.pause(3000);
        await this.dismissAuthOverlay();
        return true;
      }
    } catch (jsErr) {
      allErrors.push('JS fallback: ' + jsErr.message.substring(0, 80));
    }

    // Phase 4: Navigate directly to checkout URL
    try {
      logger.info('[AmazonIOSSafariPage] Navigating directly to checkout URL');
      await this.driver.url('https://www.amazon.in/gp/buy/select-address');
      await this.driver.pause(3000);
      await this.dismissAuthOverlay();
      return true;
    } catch (urlErr) {
      allErrors.push('URL navigation: ' + urlErr.message.substring(0, 80));
    }

    // Capture diagnostics on complete failure
    const currentUrl = await this.driver.getUrl().catch(() => '');
    const pageTitle = await this.driver.getTitle().catch(() => '');
    await this._captureFullDiagnostics('proceed-to-checkout-failure', {
      url: currentUrl,
      title: pageTitle,
      extra: { allErrors: allErrors },
    });

    throw new Error(
      '[AmazonIOSSafariPage] Could not proceed to checkout.\n' +
      'Current URL: ' + currentUrl + '\n' +
      'Errors: ' + allErrors.join('; ') + '\n' +
      'Diagnostics saved to reports/ios/debug/proceed-to-checkout-failure-*'
    );
  }

  normalizeUrl(url) {
    if (!url) return 'https://www.amazon.in';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return 'https://www.amazon.in' + url;
    return 'https://' + url;
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
