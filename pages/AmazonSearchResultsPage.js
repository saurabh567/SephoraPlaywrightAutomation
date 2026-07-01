// Amazon India search results page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
// For iOS Safari, delegates to AmazonIOSSafariPage which uses WebView CSS selectors.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonSearchResultsPage = require('./MobileAmazonSearchResultsPage');
const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
const config = require('../config/env.config');
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
    this.firstProduct = this.page
      .locator('[data-component-type="s-search-result"] > :has([class*="a-link-normal"])')
      .locator('a[class*="a-link-normal"], h2 a')
      .first();
    this.sortDropdown = page.locator('#s-result-sort-select').first();
  }

  async verifySearchResultsVisible() {
    if (this._mobile) return this._mobile.verifySearchResultsVisible();
    await expect(this.searchResults.first()).toBeVisible({ timeout: 60000 });
  }

  async openFirstProduct() {
    if (this._mobile) return this._mobile.openFirstProduct();
    await this.verifySearchResultsVisible();
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page').catch(() => null),
      this.firstProduct.click()
    ]);

    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded');
      return newPage;
    }

    await this.page.waitForLoadState('domcontentloaded');
    return this.page;
  }
}

module.exports = AmazonSearchResultsPage;
