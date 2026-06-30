// Step definitions unique to the Amazon India Login Page features.
const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const AmazonHomePage = require('../pages/AmazonHomePage');
const testData = require('../test-data/testData.json');

When('I click on the Sign In link', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.click(homePage.accountLink);
});

When('I enter a valid email address', async function () {
  const loginPage = new LoginPage(this.page);
  await loginPage.fill(loginPage.emailInput, testData.validUser.email);
});

When('I click on the Continue button', async function () {
  const loginPage = new LoginPage(this.page);
  await loginPage.click(loginPage.continueButton);
  await this.page.waitForLoadState('domcontentloaded');
});

When('I enter a valid password', async function () {
  const loginPage = new LoginPage(this.page);
  await loginPage.fill(loginPage.passwordInput, testData.validUser.password);
});

When('I click on the Sign In submit button', async function () {
  const loginPage = new LoginPage(this.page);
  await loginPage.click(loginPage.loginButton);
  await this.page.waitForLoadState('networkidle').catch(() => undefined);
});

When('I enter an invalid email address', async function () {
  const loginPage = new LoginPage(this.page);
  await loginPage.fill(loginPage.emailInput, testData.invalidUser.email);
});

Then('I should see an error message indicating the account could not be found', async function () {
  const errorMessage = this.page.locator(
    '.a-alert-content, ' +
    '#auth-error-message-box .a-alert-content, ' +
    'h4[class*="alert"], ' +
    'div[class*="auth-error"]'
  ).first();

  await expect(errorMessage).toBeVisible({ timeout: 15000 });
  const errorText = await errorMessage.innerText();
  expect(errorText.toLowerCase()).toContain('not');
});
