// Amazon home page-specific Cucumber steps.
const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const getAmazonMobilePage = require('../mobile/AmazonMobilePageFactory');

Then('the Amazon home page should be loaded', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyHomeLoaded();
    return;
  }

  await expect(this.page).toHaveURL(/amazon\.in/i);
  await expect(this.page.locator('body')).toBeVisible();
});

Then('the Amazon logo should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyLogoVisible();
    return;
  }

  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.logo);
});

Then('the Amazon search box should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifySearchBoxVisible();
    return;
  }

  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.searchBox);
});

Then('the Amazon cart link should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyCartLinkVisible();
    return;
  }

  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.cartLink);
});

Then('the Amazon search results page should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifySearchResultsVisible();
    return;
  }

  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await searchResultsPage.verifySearchResultsVisible();
});

When('I collect all footer links', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    this.footerLinks = await mobilePage.getFooterLinks();
    return;
  }

  const homePage = new AmazonHomePage(this.page);
  this.footerLinks = await homePage.getFooterLinks();
});

Then('each footer link should have a valid URL', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyFooterLinksHaveValidUrls(this.footerLinks);
    return;
  }

  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyFooterLinksHaveValidUrls(this.footerLinks);
});
