const { expect } = require('@playwright/test');
const ConfigReader = require('../utils/configReader');

class BasePage {
  constructor(page) {
    this.page = page;
  }

  async open(path = '/') {
    await this.page.goto(`${ConfigReader.getBaseUrl()}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: ConfigReader.get('timeout')
    });
  }

  async click(locator) {
    await locator.waitFor({ state: 'visible', timeout: ConfigReader.get('timeout') });
    await locator.click({ timeout: ConfigReader.get('timeout') });
  }

  async fill(locator, value) {
    await locator.waitFor({ state: 'visible', timeout: ConfigReader.get('timeout') });
    await locator.fill(value, { timeout: ConfigReader.get('timeout') });
  }

  async verifyVisible(locator) {
    await expect(locator).toBeVisible({ timeout: ConfigReader.get('timeout') });
  }

  async verifyTextVisible(text) {
    await expect(this.page.getByText(text, { exact: false }).filter({ visible: true }).first()).toBeVisible({
      timeout: ConfigReader.get('timeout')
    });
  }

  async getPageTitle() {
    return this.page.title();
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
}

module.exports = BasePage;
