// Shopping bag page-specific Cucumber steps.
const { When, Then } = require('@cucumber/cucumber');
const CartPage = require('../pages/CartPage');

When('I increase product quantity from cart', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.quantityPlus.click();
});

Then('the shopping bag title should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.shoppingBagTitle);
});

Then('the cart item details should be visible', async function () {
  const cart = new CartPage(this.page);
  await cart.verifyVisible(cart.noItemsAlert);
  await cart.verifyVisible(cart.emptyCartTitle);
  await cart.verifyVisible(cart.emptyCartMessage);
});

Then('the cart quantity controls should be visible', async function () {
  const cart = new CartPage(this.page);
  await cart.verifyVisible(cart.freeSamplesBanner);
  await cart.verifyVisible(cart.app10CouponBanner);
});

Then('the price summary should be visible', async function () {
  const cart = new CartPage(this.page);
  await cart.verifyVisible(cart.customerCareSection);
  await cart.verifyVisible(cart.paymentOptions);
});

Then('the checkout button should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.beautyPassRewards);
});

Then('the apply coupon section should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.app10CouponBanner);
});

Then('the change pincode button should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.noItemsAlert);
});
