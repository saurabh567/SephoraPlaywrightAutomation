// Android Flow: AndroidCart
// Reusable mobile flow that can be composed in test scenarios

const AmazonAndroidPage = require('../../../mobile/android/AmazonAndroidPage');

class AndroidCartFlow {
  constructor(driver) {
    this.driver = driver;
    this.page = new AmazonAndroidPage(driver);
  }

  async execute(options = {}) {
    const { productName = 'mobile phone', addToCart = false } = options;

    await this.page.openHomePage();
    await this.page.verifyHomeLoaded();

    if (productName) {
      await this.page.searchProduct(productName);
      await this.page.verifySearchResultsVisible(productName);
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

module.exports = AndroidCartFlow;
