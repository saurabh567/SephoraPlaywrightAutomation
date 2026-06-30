// Step definitions unique to the Amazon India Product Details Page features.
const { Then } = require('@cucumber/cucumber');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');

Then('the product title should be displayed', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
});

Then('the product price should be displayed if available', async function () {
  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  const priceVisible = await productDetailsPage.price
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  if (priceVisible) {
    await productDetailsPage.verifyVisible(productDetailsPage.price);
  } else {
    await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
  }
});
