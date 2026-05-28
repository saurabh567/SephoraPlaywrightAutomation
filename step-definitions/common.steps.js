const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const ConfigReader = require('../utils/configReader');
const products = require('../test-data/products.json');

Given('I launch the Sephora application', async function () {
  await this.pages.homePage.openHomePage();
});

Given('I am on the Sephora home page', async function () {
  await this.pages.homePage.openHomePage();
});

Given('I am on the Makeup Face listing page', async function () {
  await this.pages.makeupFacePage.openMakeupFacePage();
});

Given('I am on the Rare Beauty product details page', async function () {
  await this.pages.productDetailsPage.openProductPage();
});

Given('I am on the shopping bag page', async function () {
  await this.pages.cartPage.openCartPage();
});

When('I search for product from test data', async function () {
  await this.pages.homePage.searchProduct(products.searchTerm);
});

When('I enter pincode from test data', async function () {
  await this.pages.productDetailsPage.checkDelivery(products.pincode);
});

When('I click Add To Bag button', async function () {
  await this.pages.productDetailsPage.addToBag();
});

When('I open the bag from header', async function () {
  await this.pages.homePage.openBag();
});

Then('the page URL should contain {string}', async function (urlPart) {
  await expect(this.page).toHaveURL(new RegExp(urlPart));
});

Then('the page title should contain {string}', async function (titlePart) {
  await expect(this.page).toHaveTitle(new RegExp(titlePart, 'i'));
});

Then('I should see text {string}', async function (text) {
  await this.pages.homePage.verifyTextVisible(text);
});

Then('the current environment base URL should be loaded', async function () {
  await expect(this.page).toHaveURL(new RegExp(ConfigReader.getBaseUrl().replace('https://', '')));
});
