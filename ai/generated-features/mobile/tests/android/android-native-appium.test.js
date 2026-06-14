const wd = require('wd');
const chai = require('chai');
const { expect } = chai;
const androidCapabilities = require('../../mobile/capabilities/android.capabilities');
const appiumConfig = require('../../config/appium.config');
const AmazonAndroidPage = require('../../mobile/android/AmazonAndroidPage');

describe('Android Native App - Amazon', function () {
  this.timeout(120000);
  let driver;
  let homePage;

  before(async function () {
    driver = await wd.promiseChainRemote({
      host: appiumConfig.host,
      port: appiumConfig.port
    });
    await driver.init(androidCapabilities());
    homePage = new AmazonAndroidPage(driver);
  });

  after(async function () {
    if (driver) {
      await driver.quit();
    }
  });

  it('should launch the Android native app and display the home screen', async function () {
    await homePage.openHomePage();
    await homePage.verifyHomeLoaded();
  });

  it('should search for a product', async function () {
    await homePage.openHomePage();
    await homePage.searchProduct('mobile phone');
    await homePage.verifySearchResultsVisible('mobile phone');
  });

  it('should open product details from search results', async function () {
    await homePage.openHomePage();
    await homePage.searchProduct('headphones');
    await homePage.openFirstProductFromResults();
    await homePage.verifyProductDetailsVisible();
  });

  it('should add a product to cart', async function () {
    await homePage.openHomePage();
    await homePage.searchProduct('book');
    await homePage.openFirstProductFromResults();
    const added = await homePage.addToCartIfAvailable();
    await homePage.verifyAddToCartFlowComplete(added);
  });
});
