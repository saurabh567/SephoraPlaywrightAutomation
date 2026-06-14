const MobileBasePage = require('../../framework/mobile/MobileBasePage');
const locators = require('../locators/ios/hybrid-home.locators');

class IOSHybridHomePage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.locators = locators;
  }

  async switchToWebView() {
    const contexts = await this.driver.contexts();
    const webview = contexts.find((ctx) => ctx.startsWith('WEBVIEW'));
    if (webview) {
      await this.driver.context(webview);
    }
  }

  async switchToNative() {
    await this.driver.context('NATIVE_APP');
  }

  async isLoaded() {
    try {
      return await this.isDisplayed(this.locators.homeScreenIndicator);
    } catch {
      return false;
    }
  }

  async login(username, password) {
    await this.switchToWebView();
    await this.type(this.locators.usernameInput, username);
    await this.type(this.locators.passwordInput, password);
    await this.tap(this.locators.loginButton);
    await this.switchToNative();
  }

  async searchFor(text) {
    await this.tap(this.locators.searchField);
    await this.type(this.locators.searchInput, text);
    await this.tap(this.locators.searchSubmitButton);
  }

  async getFooterLinks() {
    await this.switchToWebView();
    const links = await this.driver.executeScript(
      'return Array.from(document.querySelectorAll("a")).map(a => ({ text: a.innerText, href: a.href }))'
    );
    await this.switchToNative();
    return links || [];
  }
}

module.exports = IOSHybridHomePage;
