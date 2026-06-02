// Shared Cucumber steps used across multiple feature files.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const ConfigReader = require('../utils/configReader');
const products = require('../test-data/products.json');
const HomePage = require('../pages/HomePage');
const MakeupFacePage = require('../pages/MakeupFacePage');
const ProductDetailsPage = require('../pages/ProductDetailsPage');
const CartPage = require('../pages/CartPage');

Given('I launch the Sephora application', async function () {
  const homePage = new HomePage(this.page);
  await homePage.openHomePage();
});

Given('I am on the Sephora home page', async function () {
  const homePage = new HomePage(this.page);
  await homePage.openHomePage();
});

Given('I am on the Makeup Face listing page', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.openMakeupFacePage();
});

Given('I am on the Rare Beauty product details page', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.openProductPage();
});

Given('I am on the shopping bag page', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.openCartPage();
});

When('I search for product from test data', async function () {
  const homePage = new HomePage(this.page);
  await homePage.searchProduct(products.searchTerm);
});

When('I enter pincode from test data', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.checkDelivery(products.pincode);
});

When('I click Add To Bag button', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.addToBag();
});

When('I open the bag from header', async function () {
  const homePage = new HomePage(this.page);
  await homePage.openBag();
});

Then('the page URL should contain {string}', async function (urlPart) {
  await expect(this.page).toHaveURL(new RegExp(urlPart), { timeout: ConfigReader.get('timeout') });
});

Then('the page title should contain {string}', async function (titlePart) {
  await expect(this.page).toHaveTitle(new RegExp(titlePart, 'i'), { timeout: ConfigReader.get('timeout') });
});

Then('I should see text {string}', async function (text) {
  const homePage = new HomePage(this.page);
  await homePage.verifyTextVisible(text);
});

Then('the current environment base URL should be loaded', async function () {
  await expect(this.page).toHaveURL(new RegExp(ConfigReader.getBaseUrl().replace('https://', '')), {
    timeout: ConfigReader.get('timeout')
  });
});
