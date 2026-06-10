const fs = require('fs-extra');
const path = require('path');

class ScreenshotUtility {
  static async capture({ page, driver, filePath }) {
    fs.ensureDirSync(path.dirname(filePath));

    if (page) {
      return page.screenshot({ path: filePath, fullPage: true });
    }

    if (driver) {
      const base64Image = await driver.takeScreenshot();
      const buffer = Buffer.from(base64Image, 'base64');
      fs.writeFileSync(filePath, buffer);
      return buffer;
    }

    throw new Error('ScreenshotUtility requires either a Playwright page or an Appium driver.');
  }
}

module.exports = ScreenshotUtility;
