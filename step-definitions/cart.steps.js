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
  await cart.verifyVisible(cart.productBrand);
  await cart.verifyVisible(cart.productName);
});

Then('the cart quantity controls should be visible', async function () {
  const cart = new CartPage(this.page);
  await cart.verifyVisible(cart.quantityMinus);
  await cart.verifyVisible(cart.quantityPlus);
});

Then('the price summary should be visible', async function () {
  const cart = new CartPage(this.page);
  await cart.verifyVisible(cart.priceSummary);
  await cart.verifyVisible(cart.totalMrp);
  await cart.verifyVisible(cart.subtotal);
});

Then('the checkout button should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.checkoutButton);
});

Then('the apply coupon section should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.applyCoupons);
});

Then('the change pincode button should be visible', async function () {
  const cartPage = new CartPage(this.page);
  await cartPage.verifyVisible(cartPage.changePincode);
});
