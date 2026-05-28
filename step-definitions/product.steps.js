const { Then } = require('@cucumber/cucumber');

Then('the product title should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.productTitle);
});

Then('the product brand should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.brandName);
});

Then('the product price should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.price);
});

Then('the product rating should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.rating);
});

Then('the shade Believe should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.shadeBelieve);
});

Then('the View All Shade button should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.viewAllShade);
});

Then('the pincode delivery section should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.pincodeInput);
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.checkDeliveryButton);
});

Then('the quantity dropdown should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.quantityDropdown);
});

Then('the Add To Bag button should be visible', async function () {
  await this.pages.productDetailsPage.verifyVisible(this.pages.productDetailsPage.addToBagButton);
});
