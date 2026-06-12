// Amazon India search results page locators and actions.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class AmazonSearchResultsPage extends BasePage {
  constructor(page) {
    super(page);
    this.resultsText = page.getByText(/results for|result for|results/i).first();
    this.searchResults = page.locator('[data-component-type="s-search-result"]');
    // Use a more specific and stable locator: choose search-result entries that contain an
    // anchor with class containing "a-link-normal", then target the anchor for clicks.
    this.firstProduct = this.page
      .locator('[data-component-type="s-search-result"] > :has([class*="a-link-normal"])')
      .locator('a[class*="a-link-normal"], h2 a')
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
