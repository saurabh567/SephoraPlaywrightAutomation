const fs = require('fs-extra');
const path = require('path');
const logger = require('../../utils/logger');

class ScreenshotUtility {
  /**
   * Capture a screenshot from either a Playwright page or an Appium/WebDriverIO driver.
   *
   * For mobile (Appium/WebDriverIO), uses driver.saveScreenshot() which writes directly to disk.
   * For web (Playwright), uses page.screenshot().
   *
   * @param {object} options
   * @param {object} [options.page] - Playwright page object
   * @param {object} [options.driver] - Appium/WebDriverIO driver
   * @param {string} options.filePath - Full path where the screenshot should be saved
   * @returns {Promise<Buffer>} Screenshot buffer
   */
  static async capture({ page, driver, filePath }) {
    fs.ensureDirSync(path.dirname(filePath));

    // Mobile path: use driver.saveScreenshot() (Appium/WebDriverIO API)
    if (driver && typeof driver.saveScreenshot === 'function') {
      logger.info(`[ScreenshotUtility] Capturing mobile screenshot to: ${filePath}`);
      await driver.saveScreenshot(filePath);
      const buffer = fs.readFileSync(filePath);
      return buffer;
    }

    // Mobile path fallback: use driver.takeScreenshot()
    if (driver && typeof driver.takeScreenshot === 'function') {
      logger.info(`[ScreenshotUtility] Capturing mobile screenshot via takeScreenshot: ${filePath}`);
      const base64Image = await driver.takeScreenshot();
      const buffer = Buffer.from(base64Image, 'base64');
      fs.writeFileSync(filePath, buffer);
      return buffer;
    }

    // Web path: use Playwright page.screenshot()
    if (page && typeof page.screenshot === 'function') {
      logger.info(`[ScreenshotUtility] Capturing web screenshot to: ${filePath}`);
      return page.screenshot({ path: filePath, fullPage: true });
    }

    // Fallback: try page.screenshot even if it might not exist (better error message)
    if (page) {
      logger.warn(`[ScreenshotUtility] page object found but page.screenshot is not a function. Type: ${typeof page.screenshot}`);
    }

    throw new Error(
      'ScreenshotUtility requires either a valid Playwright page (with .screenshot()) ' +
      'or an Appium/WebDriverIO driver (with .saveScreenshot() or .takeScreenshot()).'
    );
  }
}

module.exports = ScreenshotUtility;
