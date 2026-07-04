// Amazon India search results page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
// For iOS Safari, delegates to AmazonIOSSafariPage which uses WebView CSS selectors.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonSearchResultsPage = require('./MobileAmazonSearchResultsPage');
const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
const config = require('../config/env.config');
const logger = require("../utils/logger");
const { TEST_PLATFORMS } = require('../framework/common/platforms');

class AmazonSearchResultsPage {
  constructor(page) {
    // Detect mobile driver (WebDriverIO) vs Playwright page
    if (page && typeof page.locator !== 'function') {
      // ── iOS Safari: delegate to AmazonIOSSafariPage ──
      const isIOS = config.testPlatform === TEST_PLATFORMS.IOS;
      const isSafari = String(config.mobile.browserName || '').toLowerCase() === 'safari';

      if (isIOS && isSafari) {
        this._iosSafari = new AmazonIOSSafariPage(page);
        this.page = page;

        // Map methods to match MobileAmazonSearchResultsPage interface
        this.verifySearchResultsVisible = () =>
          this._iosSafari.waitForSearchResultsRendered(30000);

        this.openFirstProduct = async () => {
          await this._iosSafari.openFirstProductFromResults();
          return page; // return driver for consistency
        };

        return;
      }

      // ── Android / iOS App: use MobileAmazonSearchResultsPage ──
      this._mobile = new MobileAmazonSearchResultsPage(page);
      this.page = page;
      return;
    }

    // Playwright mode
    this.__base = new BasePage(page);
    const bp = Object.getOwnPropertyNames(BasePage.prototype);
    for (const key of bp) {
      if (key !== 'constructor' && typeof this.__base[key] === 'function') {
        this[key] = this.__base[key].bind(this.__base);
      }
    }

    this.page = page;
    this.resultsText = page.getByText(/results for|result for|results/i).first();
    this.searchResults = page.locator('[data-component-type="s-search-result"]');
    this.sortDropdown = page.locator('#s-result-sort-select').first();
  }

  async verifySearchResultsVisible() {
    if (this._mobile) return this._mobile.verifySearchResultsVisible();
    await expect(this.searchResults.first()).toBeVisible({ timeout: 60000 });
  }

  /**
   * Open the first product from search results using a native DOM click
   * to avoid interference from Amazon's JavaScript event handlers.
   * Falls back to direct page navigation if the click does not navigate.
   */
  async openFirstProduct() {
    if (this._mobile) return this._mobile.openFirstProduct();
    await this.verifySearchResultsVisible();

    // Wait for search results to fully render
    await this.page.waitForTimeout(1500);

    // Try native DOM click on the title link (wraps h2 with product name)
    let navigated = await this.page.evaluate(() => {
      const firstResult = document.querySelector('[data-component-type="s-search-result"]');
      if (!firstResult) return { ok: false, reason: 'no result element' };

      // Prefer the title link that wraps the h2 (s-line-clamp-2)
      let titleLink = firstResult.querySelector('a.s-line-clamp-2');
      if (!titleLink) {
        // Fallback: any link with /dp/ in href that has visible text
        titleLink = firstResult.querySelector('a[href*="/dp/"]:not([tabindex="-1"])');
      }
      if (!titleLink) {
        // Last resort: any link inside the result
        titleLink = firstResult.querySelector('a[href*="/dp/"]');
      }

      if (!titleLink) return { ok: false, reason: 'no title link found' };

      const href = titleLink.getAttribute('href');
      const target = titleLink.getAttribute('target');

      // Dispatch native click
      titleLink.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
      }));

      return { ok: true, href: href, target: target };
    });

    // Wait for any navigation to complete
    await this.page.waitForTimeout(3000);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});

    // Check if we navigated to a product page
    const currentUrl = this.page.url();
    const onProductPage = currentUrl.includes('/dp/') || currentUrl.includes('/gp/product/');

    if (!onProductPage && navigated && navigated.href) {
      // DOM click didn't trigger navigation — navigate directly via goto
      const fullUrl = new URL(navigated.href, 'https://www.amazon.in').href;
      logger.info(`[AmazonSearchResultsPage] Direct navigation to: ${fullUrl}`);
      await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);
    } else if (!onProductPage && !navigated) {
      // Last resort: try Playwright locator click on any dp link
      logger.warn('[AmazonSearchResultsPage] Falling back to Playwright click');
      try {
        const dpLink = this.page.locator('[data-component-type="s-search-result"] a[href*="/dp/"]').first();
        await dpLink.click({ timeout: 10000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2000);
      } catch (e) {
        logger.error(`[AmazonSearchResultsPage] Click failed: ${e.message}`);
        throw new Error('Could not open first product from search results');
      }
    }

    return this.page;
  }
}

module.exports = AmazonSearchResultsPage;
