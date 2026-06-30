// Amazon India search results page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonSearchResultsPage = require('./MobileAmazonSearchResultsPage');

class AmazonSearchResultsPage {
  constructor(page) {
    // Detect mobile driver
    if (page && typeof page.locator !== 'function') {
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
