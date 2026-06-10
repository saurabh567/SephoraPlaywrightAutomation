// Shared Cucumber steps used across Amazon India feature files.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const ConfigReader = require('../utils/configReader');
const products = require('../test-data/products.json');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const AmazonCartPage = require('../pages/AmazonCartPage');

async function skipIfBotOrCaptchaPage(pageObject) {
  if (await pageObject.isSecurityVerificationPage()) {
    return 'skipped';
  }
  return undefined;
}

Given('I launch the Amazon application', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openHomePage();
  return skipIfBotOrCaptchaPage(homePage);
});

Given('I am on the Amazon home page', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openHomePage();
  return skipIfBotOrCaptchaPage(homePage);
});

Given('I search for product from test data on Amazon', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openHomePage();
  const skipResult = await skipIfBotOrCaptchaPage(homePage);
  if (skipResult) return skipResult;
  await homePage.searchProduct(products.searchTerm);
});

Given('I open the first Amazon product from search results', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openHomePage();
  const skipResult = await skipIfBotOrCaptchaPage(homePage);
  if (skipResult) return skipResult;

  await homePage.searchProduct(products.searchTerm);
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const productPage = await searchResultsPage.openFirstProduct();
  this.page = productPage;
});

Given('I am on the Amazon cart page', async function () {
  const cartPage = new AmazonCartPage(this.page);
  await cartPage.openCartPage();
  return skipIfBotOrCaptchaPage(cartPage);
});

When('I search for product from test data', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.searchProduct(products.searchTerm);
});

When('I open the first product from Amazon search results', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const productPage = await searchResultsPage.openFirstProduct();
  this.page = productPage;
});

When('I add the Amazon product to cart if possible', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  this.addedToCart = await productDetailsPage.addToCartIfAvailable();
});

When('I open the Amazon cart from header', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openCart();
});

Then('the page URL should contain {string}', async function (urlPart) {
  await expect(this.page).toHaveURL(new RegExp(urlPart), { timeout: ConfigReader.get('timeout') });
});

Then('the page title should contain {string}', async function (titlePart) {
  await expect(this.page).toHaveTitle(new RegExp(titlePart, 'i'), { timeout: ConfigReader.get('timeout') });
});

Then('I should see text {string}', async function (text) {
  await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({
    timeout: ConfigReader.get('timeout')
  });
});

Then('the current environment base URL should be loaded', async function () {
  await expect(this.page).toHaveURL(new RegExp(ConfigReader.getBaseUrl().replace('https://', '')), {
    timeout: ConfigReader.get('timeout')
  });
});
