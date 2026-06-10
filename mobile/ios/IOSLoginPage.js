const MobileBasePage = require('../../framework/mobile/MobileBasePage');
const locators = require('../locators/ios/login.locators');

class IOSLoginPage extends MobileBasePage {
  async login(username, password) {
    await this.type(locators.usernameInput, username);
    await this.type(locators.passwordInput, password);
    await this.tap(locators.loginButton);
  }
}

module.exports = IOSLoginPage;
