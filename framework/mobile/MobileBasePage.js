const ConfigReader = require('../common/ConfigReader');

class MobileBasePage {
  constructor(driver) {
    this.driver = driver;
    this.timeout = ConfigReader.get('timeout');
  }

  async find(locator) {
    return this.driver.$(locator);
  }

  /**
   * Safe tap with retry on element lookup failure.
   * If UiAutomator2 crashes mid-lookup, it will re-throw for the hook to handle.
   */
  async tap(locator, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const element = await this.find(locator);
        await element.waitForDisplayed({ timeout: this.timeout });
        await element.click();
        return;
      } catch (err) {
        lastError = err;
        // If session is invalid or UiAutomator2 crashed, don't retry here —
        // let the hook handle the session restart.
        const msg = String(err.message || '');
        if (msg.includes('invalid session id') || msg.includes('instrumentation process')) {
          throw err;
        }
        // Otherwise (e.g. stale element, not visible) wait and retry
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw lastError;
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

  /**
   * Check if the driver session is still healthy by making a lightweight call.
   */
  async isSessionHealthy() {
    try {
      await this.driver.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = MobileBasePage;
