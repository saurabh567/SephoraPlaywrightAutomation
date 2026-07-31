import envConfig from '../../config/env.config';

class UnifiedConfigReader {
  static get(key: any) {
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

export default UnifiedConfigReader;
