const ConfigReader = require('../common/ConfigReader');

class MobileBasePage {
  constructor(driver) {
    this.driver = driver;
    this.timeout = ConfigReader.get('timeout');
  }

  async find(locator) {
    return this.driver.$(locator);
  }

  async tap(locator) {
    const element = await this.find(locator);
    await element.waitForDisplayed({ timeout: this.timeout });
    await element.click();
  }

  async type(locator, value) {
    const element = await this.find(locator);
    await element.waitForDisplayed({ timeout: this.timeout });
    await element.setValue(value);
  }

  async getText(locator) {
    const element = await this.find(locator);
    await element.waitForDisplayed({ timeout: this.timeout });
    return element.getText();
  }

  async isDisplayed(locator) {
    const element = await this.find(locator);
    return element.isDisplayed();
  }
}

module.exports = MobileBasePage;
