import MobileBasePage from '../framework/mobile/MobileBasePage';
import logger from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';
/**
 * MobileAmazonCartPage — unified mobile cart page object for iOS and Android.
 *
 * Uses MobileBasePage's platform-aware selector resolution to handle
 * differences between iOS Safari WebView and Android native/WebView.
 *
 * ── Selector Maps ───────────────────────────────────────────────────────
 * ios:     CSS selectors for Amazon Smart Wagon cart in Safari WebView
 * android: Accessibility ID / CSS selectors for Android Amazon app
 * shared:  CSS selectors that work on both platforms
 *
 * ── Fallback Chain ──────────────────────────────────────────────────────
 * Each action (removeItem, proceedToCheckout, etc.) uses:
 *   1. Platform-specific selector → findVisibleElement
 *   2. Generic/fallback CSS selectors
 *   3. JavaScript execution (WebView only)
 *   4. Diagnostic capture → throw
 */


// ─────────────────────────────────────────────────────────────────────────────
// Platform-Specific Selector Maps
// ─────────────────────────────────────────────────────────────────────────────

const CART_SELECTORS = {
  ios: {
    // iOS Safari WebView — Amazon Smart Wagon cart DOM
    cartPageIndicator: '#sc-active-cart, [data-component-type="cart-item"], .sc-list-item, [data-testid*="cart-item"]',

    deleteButton: [
      '[data-testid*="delete"]',
      'button[data-testid*="delete"]',
      'a[data-testid*="delete"]',
      'span[data-action="delete"]',
      'span[data-action="delete"] a',
      '.sc-action-delete input',
      'a[aria-label*="Delete"]',
      'a[href*="delete"]',
    ],

    checkoutButton: [
      'a[data-csa-c-slot-id*="checkout"]',
      '[data-testid*="proceed-to-checkout"]',
      'input[name*="proceedToRetailCheckout"]',
      'input[name="proceedToCheckout"]',
      'a[href*="/checkout"]',
      'a[href*="gp/buy"]',
      'span[data-action*="proceed-to-checkout"] a',
      'span[data-action*="proceed-to-checkout"] input',
      'input[value*="Proceed"]',
      'a[aria-label*="Proceed"]',
      'button[aria-label*="Proceed"]',
      '#sc-buy-box-ptc-button input',
    ],

    cartPageVerification: /shopping cart|cart total|subtotal|proceed|smart wagon|your items|item total/i,

    emptyCartVerification: /cart is empty|your shopping cart is empty|your amazon cart is empty|0 items|no items/i,
  },

  android: {
    // Android Amazon app / Chrome WebView — uses accessibility IDs + CSS
    cartPageIndicator: '~cart-title',

    deleteButton: [
      '~delete-button',
      'span[data-action="delete"]',
      'span[data-action="delete"] a',
      'input[value="Delete"]',
      'a[aria-label*="Delete"]',
      'a[href*="delete"]',
      '.sc-action-delete input',
    ],

    checkoutButton: [
      '~proceed-to-checkout-button',
      '~checkout-button',
      'input[name*="proceedToRetailCheckout"]',
      'input[name="proceedToCheckout"]',
      'a[href*="/checkout"]',
      'a[href*="gp/buy"]',
      'input[value*="Proceed"]',
      'span[data-action*="proceed-to-checkout"] a',
    ],

    cartPageVerification: /cart|subtotal|proceed/i,

    emptyCartVerification: /cart is empty|empty cart|no items/i,
  },

  shared: {
    // CSS selectors that work in both iOS WebView and Android Chrome WebView
    cartItem: '[data-component-type="cart-item"], [data-asin], .sc-list-item',

    deleteButton: [
      'span[data-action="delete"] a',
      'a[href*="delete"]',
      'input[value="Delete"]',
      '.sc-action-delete input',
      '[data-csa-c-action*="delete"]',
    ],

    checkoutButton: [
      'a[href*="/checkout"]',
      'a[href*="gp/buy"]',
      'input[name*="proceedToRetailCheckout"]',
      'input[name="proceedToCheckout"]',
      'span[data-action*="proceed-to-checkout"] a',
      'a[aria-label*="Proceed"]',
      'input[value*="Proceed"]',
    ],

    emptyCartMessage: /your amazon cart is empty|cart is empty|shopping cart is empty|your cart is empty/i,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// XPath Fallbacks (for both platforms)
// ─────────────────────────────────────────────────────────────────────────────

const DELETE_XPATHS = [
  "//*[contains(@data-testid, 'delete')]",
  "//span[@data-action='delete']",
  "//span[@data-action='delete']//a",
  "//*[contains(@class, 'sc-action-delete')]//input",
  "//a[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delete')]",
  "//input[@value='Delete']",
  "//a[contains(@href, 'delete')]",
  "//a[normalize-space(text())='Delete']",
];

const CHECKOUT_XPATHS = [
  "//a[contains(@data-csa-c-slot-id, 'checkout')]",
  "//*[contains(@data-testid, 'proceed')]",
  "//a[contains(@href, 'checkout')]",
  "//a[contains(@href, 'gp/buy')]",
  "//a[contains(@href, 'select-address')]",
  "//input[contains(@name, 'proceed')]",
  "//input[contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed')]",
  "//span[contains(@data-action, 'proceed-to-checkout')]//a",
  "//button[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed')]",
  "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proceed to buy')]",
];

// ─────────────────────────────────────────────────────────────────────────────
// URL Fallbacks (checkout URL navigation)
// ─────────────────────────────────────────────────────────────────────────────

const CHECKOUT_URLS = [
  'https://www.amazon.in/gp/buy/select-address',
  'https://www.amazon.in/gp/buy/',
  'https://www.amazon.in/checkout/',
];

// ═════════════════════════════════════════════════════════════════════════════
// MobileAmazonCartPage
// ═════════════════════════════════════════════════════════════════════════════

class MobileAmazonCartPage extends MobileBasePage {
  [key: string]: any;
  /**
   * @param {object} driver - WebDriverIO browser object
   */
  constructor(driver: any) {
    super(driver, CART_SELECTORS);
    this.baseUrl = 'https://www.amazon.in';

    // ── Instance properties ──────────────────────────────────────────
    this.cartTitle = null;
    this.continueShoppingButton = null;
    this.emptyCartMessage = null;
    this.cartItems = [];
    this.proceedToBuyButton = null;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Cart Navigation
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Open the cart page.
   * For web-based platforms (iOS Safari, Android Chrome), navigates to /cart.
   * For native apps, tries URL navigation and falls back gracefully.
   */
  async openCartPage() {
    logger.info(`[MobileAmazonCartPage] Opening cart page (platform: ${this._platform})...`);
    try {
      await this.driver.url(this.baseUrl + '/cart');
    } catch (e: any) {
      logger.warn('[MobileAmazonCartPage] URL navigation failed — may be a native app');
    }
    await this.driver.pause(3000);
    logger.info('[MobileAmazonCartPage] Cart page opened.');
  }

  /**
   * Verify the cart page is visible and loaded.
   * Waits for cart-specific indicators in the DOM.
   */
  async verifyCartPageVisible() {
    logger.info('[MobileAmazonCartPage] Verifying cart page visible...');
    await this.driver.pause(2000);

    const verificationPattern = this._selectorMap[this._platform]
      ? this._selectorMap[this._platform].cartPageVerification
      : /shopping cart|cart|subtotal/i;

    try {
      const source = await this.driver.getPageSource();
      const verified = verificationPattern.test(source);
      if (verified) {
        logger.info('[MobileAmazonCartPage] Cart page verified.');
        return;
      }

      // Fallback: check URL
      const url = await this.driver.getUrl().catch(() => '');
      if (url.includes('/cart') || url.includes('smart-wagon')) {
        logger.info('[MobileAmazonCartPage] Cart page verified via URL.');
        return;
      }

      throw new Error('Cart page not visible — no cart indicators found in page source');
    } catch (err: any) {
      // Final fallback: wait and check once more
      await this.driver.pause(2000);
      const source = await this.driver.getPageSource();
      const url = await this.driver.getUrl().catch(() => '');
      if (url.includes('/cart') || url.includes('smart-wagon') || verificationPattern.test(source)) {
        logger.info('[MobileAmazonCartPage] Cart page verified on retry.');
        return;
      }
      throw err;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Remove from Cart
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Remove a product from the cart.
   *
   * Strategy:
   *   1. Platform-specific CSS selectors
   *   2. Shared/generic CSS selectors
   *   3. XPath expressions
   *   4. JavaScript execution (find by text "Delete")
   *   5. Diagnostic capture
   */
  async removeItemFromCart() {
    logger.info(`[MobileAmazonCartPage] removeItemFromCart (platform: ${this._platform})`);

    const allErrors: any[] = [];

    // ── Phase 1: CSS selectors ──────────────────────────────────────
    const deleteSelectors = this._getPlatformDeleteSelectors();
    logger.info(`[MobileAmazonCartPage] Trying ${deleteSelectors.length} CSS selectors...`);

    for (const selector of deleteSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) continue;

          try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_: any) {}
          logger.info(`[MobileAmazonCartPage] Clicking delete: "${selector}"`);
          await el.click();
          await this.driver.pause(3000);
          if (await this._confirmItemRemoved()) {
            logger.info('[MobileAmazonCartPage] Item removed.');
            return;
          }
        }
      } catch (err: any) {
        allErrors.push(`CSS: ${err.message.substring(0, 80)}`);
      }
    }

    // ── Phase 2: XPath ──────────────────────────────────────────────
    logger.info('[MobileAmazonCartPage] Trying XPath selectors...');
    for (const xpath of DELETE_XPATHS) {
      try {
        const elements = await this.driver.$$(xpath);
        for (const el of elements) {
          if (!(await el.isDisplayed().catch(() => false))) continue;
          try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_: any) {}
          logger.info('[MobileAmazonCartPage] Clicking delete via XPath');
          await el.click();
          await this.driver.pause(3000);
          if (await this._confirmItemRemoved()) {
            logger.info('[MobileAmazonCartPage] Item removed via XPath.');
            return;
          }
        }
      } catch (err: any) {
        allErrors.push('XPath: ' + err.message.substring(0, 80));
      }
    }

    // ── Phase 3: JS execution ───────────────────────────────────────
    logger.info('[MobileAmazonCartPage] Trying JS execution fallback...');
    const jsClicked = await this._tryJsDelete(allErrors);
    if (jsClicked) return;

    // ── All failed: diagnostics ─────────────────────────────────────
    await this._captureCartDiagnostics('removeItemFromCart', deleteSelectors, allErrors);

    throw new Error(
      `[MobileAmazonCartPage] Could not find delete button.\n` +
      `Platform: ${this._platform}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  /**
   * Get platform-specific + shared delete selectors.
   */
  _getPlatformDeleteSelectors() {
    const platformMap = this._selectorMap[this._platform];
    const shared = this._selectorMap.shared;
    const result: any[] = [];

    // Platform-specific first
    if (platformMap && platformMap.deleteButton) {
      for (const s of platformMap.deleteButton) {
        result.push(this._convertAccessibilityId(s));
      }
    }

    // Shared fallbacks
    if (shared && shared.deleteButton) {
      for (const s of shared.deleteButton) {
        const converted = this._convertAccessibilityId(s);
        if (!result.includes(converted)) result.push(converted);
      }
    }

    return result;
  }

  /**
   * JS execution to find and click a "Delete" link by text.
   */
  async _tryJsDelete(allErrors: any) {
    try {
      const result = await this.driver.execute(function() {
        var candidates = document.querySelectorAll('a, button, span, input');
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          var text = (el.textContent || '').trim();
          var value = (el.getAttribute('value') || '').trim();
          var aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          var dataTestid = (el.getAttribute('data-testid') || '').toLowerCase();

          if (
            text === 'Delete' || text === 'delete' ||
            value === 'Delete' ||
            aria.indexOf('delete') !== -1 ||
            dataTestid.indexOf('delete') !== -1
          ) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              try { (el as HTMLElement).click(); return { success: true, method: 'native' }; }
              catch (e: any) {
                try {
                  var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  el.dispatchEvent(evt);
                  return { success: true, method: 'dispatched' };
                } catch (e2: any) { return { success: false, error: e2.message }; }
              }
            }
          }
        }
        return { success: false, reason: 'noElementFound' };
      });

      if (result && result.success) {
        logger.info('[MobileAmazonCartPage] JS delete succeeded: ' + result.method);
        await this.driver.pause(3000);
        if (await this._confirmItemRemoved()) return true;
      }
    } catch (err: any) {
      allErrors.push('JS: ' + err.message.substring(0, 80));
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Proceed to Checkout
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Proceed to checkout from the cart page.
   *
   * Strategy:
   *   1. Verify cart page is loaded
   *   2. Platform-specific CSS selectors
   *   3. Shared/generic CSS selectors
   *   4. XPath expressions
   *   5. JS execution (find by text "Proceed to Buy" / "Proceed to Checkout")
   *   6. URL navigation to /gp/buy/select-address
   */
  async proceedToCheckout() {
    logger.info(`[MobileAmazonCartPage] proceedToCheckout (platform: ${this._platform})`);

    const allErrors: any[] = [];

    // ── Step 0: Verify cart is loaded ────────────────────────────────
    await this._waitForCartReady();

    // ── Step 1: CSS selectors ───────────────────────────────────────
    const checkoutSelectors = this._getPlatformCheckoutSelectors();
    logger.info(`[MobileAmazonCartPage] Trying ${checkoutSelectors.length} checkout selectors...`);

    for (const selector of checkoutSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (!displayed) {
            try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_: any) {}
            if (!(await el.isDisplayed().catch(() => false))) continue;
          }

          logger.info(`[MobileAmazonCartPage] Clicking checkout: "${selector}"`);
          try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_: any) {}
          await el.click();
          await this.driver.pause(5000);

          if (await this._confirmCheckoutReached()) {
            logger.info('[MobileAmazonCartPage] Checkout reached.');
            return;
          }
        }
      } catch (err: any) {
        allErrors.push('CSS: ' + err.message.substring(0, 80));
      }
    }

    // ── Step 2: XPath ───────────────────────────────────────────────
    logger.info('[MobileAmazonCartPage] Trying checkout XPath selectors...');
    for (const xpath of CHECKOUT_XPATHS) {
      try {
        const elements = await this.driver.$$(xpath);
        for (const el of elements) {
          if (!(await el.isDisplayed().catch(() => false))) continue;
          try { await el.scrollIntoView(); await this.driver.pause(300); } catch (_: any) {}
          await el.click();
          await this.driver.pause(5000);
          if (await this._confirmCheckoutReached()) {
            logger.info('[MobileAmazonCartPage] Checkout reached via XPath.');
            return;
          }
        }
      } catch (err: any) {
        allErrors.push('XPath: ' + err.message.substring(0, 80));
      }
    }

    // ── Step 3: JS execution ────────────────────────────────────────
    logger.info('[MobileAmazonCartPage] Trying checkout JS execution...');
    const jsClicked = await this._tryJsCheckout(allErrors);
    if (jsClicked) return;

    // ── Step 4: URL navigation fallback ──────────────────────────────
    logger.info('[MobileAmazonCartPage] Trying URL navigation fallback...');
    for (const url of CHECKOUT_URLS) {
      try {
        logger.info('[MobileAmazonCartPage] Navigating to: ' + url);
        await this.driver.url(url);
        await this.driver.pause(5000);
        if (await this._confirmCheckoutReached()) {
          logger.info('[MobileAmazonCartPage] Checkout reached via URL.');
          return;
        }
      } catch (err: any) {
        allErrors.push('URL: ' + err.message.substring(0, 80));
      }
    }

    // ── All failed: diagnostics ─────────────────────────────────────
    await this._captureCartDiagnostics('proceedToCheckout', checkoutSelectors, allErrors);

    throw new Error(
      `[MobileAmazonCartPage] Could not proceed to checkout.\n` +
      `Platform: ${this._platform}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  /**
   * Get platform-specific + shared checkout selectors.
   */
  _getPlatformCheckoutSelectors() {
    const platformMap = this._selectorMap[this._platform];
    const shared = this._selectorMap.shared;
    const result: any[] = [];

    if (platformMap && platformMap.checkoutButton) {
      for (const s of platformMap.checkoutButton) {
        result.push(this._convertAccessibilityId(s));
      }
    }
    if (shared && shared.checkoutButton) {
      for (const s of shared.checkoutButton) {
        const converted = this._convertAccessibilityId(s);
        if (!result.includes(converted)) result.push(converted);
      }
    }

    return result;
  }

  /**
   * JS execution to find checkout buttons by text.
   */
  async _tryJsCheckout(allErrors: any) {
    try {
      const result = await this.driver.execute(function() {
        var selectors = [
          '[data-csa-c-slot-id*="checkout"]',
          '[data-csa-c-slot-id*="proceed"]',
          '[data-testid*="proceed"]',
          'a[href*="/checkout"]',
          'a[href*="gp/buy"]',
          'input[name*="proceed"]',
          'input[name*="checkout"]',
          'input[value*="Proceed"]',
          'input[value*="Checkout"]',
        ];

        for (var s = 0; s < selectors.length; s++) {
          var els = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              try { (el as HTMLElement).click(); return { success: true, method: 'native', selector: selectors[s] }; }
              catch (e: any) {
                try {
                  var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  el.dispatchEvent(evt);
                  return { success: true, method: 'dispatched', selector: selectors[s] };
                } catch (e2: any) { return { success: false, error: e2.message }; }
              }
            }
          }
        }

        // Fallback: search by text
        var allElements = document.querySelectorAll('a, button, input[type="submit"], span[data-action]');
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          var text = ((el as any).textContent || (el as any).value || '').trim().toLowerCase();
          var aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          if (text.indexOf('proceed') !== -1 || text.indexOf('checkout') !== -1 ||
              aria.indexOf('proceed') !== -1 || aria.indexOf('checkout') !== -1) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              try { (el as HTMLElement).click(); return { success: true, method: 'textMatch' }; }
              catch (e: any) {
                try {
                  var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                  el.dispatchEvent(evt);
                  return { success: true, method: 'textMatch-dispatched' };
                } catch (e2: any) {}
              }
            }
          }
        }
        return { success: false, reason: 'noElementFound' };
      });

      if (result && result.success) {
        logger.info('[MobileAmazonCartPage] JS checkout click: ' + result.method + ' via ' + (result.selector || 'text'));
        await this.driver.pause(5000);
        if (await this._confirmCheckoutReached()) return true;
      }
    } catch (err: any) {
      allErrors.push('JS: ' + err.message.substring(0, 80));
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Confirmation Helpers
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Wait for the cart page to be fully loaded.
   */
  async _waitForCartReady() {
    try {
      await this.driver.waitUntil(async () => {
        const src = await this.driver.getPageSource();
        return /shopping cart|smart.wagon|cart total|subtotal|proceed|checkout|your items/i.test(src)
          && !/loading|spinner|please wait/i.test(src);
      }, { timeout: 15000, interval: 1000 });
      logger.info('[MobileAmazonCartPage] Cart page ready.');
    } catch (_: any) {
      logger.warn('[MobileAmazonCartPage] Cart page wait timed out.');
    }
  }

  /**
   * Confirm that an item was removed from the cart.
   */
  async _confirmItemRemoved() {
    try {
      const source = await this.driver.getPageSource();
      const platformMap = this._selectorMap[this._platform];
      const pattern = platformMap && platformMap.emptyCartVerification
        ? platformMap.emptyCartVerification
        : /cart is empty|0 items|no items/i;

      if (pattern.test(source)) return true;
      return false;
    } catch (_: any) {
      return false;
    }
  }

  /**
   * Confirm that the checkout page was reached.
   */
  async _confirmCheckoutReached() {
    try {
      const url = await this.driver.getUrl().catch(() => '');
      if (/checkout|buy|select-address|spc/i.test(url)) {
        logger.info('[MobileAmazonCartPage] Checkout confirmed via URL: ' + url);
        return true;
      }
      const source = await this.driver.getPageSource().catch(() => '');
      if (/select-delivery-address|payment-method|place your order|card number|credit card|debit card|ship to this address/i.test(source)) {
        logger.info('[MobileAmazonCartPage] Checkout confirmed via page source.');
        return true;
      }
      return false;
    } catch (_: any) {
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Diagnostics
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Capture comprehensive diagnostics when a cart action fails.
   */
  async _captureCartDiagnostics(action: any, selectors: any, allErrors: any) {
    try {
      const timestamp = Date.now();
      const baseDir = this.debugSourceDir || 'reports/mobile/debug';
      fs.ensureDirSync(baseDir);

      const url = await this.driver.getUrl().catch(() => 'unknown');
      const title = await this.driver.getTitle().catch(() => 'unknown');

      // Screenshot
      await this.driver.saveScreenshot(baseDir + '/' + action + '-' + timestamp + '.png').catch(() => {});

      // Page source
      const source = await this.driver.getPageSource().catch(() => '');
      fs.writeFileSync(baseDir + '/' + action + '-' + timestamp + '.html', source, 'utf8');

      // Interactive elements
      const elements = await this.driver.execute(function() {
        var results: any[] = [];
        var sel = 'a[href], button, input, span[data-action], [data-testid], [data-csa-c-slot-id], [role="button"]';
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var rect = el.getBoundingClientRect();
          results.push({
            tag: el.tagName, id: el.id,
            text: (el.textContent || '').trim().substring(0, 60),
            href: el.getAttribute('href') || '',
            name: el.getAttribute('name') || '',
            value: el.getAttribute('value') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            dataTestid: el.getAttribute('data-testid') || '',
            dataAction: el.getAttribute('data-action') || '',
            dataCsa: el.getAttribute('data-csa-c-slot-id') || '',
            visible: rect.width > 0 && rect.height > 0,
          });
        }
        return results;
      }).catch(() => []);

      var diagData = {
        timestamp: new Date(timestamp).toISOString(),
        action: action,
        platform: this._platform,
        url: url,
        pageTitle: title,
        selectorsAttempted: selectors,
        errors: allErrors,
        interactiveElements: elements || [],
      };
      fs.writeFileSync(baseDir + '/' + action + '-diagnostics-' + timestamp + '.json', JSON.stringify(diagData, null, 2), 'utf8');

      logger.info('[MobileAmazonCartPage] Diagnostics: ' + baseDir + '/' + action + '-diagnostics-' + timestamp + '.json');
      if (elements && elements.length > 0) {
        var visible = elements.filter(function(e: any) { return e.visible; });
        logger.info('[MobileAmazonCartPage] Visible interactive elements: ' + visible.length);
        for (var i = 0; i < Math.min(visible.length, 30); i++) {
          var e = visible[i];
          logger.info('  <' + e.tag + '> id="' + e.id + '" text="' + e.text + '" href="' + e.href + '" name="' + e.name + '" value="' + e.value + '" data-testid="' + e.dataTestid + '" data-csa="' + e.dataCsa + '"');
        }
      }
    } catch (err: any) {
      logger.warn('[MobileAmazonCartPage] Diagnostic capture failed: ' + err.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Legacy / Compatibility Methods
  // ═════════════════════════════════════════════════════════════════════

  async continueShoppingIfPrompted() {
    try {
      const selectors = this._getPlatformDeleteSelectors();
      for (const sel of selectors) {
        const el = await this.driver.$(sel);
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          await this.driver.pause(2000);
          return;
        }
      }
    } catch (_: any) {}
  }

  async getCartItems() {
    try {
      return await this.driver.$$('[data-component-type="cart-item"], [data-asin], .sc-list-item, [data-cart-item]');
    } catch (e: any) {
      return [];
    }
  }

  async verifyVisible(locator: any) {
    const element = typeof locator === 'string'
      ? this.driver.$(this._convertAccessibilityId(locator))
      : locator;
    if (!(await element.isDisplayed())) {
      throw new Error('Element not visible: ' + locator);
    }
  }
}

export default MobileAmazonCartPage;
