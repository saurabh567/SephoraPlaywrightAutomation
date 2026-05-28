const { expect } = require('@playwright/test');
const ConfigReader = require('../utils/configReader');

class BasePage {
  constructor(page) {
    this.page = page;
  }

  async open(path = '/') {
    await this.page.goto(`${ConfigReader.getBaseUrl()}${path}`, { waitUntil: 'domcontentloaded' });
  }

  async click(locator) {
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  }

  async fill(locator, value) {
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value);
  }

  async verifyVisible(locator) {
    await expect(locator).toBeVisible();
  }

  async verifyTextVisible(text) {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible();
  }

  async getPageTitle() {
    return this.page.title();
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
}

module.exports = BasePage;
