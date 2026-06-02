// Page object for login popup locators and login-related actions.
const BasePage = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.signInRegister = page.getByText('Sign In / Register');
    this.emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
    this.passwordInput = page.locator('input[type="password"], input[name*="password" i], input[placeholder*="password" i]').first();
    this.loginButton = page.getByRole('button', { name: /login|sign in|continue/i }).first();
  }

  async openLoginPopup() {
    await this.signInRegister.click();
  }

  async login(email, password) {
    await this.openLoginPopup();
    await this.fill(this.emailInput, email);
    await this.fill(this.passwordInput, password);
    await this.loginButton.click();
  }
}

module.exports = LoginPage;
