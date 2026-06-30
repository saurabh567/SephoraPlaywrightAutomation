// Step definitions unique to the Amazon India Cart Page features.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const AmazonCartPage = require('../pages/AmazonCartPage');
const testData = require('../test-data/testData.json');

Given('a product is added to the cart', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.searchProduct(testData.searchTerm);

  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const productPage = await searchResultsPage.openFirstProduct();
  if (productPage !== this.page) {
    this.page = productPage;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  this.addedToCart = await productDetailsPage.addToCartIfAvailable();
  if (!this.addedToCart) {
    throw new Error('Could not add product to cart for the background step.');
  }
});

When('I remove the product from the cart', async function () {
  const cartPage = new AmazonCartPage(this.page);
  const deleteButton = this.page.locator(
    'input[value="Delete"], span[data-action="delete"] a, .sc-action-delete input'
  ).first();
  await deleteButton.waitFor({ state: 'visible', timeout: 10000 });
  await deleteButton.click();
  await this.page.waitForTimeout(3000);
});

Then('the cart should show the empty cart message', async function () {
  const cartPage = new AmazonCartPage(this.page);
  await cartPage.verifyVisible(cartPage.emptyCartMessage);
});
