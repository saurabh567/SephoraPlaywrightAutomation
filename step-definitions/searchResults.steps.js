// Amazon search results page-specific Cucumber steps.
const { Then } = require('@cucumber/cucumber');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const getAmazonMobilePage = require('../mobile/AmazonMobilePageFactory');

Then('Amazon product results should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifySearchResultsVisible();
    return;
  }

  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await searchResultsPage.verifySearchResultsVisible();
});

Then('the Amazon search sort dropdown should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifySearchResultsVisible();
    return;
  }

  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await searchResultsPage.verifyVisible(searchResultsPage.sortDropdown);
});
