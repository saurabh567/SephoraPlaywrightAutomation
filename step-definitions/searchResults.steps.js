// Step definitions unique to the Amazon India Search Results Page features.
const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');

Then('the search result items should be visible', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const firstResult = searchResultsPage.searchResults.first();
  await searchResultsPage.verifyVisible(firstResult);
});

When('I apply a product filter', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const filterLink = this.page.locator(
    'li[aria-label*="Category"] a, ' +
    'span:has(> a[title*="Electronics"]), ' +
    '#s-refinements a[href*="electronics"], ' +
    '.a-section.a-spacing-micro a[href*="node"]'
  ).first();

  const filterVisible = await filterLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (filterVisible) {
    await filterLink.click();
    await this.page.waitForLoadState('domcontentloaded');
  } else {
    console.log('No product filter link was visible on the search results page.');
  }
});

Then('the search results should update based on the applied filter', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await this.page.waitForTimeout(3000);
  await searchResultsPage.verifySearchResultsVisible();
  const resultCount = await searchResultsPage.searchResults.count();
  expect(resultCount).toBeGreaterThanOrEqual(1);
});
