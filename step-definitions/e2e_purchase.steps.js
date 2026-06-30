// Step definitions unique to the End-to-End Purchase flow feature.
const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonCartPage = require('../pages/AmazonCartPage');

When('I click on the Proceed to Buy button', async function () {
  const cartPage = new AmazonCartPage(this.page);
  await cartPage.click(cartPage.proceedToBuyButton);
  await this.page.waitForLoadState('domcontentloaded');
});

Then('the checkout page should be loaded', async function () {
  await expect(this.page).toHaveURL(/buy|checkout|select-delivery-address|spc/i, { timeout: 60000 });
  const checkoutElement = this.page.locator(
    '#address-book-entry-0, ' +
    '[class*="address-book"], ' +
    '.a-box-group, ' +
    '#payment-option-row-container, ' +
    '[class*="checkout"]'
  ).first();
  await expect(checkoutElement).toBeVisible({ timeout: 15000 });
});
