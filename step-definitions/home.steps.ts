import { Then } from '@cucumber/cucumber';
import { expect as playwrightExpect } from '@playwright/test';
import assert from 'assert';
import AmazonHomePage from '../pages/AmazonHomePage';
import { TEST_PLATFORMS } from '../framework/common/platforms';
import logger from '../utils/logger';
// Step definitions unique to the Amazon India Home Page features.
// Platform-aware: uses Playwright page objects for web, MobileAmazon page objects for mobile.

function isMobile(world: any) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world: any) {
  return world.platform === TEST_PLATFORMS.WEB;
}

Then('the Amazon home page should be loaded', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;

  if (isWeb(this)) {
    await playwrightExpect(this.page).toHaveURL(/amazon\.in/i, { timeout: 60000 });
    await playwrightExpect(this.page.locator('body')).toBeVisible({ timeout: 60000 });
  } else {
    // Mobile: verify via page source containing Amazon indicators
    const homePage = new AmazonHomePage(activePage);
    await homePage.waitForAmazonReady();
  }
  logger.info(`[HomeSteps] Home page loaded. Platform: ${this.platform}`);
});

Then('the Amazon logo should be visible', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const homePage = new AmazonHomePage(activePage);
  await homePage.verifyVisible(homePage.logo);
  logger.info(`[HomeSteps] Logo visible. Platform: ${this.platform}`);
});
