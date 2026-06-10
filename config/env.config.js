// Central environment configuration read by hooks, page objects, and utility helpers.
require('dotenv').config();
const { normalizePlatform, TEST_PLATFORMS } = require('../framework/common/platforms');

const environments = {
  dev: { baseUrl: process.env.BASE_URL || 'https://www.amazon.in' },
  qa: { baseUrl: process.env.QA_URL || process.env.BASE_URL || 'https://www.amazon.in' },
  stage: { baseUrl: process.env.STAGE_URL || process.env.BASE_URL || 'https://www.amazon.in' },
  prod: { baseUrl: process.env.PROD_URL || process.env.BASE_URL || 'https://www.amazon.in' }
};

const activeEnv = process.env.ENV || 'dev';
const testPlatform = normalizePlatform(process.env.TEST_PLATFORM || TEST_PLATFORMS.WEB);

module.exports = {
  env: activeEnv,
  testPlatform,
  appName: process.env.APP_NAME || 'Amazon India',
  baseUrl: (environments[activeEnv] || environments.dev).baseUrl,
  browser: process.env.BROWSER || 'chromium',
  headless: process.env.HEADLESS !== 'false',
  timeout: Number(process.env.TIMEOUT || 60000),
  reportDir: process.env.REPORT_DIR || 'reports',
  retries: Number(process.env.RETRIES || 1),
  parallel: Number(process.env.PARALLEL || 2),
  viewport: {
    width: Number(process.env.VIEWPORT_WIDTH || 1440),
    height: Number(process.env.VIEWPORT_HEIGHT || 900)
  },
  trace: process.env.TRACE || 'on',
  video: process.env.VIDEO || 'retain-on-failure',
  appium: {
    protocol: process.env.APPIUM_PROTOCOL || 'http',
    hostname: process.env.APPIUM_HOST || '127.0.0.1',
    port: Number(process.env.APPIUM_PORT || 4723),
    path: process.env.APPIUM_PATH || '/',
    logLevel: process.env.APPIUM_LOG_LEVEL || 'info',
    serverUrl: `${process.env.APPIUM_PROTOCOL || 'http'}://${process.env.APPIUM_HOST || '127.0.0.1'}:${process.env.APPIUM_PORT || 4723}${process.env.APPIUM_PATH || '/'}`
  },
  mobile: {
    deviceName: process.env.DEVICE_NAME || '',
    platformVersion: process.env.PLATFORM_VERSION || '',
    appPath: process.env.APP_PATH || '',
    appPackage: process.env.APP_PACKAGE || '',
    appActivity: process.env.APP_ACTIVITY || '',
    bundleId: process.env.BUNDLE_ID || '',
    udid: process.env.UDID || '',
    noReset: process.env.NO_RESET === 'true'
  }
};
