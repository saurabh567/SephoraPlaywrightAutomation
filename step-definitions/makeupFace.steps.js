// Makeup Face listing page-specific Cucumber steps.
const { When, Then } = require('@cucumber/cucumber');
const MakeupFacePage = require('../pages/MakeupFacePage');

When('I open the first visible product from listing page', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.openFirstProduct();
});

Then('the Makeup Face page banner should be visible', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyVisible(makeupFacePage.heading);
});

Then('the face category tab should be selected or visible', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyVisible(makeupFacePage.faceTab);
});

Then('all makeup category tabs should be visible', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyVisible(makeupFacePage.allTab);
  await makeupFacePage.verifyVisible(makeupFacePage.faceTab);
  await makeupFacePage.verifyVisible(makeupFacePage.eyesTab);
  await makeupFacePage.verifyVisible(makeupFacePage.lipsTab);
  await makeupFacePage.verifyVisible(makeupFacePage.nailsTab);
});

Then('the product listing sort dropdown should be visible', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyVisible(makeupFacePage.sortDropdown);
});

Then('the product filters should be visible', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyVisible(makeupFacePage.productTypesFilter);
  await makeupFacePage.verifyVisible(makeupFacePage.productsFilter);
  await makeupFacePage.verifyVisible(makeupFacePage.brandsFilter);
  await makeupFacePage.verifyVisible(makeupFacePage.ratingFilter);
});

Then('the Rare Beauty product should be visible in listing', async function () {
  const makeupFacePage = new MakeupFacePage(this.page);
  await makeupFacePage.verifyTextVisible('RARE BEAUTY');
  await makeupFacePage.verifyTextVisible('Soft Pinch Liquid Blush');
});
