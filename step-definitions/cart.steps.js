const { When, Then } = require('@cucumber/cucumber');

When('I increase product quantity from cart', async function () {
  await this.pages.cartPage.quantityPlus.click();
});

Then('the shopping bag title should be visible', async function () {
  await this.pages.cartPage.verifyVisible(this.pages.cartPage.shoppingBagTitle);
});

Then('the cart item details should be visible', async function () {
  const cart = this.pages.cartPage;
  await cart.verifyVisible(cart.productBrand);
  await cart.verifyVisible(cart.productName);
});

Then('the cart quantity controls should be visible', async function () {
  const cart = this.pages.cartPage;
  await cart.verifyVisible(cart.quantityMinus);
  await cart.verifyVisible(cart.quantityPlus);
});

Then('the price summary should be visible', async function () {
  const cart = this.pages.cartPage;
  await cart.verifyVisible(cart.priceSummary);
  await cart.verifyVisible(cart.totalMrp);
  await cart.verifyVisible(cart.subtotal);
});

Then('the checkout button should be visible', async function () {
  await this.pages.cartPage.verifyVisible(this.pages.cartPage.checkoutButton);
});

Then('the apply coupon section should be visible', async function () {
  await this.pages.cartPage.verifyVisible(this.pages.cartPage.applyCoupons);
});

Then('the change pincode button should be visible', async function () {
  await this.pages.cartPage.verifyVisible(this.pages.cartPage.changePincode);
});
