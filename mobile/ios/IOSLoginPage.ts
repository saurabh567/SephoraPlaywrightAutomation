import MobileBasePage from '../../framework/mobile/MobileBasePage';
import locators from '../locators/ios/login.locators';

class IOSLoginPage extends MobileBasePage {
  [key: string]: any;
  async login(username: any, password: any) {
    await this.type(locators.usernameInput, username);
    await this.type(locators.passwordInput, password);
    await this.tap(locators.loginButton);
  }
}

export default IOSLoginPage;
