// Shared Cucumber steps used across multiple Amazon India feature files.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonHomePage = require('../pages/AmazonHomePage');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const AmazonCartPage = require('../pages/AmazonCartPage');
const LoginPage = require('../pages/LoginPage');
const testData = require('../test-data/testData.json');

// ---------------------------------------------------------------------------
// Background / Navigation steps
// ---------------------------------------------------------------------------

Given('I am on the Amazon home page', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.openHomePage();
});

// ---------------------------------------------------------------------------
// Search steps
// ---------------------------------------------------------------------------

When('I search for {string} in the search box', async function (searchTerm) {
  // Use the value from the feature file or fall back to testData
  const term = searchTerm || testData.searchTerm;
  const homePage = new AmazonHomePage(this.page);
  await homePage.searchProduct(term);
});

Then('the search results page should show at least one result', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  await searchResultsPage.verifySearchResultsVisible();
  const resultCount = await searchResultsPage.searchResults.count();
  expect(resultCount).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Product details steps
// ---------------------------------------------------------------------------

When('I open the first product from search results', async function () {
  const searchResultsPage = new AmazonSearchResultsPage(this.page);
  const productPage = await searchResultsPage.openFirstProduct();
  if (productPage !== this.page) {
    this.page = productPage;
  }
});

Then('the product details page should be visible', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  await productDetailsPage.verifyProductDetailsVisible();
});

When('I add the product to the cart', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  this.addedToCart = await productDetailsPage.addToCartIfAvailable();
  if (!this.addedToCart) {
    throw new Error('Add to Cart button was not available on the product details page.');
  }
});

Then('the product should be added to the cart successfully', async function () {
  if (!this.addedToCart) {
    throw new Error('Product was not added to cart in the previous step.');
  }
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  const confirmationVisible = await productDetailsPage.cartConfirmation
    .isVisible({ timeout: 15000 })
    .catch(() => false);
  expect(confirmationVisible).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Cart steps
// ---------------------------------------------------------------------------

When('I navigate to the cart page', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  await productDetailsPage.openCartFromHeader();
  await expect(this.page).toHaveURL(/cart|gp\/cart/i, { timeout: 60000 });
});

// ---------------------------------------------------------------------------
// Login steps
// ---------------------------------------------------------------------------

When('I log in with valid credentials', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.click(homePage.accountLink);

  const loginPage = new LoginPage(this.page);
  await loginPage.fill(loginPage.emailInput, testData.validUser.email);
  await loginPage.click(loginPage.continueButton);
  await this.page.waitForLoadState('domcontentloaded');

  await loginPage.fill(loginPage.passwordInput, testData.validUser.password);
  await loginPage.click(loginPage.loginButton);
  await this.page.waitForLoadState('networkidle').catch(() => undefined);
});

Then('I should be logged in successfully', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.accountLink);
  const currentUrl = this.page.url();
  expect(currentUrl).not.toMatch(/signin|ap\/signin|login/i);
});

// ---------------------------------------------------------------------------
// Generic / fallback steps
// ---------------------------------------------------------------------------

Then('the page URL should contain {string}', async function (urlPart) {
  await expect(this.page).toHaveURL(new RegExp(urlPart), { timeout: 60000 });
});

Then('the page title should contain {string}', async function (titlePart) {
  await expect(this.page).toHaveTitle(new RegExp(titlePart, 'i'), { timeout: 60000 });
});

Then('I should see text {string}', async function (text) {
  await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({
    timeout: 60000
  });
});
