// Amazon cart page-specific Cucumber steps.
const { Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonCartPage = require('../pages/AmazonCartPage');

Then('the Amazon cart page should be visible', async function () {
  const cartPage = new AmazonCartPage(this.page);
  await cartPage.verifyCartPageVisible();
});

Then('the Amazon cart title or empty cart message should be visible', async function () {
  const cartPage = new AmazonCartPage(this.page);
  await expect(cartPage.cartTitle.or(cartPage.emptyCartMessage).first()).toBeVisible({ timeout: 60000 });
});

Then('the Amazon proceed to buy button should be visible if cart has items', async function () {
  const cartPage = new AmazonCartPage(this.page);
  const hasItems = await cartPage.cartItems.first().isVisible({ timeout: 5000 }).catch(() => false);
  if (hasItems) {
    await cartPage.verifyVisible(cartPage.proceedToBuyButton);
  } else {
    await cartPage.verifyVisible(cartPage.emptyCartMessage);
  }
});
