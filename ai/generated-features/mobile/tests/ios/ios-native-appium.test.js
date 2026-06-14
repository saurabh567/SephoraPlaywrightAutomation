const wd = require('wd');
const chai = require('chai');
const { expect } = chai;
const iosCapabilities = require('../../mobile/capabilities/ios.capabilities');
const appiumConfig = require('../../config/appium.config');
const AmazonIOSAppPage = require('../../mobile/ios/AmazonIOSAppPage');

describe('iOS Native App - Amazon', function () {
  this.timeout(120000);
  let driver;
  let homePage;

  before(async function () {
    driver = await wd.promiseChainRemote({
      host: appiumConfig.host,
      port: appiumConfig.port
    });
    await driver.init(iosCapabilities());
    homePage = new AmazonIOSAppPage(driver);
  });

  after(async function () {
    if (driver) {
      await driver.quit();
    }
  });

  it('should launch the iOS native app and display the home screen', async function () {
    await homePage.openHomePage();
    await homePage.verifyHomeLoaded();
  });

  it('should search for a product', async function () {
    await homePage.openHomePage();
    await homePage.searchProduct('iPhone');
    await homePage.verifySearchResultsVisible();
  });

  it('should open product details from search results', async function () {
    await homePage.openHomePage();
    await homePage.searchProduct('iPad');
    await homePage.openFirstProductFromResults();
    await homePage.verifyProductDetailsVisible();
  });
});
