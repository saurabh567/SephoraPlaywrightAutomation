class WaitUtility {
  static async waitForVisible(target: any, timeout = 30000) {
    if (target?.waitFor) {
      return target.waitFor({ state: 'visible', timeout });
    }

    if (target?.waitForDisplayed) {
      return target.waitForDisplayed({ timeout });
    }

    throw new Error('Unsupported target passed to WaitUtility.waitForVisible.');
  }

  static async pause(ms: any) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default WaitUtility;
