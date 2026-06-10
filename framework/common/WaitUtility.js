class WaitUtility {
  static async waitForVisible(target, timeout = 30000) {
    if (target?.waitFor) {
      return target.waitFor({ state: 'visible', timeout });
    }

    if (target?.waitForDisplayed) {
      return target.waitForDisplayed({ timeout });
    }

    throw new Error('Unsupported target passed to WaitUtility.waitForVisible.');
  }

  static async pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = WaitUtility;
