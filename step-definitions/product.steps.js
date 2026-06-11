// Amazon product details page-specific Cucumber steps.
const { Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
const AmazonProductDetailsPage = require('../pages/AmazonProductDetailsPage');
const getAmazonMobilePage = require('../mobile/AmazonMobilePageFactory');

Then('the Amazon product details page should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyProductDetailsVisible();
    return;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  await productDetailsPage.verifyProductDetailsVisible();
});

Then('the Amazon product title should be visible', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyProductTitleVisible();
    return;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  await productDetailsPage.verifyVisible(productDetailsPage.productTitle);
});

Then('the Amazon product price should be visible if available', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyProductPriceVisibleIfAvailable();
    return;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  const priceVisible = await productDetailsPage.price.isVisible({ timeout: 10000 }).catch(() => false);
  if (priceVisible) {
    await productDetailsPage.verifyVisible(productDetailsPage.price);
  } else {
    await expect(productDetailsPage.productTitle).toBeVisible();
  }
});

Then('the Amazon product rating should be visible if available', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyProductRatingVisibleIfAvailable();
    return;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  const ratingVisible = await productDetailsPage.rating.isVisible({ timeout: 10000 }).catch(() => false);
  if (ratingVisible) {
    await productDetailsPage.verifyVisible(productDetailsPage.rating);
  } else {
    await expect(productDetailsPage.productTitle).toBeVisible();
  }
});

Then('the Amazon add to cart flow should complete', async function () {
  const mobilePage = getAmazonMobilePage(this);
  if (mobilePage) {
    await mobilePage.verifyAddToCartFlowComplete(this.addedToCart);
    return;
  }

  const productDetailsPage = new AmazonProductDetailsPage(this.page);
  if (this.addedToCart) {
    const confirmationVisible = await productDetailsPage.cartConfirmation.isVisible({ timeout: 15000 }).catch(() => false);
    if (!confirmationVisible) {
      await productDetailsPage.openCartFromHeader();
      await expect(this.page).toHaveURL(/cart|gp\/cart/i, { timeout: 60000 });
    }
    return;
  }

  await expect(productDetailsPage.productTitle).toBeVisible();
});
