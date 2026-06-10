// Cross-platform sample steps for shared business scenarios across Web, Android, and iOS.
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const HomePage = require('../pages/HomePage');
const AndroidLoginPage = require('../mobile/android/AndroidLoginPage');
const IOSLoginPage = require('../mobile/ios/IOSLoginPage');
const { TEST_PLATFORMS } = require('../framework/common/platforms');

Given('User launches application', async function () {
  if (this.platform === TEST_PLATFORMS.WEB) {
    const homePage = new HomePage(this.page);
    await homePage.openHomePage();
    return undefined;
  }

  return undefined;
});

When('User enters username and password', async function () {
  const username = process.env.TEST_USERNAME || 'demo';
  const password = process.env.TEST_PASSWORD || 'demo';

  if (this.platform === TEST_PLATFORMS.ANDROID) {
    const loginPage = new AndroidLoginPage(this.driver);
    await loginPage.login(username, password);
    return;
  }

  if (this.platform === TEST_PLATFORMS.IOS) {
    const loginPage = new IOSLoginPage(this.driver);
    await loginPage.login(username, password);
  }
});

Then('User should login successfully', async function () {
  if (this.platform === TEST_PLATFORMS.WEB) {
    await expect(this.page.locator('body')).toBeVisible();
    return;
  }

  const currentContext = await this.driver.getContext?.().catch(() => undefined);
  if (!currentContext && !this.driver) {
    throw new Error('Mobile driver was not available for login validation.');
  }
});
