import { normalizePlatform, TEST_PLATFORMS } from '../framework/common/platforms';
import executionConfig from './executionConfig';
// Central environment configuration read by hooks, page objects, and utility helpers.
// Uses config/executionConfig.js as single source of truth for headless/headed mode.
// IMPORTANT: headless mode is NEVER cached — it's always resolved dynamically
// via a getter that re-reads executionConfig on every access.
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const environments: Record<string, any> = {
  dev: { baseUrl: process.env.BASE_URL || 'https://www.amazon.in' },
  qa: { baseUrl: process.env.QA_URL || process.env.BASE_URL || 'https://www.amazon.in' },
  stage: { baseUrl: process.env.STAGE_URL || process.env.BASE_URL || 'https://www.amazon.in' },
  prod: { baseUrl: process.env.PROD_URL || process.env.BASE_URL || 'https://www.amazon.in' }
};

const activeEnv = process.env.ENV || 'dev';
const testPlatform = normalizePlatform(process.env.TEST_PLATFORM || TEST_PLATFORMS.WEB);

// Build the module exports object
const config: Record<string, any> = {
  env: activeEnv,
  testPlatform,
  appName: process.env.APP_NAME || 'Amazon India',
  baseUrl: (environments[activeEnv] || environments.dev).baseUrl,
  browser: process.env.BROWSER || 'chromium',
  timeout: Number(process.env.TIMEOUT || 60000),
  reportDir: process.env.REPORT_DIR || 'reports',
  retries: Number(process.env.RETRIES || 1),
  parallel: Number(process.env.PARALLEL || 1),
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
    path: process.env.APPIUM_BASE_PATH || process.env.APPIUM_PATH || '/',
    logLevel: process.env.APPIUM_LOG_LEVEL || 'info',
    autoStart: process.env.APPIUM_AUTO_START !== 'false',
    autoStop: process.env.APPIUM_AUTO_STOP !== 'false',
    startTimeout: Number(process.env.APPIUM_START_TIMEOUT || 30000),
    connectionRetryTimeout: Number(process.env.APPIUM_CONNECTION_RETRY_TIMEOUT || 120000),
    connectionRetryCount: Number(process.env.APPIUM_CONNECTION_RETRY_COUNT || 3),
    logPath: process.env.APPIUM_LOG_PATH || 'mobile/logs/appium-server.log',
    serverUrl: `${process.env.APPIUM_PROTOCOL || 'http'}://${process.env.APPIUM_HOST || '127.0.0.1'}:${process.env.APPIUM_PORT || 4723}${process.env.APPIUM_BASE_PATH || process.env.APPIUM_PATH || '/'}`
  },
  mobile: {
    deviceName: process.env.DEVICE_NAME || '',
    platformVersion: process.env.PLATFORM_VERSION || '',
    appPath: process.env.APP_PATH || '',
    appPackage: process.env.APP_PACKAGE || '',
    appActivity: process.env.APP_ACTIVITY || '',
    bundleId: process.env.BUNDLE_ID || '',
    browserName: process.env.BROWSER_NAME || '',
    iosAutomationMode: process.env.IOS_AUTOMATION_MODE || '',
    udid: process.env.UDID || '',
    noReset: process.env.NO_RESET === 'true',
    fullReset: process.env.FULL_RESET === 'true'
  },
  // Headless mode: ALWAYS resolve dynamically from executionConfig.
  // Do NOT cache this value — use the getter to ensure every consumer
  // gets the live headless/headed state.
  get headless() {
    return executionConfig.isHeadless;
  }
};

// Log headless state at startup for debugging
if (typeof console !== 'undefined' && console.log) {
  console.log(`[config] HEADLESS=${process.env.HEADLESS === undefined ? '(unset)' : process.env.HEADLESS} → headless=${config.headless}, parallel=${config.parallel}, browser=${config.browser}`);
}

export default config;
