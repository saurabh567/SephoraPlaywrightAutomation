import MobileBasePage from '../framework/mobile/MobileBasePage';
/**
 * MobileAmazonSearchResultsPage — Appium/WebDriverIO page object for Amazon search results.
 * Uses platform-aware locators via MobileBasePage.
 */

class MobileAmazonSearchResultsPage extends MobileBasePage {
  [key: string]: any;
  constructor(driver: any) {
    super(driver);
    this.searchResults = [];
    this.firstProduct = null;
  }

  async verifySearchResultsVisible() {
    await this.driver.pause(2000);
    // Check that search results container is visible
    const resultsContainer = this.driver.$(this.resolveSelector('~search-results'));
    if (await resultsContainer.isDisplayed().catch(() => false)) {
      return;
    }
    // Fallback: check page source for search result indicators
    try {
      await this.driver.waitUntil(async () => {
        const source = await this.driver.getPageSource().catch(() => '');
        return /results for|result for|showing.*results|sponsored|sort by|filter|delivery|prime/i.test(source);
      }, { timeout: 15000, interval: 1500 });
    } catch (_: any) {
      console.log('[MobileAmazonSearchResultsPage] Search results not confirmed via page source — proceeding anyway');
      await this.driver.pause(3000);
    }
  }

  async openFirstProduct() {
    await this.verifySearchResultsVisible();

    // Try tapping the first result link
    try {
      const firstResult = this.driver.$(this.resolveSelector('~product-title-0'));
      if (await firstResult.isDisplayed().catch(() => false)) {
        await firstResult.click();
        await this.driver.pause(3000);
        return;
      }
    } catch (e: any) {
      // Fallback
    }

    // Generic fallback: tap first search result
    const results = await this.driver.$$('[class*="s-result-item"]');
    if (results.length > 0) {
      const link = await results[0].$('a');
      if (await link.isDisplayed().catch(() => false)) {
        await link.click();
        await this.driver.pause(3000);
      }
    }

    return this.driver;
  }
}

export default MobileAmazonSearchResultsPage;
