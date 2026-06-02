// Product details page-specific Cucumber steps.
const { Then } = require('@cucumber/cucumber');
const ProductDetailsPage = require('../pages/ProductDetailsPage');

Then('the product title should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
});

Then('the product brand should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.brandName);
});

Then('the product price should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.price);
});

Then('the product rating should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.rating);
});

Then('the shade Believe should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.shadeBelieve);
});

Then('the View All Shade button should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.viewAllShade);
});

Then('the pincode delivery section should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.pincodeInput);
  await productDetailsPage.verifyVisible(productDetailsPage.checkDeliveryButton);
});

Then('the quantity dropdown should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.quantityDropdown);
});

Then('the Add To Bag button should be visible', async function () {
  const productDetailsPage = new ProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.addToBagButton);
});
