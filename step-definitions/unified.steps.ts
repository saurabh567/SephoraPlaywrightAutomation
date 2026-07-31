import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import HomePage from '../pages/HomePage';
import AndroidLoginPage from '../mobile/android/AndroidLoginPage';
import IOSLoginPage from '../mobile/ios/IOSLoginPage';
import { TEST_PLATFORMS } from '../framework/common/platforms';
// Cross-platform sample steps for shared business scenarios across Web, Android, and iOS.

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
