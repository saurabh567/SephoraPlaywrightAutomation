import config from '../config/env.config';
// Helper class that gives other framework files simple access to environment config values.

class ConfigReader {
  static get(key: any) {
    return config[key];
  }

  static getBaseUrl() {
    return config.baseUrl;
  }

  static getBrowser() {
    return config.browser;
  }
}

export default ConfigReader;
