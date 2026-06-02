// Home page-specific Cucumber steps that call the HomePage page object.
const { Then } = require('@cucumber/cucumber');
const HomePage = require('../pages/HomePage');

Then('the Sephora logo should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.logo);
});

Then('the search box should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.searchBox);
});

Then('the Sign In Register link should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.signInRegister);
});

Then('the Beauty Pass link should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.beautyPass);
});

Then('the Stores and Events link should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.storesEvents);
});

Then('the Wishlist link should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.wishlist);
});

Then('the Bag link should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.bag);
});

Then('all main navigation menus should be visible', async function () {
  const home = new HomePage(this.page);
  await home.verifyVisible(home.newMenu);
  await home.verifyVisible(home.brandsMenu);
  await home.verifyVisible(home.makeupMenu);
  await home.verifyVisible(home.skincareMenu);
  await home.verifyVisible(home.hairMenu);
  await home.verifyVisible(home.toolsBrushesMenu);
  await home.verifyVisible(home.bathBodyMenu);
  await home.verifyVisible(home.fragranceMenu);
  await home.verifyVisible(home.cleanMenu);
  await home.verifyVisible(home.giftsMenu);
  await home.verifyVisible(home.saleMenu);
});

Then('the hero banner Shop Now button should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.shopNowButton);
});

Then('the Rare Beauty promotional text should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.rareBeautyPromotion);
});

Then('the Free Samples message should be visible', async function () {
  const homePage = new HomePage(this.page);
  await homePage.verifyVisible(homePage.freeSamplesMessage);
});
