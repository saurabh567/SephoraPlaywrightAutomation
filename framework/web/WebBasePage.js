const { expect } = require('@playwright/test');
const ConfigReader = require('../../utils/configReader');

class WebBasePage {
  constructor(page) {
    if (!page) {
      throw new Error(
        'WebBasePage: page is undefined. ' +
        'Mobile test scenarios set this.driver instead of this.page. ' +
        'Use MobileBasePage subclasses (framework/mobile/MobileBasePage) for mobile page objects.'
      );
    }
    if (typeof page.locator !== 'function') {
      throw new Error(
        'WebBasePage: page.locator is not a function. ' +
        'A WebDriverIO driver was passed to a Playwright-based page object. ' +
        'For mobile tests, extend your page object from framework/mobile/MobileBasePage ' +
        'instead of pages/BasePage (which extends WebBasePage).'
      );
    }
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

  async isSecurityVerificationPage() {
    return this.page
      .getByText(
        /performing security verification|verify you are human|protect against malicious bots|cloudflare|enter the characters you see below|make sure you're not a robot|type the characters/i
      )
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
  }

  async getPageTitle() {
    return this.page.title();
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
}

module.exports = WebBasePage;
