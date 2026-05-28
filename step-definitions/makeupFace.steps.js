const { When, Then } = require('@cucumber/cucumber');

When('I open the first visible product from listing page', async function () {
  await this.pages.makeupFacePage.openFirstProduct();
});

Then('the Makeup Face page banner should be visible', async function () {
  await this.pages.makeupFacePage.verifyVisible(this.pages.makeupFacePage.heading);
});

Then('the face category tab should be selected or visible', async function () {
  await this.pages.makeupFacePage.verifyVisible(this.pages.makeupFacePage.faceTab);
});

Then('all makeup category tabs should be visible', async function () {
  const page = this.pages.makeupFacePage;
  await page.verifyVisible(page.allTab);
  await page.verifyVisible(page.faceTab);
  await page.verifyVisible(page.eyesTab);
  await page.verifyVisible(page.lipsTab);
  await page.verifyVisible(page.nailsTab);
});

Then('the product listing sort dropdown should be visible', async function () {
  await this.pages.makeupFacePage.verifyVisible(this.pages.makeupFacePage.sortDropdown);
});

Then('the product filters should be visible', async function () {
  const page = this.pages.makeupFacePage;
  await page.verifyVisible(page.productTypesFilter);
  await page.verifyVisible(page.productsFilter);
  await page.verifyVisible(page.brandsFilter);
  await page.verifyVisible(page.ratingFilter);
});

Then('the Rare Beauty product should be visible in listing', async function () {
  await this.pages.makeupFacePage.verifyTextVisible('RARE BEAUTY');
  await this.pages.makeupFacePage.verifyTextVisible('Soft Pinch Liquid Blush');
});
