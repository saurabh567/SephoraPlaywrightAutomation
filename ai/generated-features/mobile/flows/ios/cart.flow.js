// iOS Flow: IOSCart
// Reusable mobile flow that can be composed in test scenarios

const AmazonIOSAppPage = require('../../../mobile/ios/AmazonIOSAppPage');

class IOSCartFlow {
  constructor(driver) {
    this.driver = driver;
    this.page = new AmazonIOSAppPage(driver);
  }

  async execute(options = {}) {
    const { productName = 'iPhone', addToCart = false } = options;

    await this.page.openHomePage();
    await this.page.verifyHomeLoaded();

    if (productName) {
      await this.page.searchProduct(productName);
      await this.page.verifySearchResultsVisible();
      await this.page.openFirstProductFromResults();
      await this.page.verifyProductDetailsVisible();
    }

    if (addToCart) {
      const added = await this.page.addToCartIfAvailable();
      await this.page.verifyAddToCartFlowComplete(added);
    }

    return { success: true, productName, addToCart };
  }
}

module.exports = IOSCartFlow;
