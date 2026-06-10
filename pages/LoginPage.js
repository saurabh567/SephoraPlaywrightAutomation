// Amazon sign-in page locators and login-related actions.
const BasePage = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.signInLink = page.locator('#nav-link-accountList').first();
    this.emailInput = page.locator('input[type="email"], #ap_email, input[name="email"]').first();
    this.continueButton = page.locator('#continue').or(page.getByRole('button', { name: /continue/i })).first();
    this.passwordInput = page.locator('input[type="password"], #ap_password').first();
    this.loginButton = page.locator('#signInSubmit').or(page.getByRole('button', { name: /sign in/i })).first();
  }

  async openLoginPopup() {
    await this.signInLink.click();
  }

  async login(email, password) {
    await this.openLoginPopup();
    await this.fill(this.emailInput, email);
    await this.continueButton.click();
    await this.fill(this.passwordInput, password);
    await this.loginButton.click();
  }
}

module.exports = LoginPage;
