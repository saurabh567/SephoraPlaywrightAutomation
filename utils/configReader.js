const config = require('../config/env.config');

class ConfigReader {
  static get(key) {
    return config[key];
  }

  static getBaseUrl() {
    return config.baseUrl;
  }

  static getBrowser() {
    return config.browser;
  }
}

module.exports = ConfigReader;
