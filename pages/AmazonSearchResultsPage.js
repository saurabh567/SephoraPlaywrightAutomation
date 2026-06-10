// Amazon India search results page locators and actions.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class AmazonSearchResultsPage extends BasePage {
  constructor(page) {
    super(page);
    this.resultsText = page.getByText(/results for|result for|results/i).first();
    this.searchResults = page.locator('[data-component-type="s-search-result"]');
    this.firstProduct = this.searchResults
      .locator('h2 a, a.a-link-normal.s-no-outline')
      .filter({ hasText: /./ })
      .first();
    this.sortDropdown = page.locator('#s-result-sort-select').first();
  }

  async verifySearchResultsVisible() {
    await expect(this.searchResults.first()).toBeVisible({ timeout: 60000 });
  }

  async openFirstProduct() {
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
