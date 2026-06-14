const MobileBasePage = require('../../framework/mobile/MobileBasePage');
const locators = require('../locators/android/native-home.locators');
const { androidCapabilities } = require('../../mobile/capabilities/android.capabilities');

class AndroidNativeHomePage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.locators = locators;
  }

  async isLoaded() {
    try {
      return await this.isDisplayed(this.locators.homeScreenIndicator);
    } catch {
      return false;
    }
  }

  async searchFor(text) {
    await this.tap(this.locators.searchField);
    await this.type(this.locators.searchInput, text);
    await this.tap(this.locators.searchSubmitButton);
  }

  async tapFirstResult() {
    await this.tap(this.locators.firstSearchResult);
  }

  async tapCartButton() {
    await this.tap(this.locators.cartButton);
  }

  async getProductTitle() {
    return this.getText(this.locators.productTitle);
  }

  async waitForNetwork() {
    await this.driver.pause(2000);
  }
}

module.exports = AndroidNativeHomePage;
