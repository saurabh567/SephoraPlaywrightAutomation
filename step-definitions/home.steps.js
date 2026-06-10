// Amazon home page-specific Cucumber steps.
const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');

Then('the Amazon home page should be loaded', async function () {
  await expect(this.page).toHaveURL(/amazon\.in/i);
  await expect(this.page.locator('body')).toBeVisible();
});

Then('the Amazon logo should be visible', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.logo);
});

Then('the Amazon search box should be visible', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.searchBox);
});

Then('the Amazon cart link should be visible', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.cartLink);
});

Then('the Amazon search results page should be visible', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await searchResultsPage.verifySearchResultsVisible();
});

When('I collect all footer links', async function () {
  const homePage = new AmazonHomePage(this.page);
  this.footerLinks = await homePage.getFooterLinks();
});

Then('each footer link should have a valid URL', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyFooterLinksHaveValidUrls(this.footerLinks);
});
