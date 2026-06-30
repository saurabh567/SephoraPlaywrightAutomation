// Step definitions unique to the Amazon India Home Page features.
const { Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonHomePage = require('../pages/AmazonHomePage');

Then('the Amazon home page should be loaded', async function () {
  await expect(this.page).toHaveURL(/amazon\.in/i, { timeout: 60000 });
  await expect(this.page.locator('body')).toBeVisible({ timeout: 60000 });
});

Then('the Amazon logo should be visible', async function () {
  const homePage = new AmazonHomePage(this.page);
  await homePage.verifyVisible(homePage.logo);
});
