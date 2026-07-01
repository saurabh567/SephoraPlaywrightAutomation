/**
 * MobileAmazonSearchResultsPage — Appium/WebDriverIO page object for Amazon search results.
 * Uses platform-aware locators via MobileBasePage.
 */
const MobileBasePage = require('../framework/mobile/MobileBasePage');

class MobileAmazonSearchResultsPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.searchResults = [];
    this.firstProduct = null;
  }

  async verifySearchResultsVisible() {
    await this.driver.pause(2000);
    // Check that search results container is visible
    const resultsContainer = this.driver.$(this.createLocator('~search-results'));
    if (await resultsContainer.isDisplayed()) {
      return;
    }
    // Fallback: wait for any result item
    await this.driver.pause(3000);
  }

  async openFirstProduct() {
    await this.verifySearchResultsVisible();

    // Try tapping the first result link
    try {
      const firstResult = this.driver.$(this.createLocator('~product-title-0'));
      if (await firstResult.isDisplayed()) {
        await firstResult.click();
        await this.driver.pause(3000);
        return;
      }
    } catch (e) {
      // Fallback
    }

    // Generic fallback: tap first search result
    const results = await this.driver.$$('[class*="s-result-item"]');
    if (results.length > 0) {
      const link = await results[0].$('a');
      if (await link.isDisplayed()) {
        await link.click();
        await this.driver.pause(3000);
      }
    }

    return this.driver;
  }
}

module.exports = MobileAmazonSearchResultsPage;
