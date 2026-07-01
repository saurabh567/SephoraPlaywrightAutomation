const ConfigReader = require('../common/ConfigReader');
const { TEST_PLATFORMS } = require('../common/platforms');

class MobileBasePage {
  constructor(driver) {
    this.driver = driver;
    this.timeout = ConfigReader.get('timeout');
    this._platform = ConfigReader.get('testPlatform');
  }

  /**
   * Resolve a locator string to be compatible with the current platform.
   *
   * WebDriverIO `~` prefix maps to "accessibility id" strategy.
   * On iOS, "accessibility id" is unsupported, so we convert `~value` to:
   *   - `name:value` (iOS XCUITest name strategy — most direct equivalent)
   *
   * Supported iOS locator strategies (used directly without `~`):
   *   - id
   *   - name
   *   - xpath
   *   - -ios predicate string
   *   - -ios class chain
   *
   * @param {string} locator - Raw locator string (e.g. '~search-box')
   * @returns {string} Platform-compatible locator string
   */
  resolveLocator(locator) {
    if (typeof locator !== 'string') return locator;

    if (this._platform === TEST_PLATFORMS.IOS && locator.startsWith('~')) {
      // Convert '~value' to 'name:value' for iOS
      return 'name:' + locator.substring(1);
    }

    // Android and other platforms keep the original ~ (accessibility id)
    return locator;
  }

  /**
   * Create a platform-aware element reference from a locator string.
   * Use this in page object constructors instead of driver.$() directly.
   *
   * Example:
   *   this.searchBox = this.createLocator('~search-box');
   */
  createLocator(locator) {
    return this.resolveLocator(locator);
  }

  async find(locator) {
    return this.driver.$(this.resolveLocator(locator));
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
