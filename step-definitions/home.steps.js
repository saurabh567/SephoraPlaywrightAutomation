const { Then } = require('@cucumber/cucumber');

Then('the Sephora logo should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.logo);
});

Then('the search box should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.searchBox);
});

Then('the Sign In Register link should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.signInRegister);
});

Then('the Beauty Pass link should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.beautyPass);
});

Then('the Stores and Events link should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.storesEvents);
});

Then('the Wishlist link should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.wishlist);
});

Then('the Bag link should be visible', async function () {
  await this.pages.homePage.verifyVisible(this.pages.homePage.bag);
});

Then('all main navigation menus should be visible', async function () {
  const home = this.pages.homePage;
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
