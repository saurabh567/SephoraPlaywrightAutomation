const envConfig = require('../../config/env.config');

class UnifiedConfigReader {
  static get(key) {
    return envConfig[key];
  }

  static getPlatform() {
    return envConfig.testPlatform;
  }

  static getBaseUrl() {
    return envConfig.baseUrl;
  }

  static getAppiumServerUrl() {
    return envConfig.appium.serverUrl;
  }

  static getMobileConfig() {
    return envConfig.mobile;
  }
}

module.exports = UnifiedConfigReader;
