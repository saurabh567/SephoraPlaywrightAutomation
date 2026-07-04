/**
 * DriverManager.js
 *
 * Enterprise-grade mobile driver creation and browser/app launch manager.
 *
 * Responsibilities:
 *   - Create Android/iOS Appium drivers
 *   - Launch Chrome/Safari browsers
 *   - Navigate to target URLs
 *   - Handle Android SecurityException workaround (non-exported activities)
 *
 * Key design:
 *   - Browser/App is NEVER launched before:
 *       a) Environment validation completes
 *       b) Appium is healthy
 *       c) WDA (for iOS) is healthy
 *       d) Driver session creation starts
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

class DriverManager {
  /**
   * Create an Android driver session.
   * @param {object} appiumConfig - Appium connection configuration
   * @param {object} options - Driver options (capabilities, appPackage, etc.)
   * @returns {Promise<object>} WebDriverIO browser/driver object
   */
  static async createAndroidDriver(appiumConfig, options) {
    options = options || {};
    var appPackage = options.appPackage || process.env.APP_PACKAGE || 'in.amazon.mShop.android.shopping';

    // Get capabilities from the existing framework
    var MobileDriverFactory;
    try {
      MobileDriverFactory = require(path.join(process.cwd(), 'framework', 'mobile', 'MobileDriverFactory'));
    } catch (_) {
      MobileDriverFactory = require(path.join(process.cwd(), 'mobile', 'drivers', 'MobileDriverFactory'));
    }

    var caps = MobileDriverFactory.getCapabilities('ANDROID');

    // Merge any overrides
    if (options.capabilities) {
      for (var key in options.capabilities) {
        if (options.capabilities.hasOwnProperty(key)) {
          caps[key] = options.capabilities[key];
        }
      }
    }

    // Apply Android app launch adjustments (auto-launch disabled for non-exported activities)
    var androidAppLauncher;
    try {
      androidAppLauncher = require(path.join(process.cwd(), 'mobile', 'utils', 'androidAppLauncher'));
    } catch (_) {
      androidAppLauncher = null;
    }

    if (androidAppLauncher && appPackage) {
      caps = androidAppLauncher.prepareAndroidAppLaunch(appPackage, caps);
    }

    // Ensure autoLaunch is explicitly set
    if (caps['appium:autoLaunch'] === undefined) {
      caps['appium:autoLaunch'] = process.env.APPIUM_AUTO_LAUNCH !== 'false';
    }

    // Create driver via webdriverio
    var { remote } = require('webdriverio');

    var driver = await remote({
      protocol: appiumConfig.protocol || 'http',
      hostname: appiumConfig.hostname || appiumConfig.host || '127.0.0.1',
      port: appiumConfig.port || 4723,
      path: appiumConfig.path || appiumConfig.basePath || '/',
      logLevel: options.logLevel || process.env.WDIO_LOG_LEVEL || 'warn',
      connectionRetryTimeout: options.connectionRetryTimeout || 120000,
      connectionRetryCount: options.connectionRetryCount || 3,
      capabilities: caps
    });

    driver.__mobilePlatform = 'android';

    return driver;
  }

  /**
   * Create an iOS driver session for Safari browser.
   * @param {object} appiumConfig - Appium connection configuration
   * @param {object} options - Driver options
   * @returns {Promise<object>} WebDriverIO browser/driver object
   */
  static async createIOSDriver(appiumConfig, options) {
    options = options || {};

    var MobileDriverFactory;
    try {
      MobileDriverFactory = require(path.join(process.cwd(), 'framework', 'mobile', 'MobileDriverFactory'));
    } catch (_) {
      MobileDriverFactory = require(path.join(process.cwd(), 'mobile', 'drivers', 'MobileDriverFactory'));
    }

    var caps = MobileDriverFactory.getCapabilities('IOS');

    // Merge overrides
    if (options.capabilities) {
      for (var key in options.capabilities) {
        if (options.capabilities.hasOwnProperty(key)) {
          caps[key] = options.capabilities[key];
        }
      }
    }

    // Ensure browser name is set for Safari
    if (!caps['appium:browserName'] && !caps.browserName) {
      caps['appium:browserName'] = options.browserName || process.env.BROWSER_NAME || 'Safari';
    }

    // Ensure noReset for faster session creation
    if (caps['appium:noReset'] === undefined) {
      caps['appium:noReset'] = true;
    }

    var { remote } = require('webdriverio');

    var driver = await remote({
      protocol: appiumConfig.protocol || 'http',
      hostname: appiumConfig.hostname || appiumConfig.host || '127.0.0.1',
      port: appiumConfig.port || 4723,
      path: appiumConfig.path || appiumConfig.basePath || '/',
      logLevel: options.logLevel || process.env.WDIO_LOG_LEVEL || 'warn',
      connectionRetryTimeout: options.connectionRetryTimeout || 120000,
      connectionRetryCount: options.connectionRetryCount || 3,
      capabilities: caps
    });

    driver.__mobilePlatform = 'ios';

    return driver;
  }

  /**
   * Launch Chrome on Android and navigate to target URL.
   * @param {object} driver - WebDriverIO driver
   * @param {string} url - Target URL
   * @returns {Promise<void>}
   */
  static async launchChromeAndNavigate(driver, url) {
    url = url || process.env.BASE_URL || 'https://www.amazon.in';

    if (!driver) {
      throw new Error('Driver is null — cannot launch Chrome');
    }

    // For Android web testing, Appium should already launch Chrome as part of session
    // We just need to verify and navigate to the target URL
    try {
      // Get all available contexts
      var contexts = await driver.getContexts();
      var chromeContext = contexts.find(function(c) {
        return c.toLowerCase().indexOf('chrome') >= 0 ||
               c.toLowerCase().indexOf('webview') >= 0 ||
               c.indexOf('WEBVIEW') >= 0;
      });

      if (chromeContext) {
        await driver.switchContext(chromeContext);
      }

      // Navigate to URL
      await driver.url(url);

      // Verify navigation
      var currentUrl = await driver.getUrl();
      if (!currentUrl || currentUrl.indexOf(url.replace(/https?:\/\//, '').split('/')[0]) < 0) {
        // Retry navigation
        await driver.url(url);
        await driver.pause(2000);
      }
    } catch (err) {
      // If context switching fails, try direct navigation
      try {
        await driver.url(url);
        await driver.pause(3000);
      } catch (navErr) {
        throw new Error('Failed to launch Chrome and navigate: ' + navErr.message);
      }
    }
  }

  /**
   * Launch Safari on iOS simulator and navigate to target URL.
   * @param {object} driver - WebDriverIO driver
   * @param {string} url - Target URL
   * @returns {Promise<void>}
   */
  static async launchSafariAndNavigate(driver, url) {
    url = url || process.env.BASE_URL || 'https://www.amazon.in';

    if (!driver) {
      throw new Error('Driver is null — cannot launch Safari');
    }

    try {
      // For iOS Safari, Appium handles browser launch through WDA.
      // Navigate to target URL
      await driver.url(url);
      await driver.pause(2000);

      // Verify navigation
      var currentUrl = await driver.getUrl();
      if (!currentUrl || currentUrl.indexOf(url.replace(/https?:\/\//, '').split('/')[0]) < 0) {
        await driver.url(url);
        await driver.pause(2000);
      }
    } catch (err) {
      throw new Error('Failed to launch Safari and navigate: ' + err.message);
    }
  }

  /**
   * Execute mobile tests using the created driver.
   * @param {object} driver - WebDriverIO driver
   * @param {function} testFn - Async test function receiving the driver
   */
  static async executeTests(driver, testFn) {
    if (!driver) {
      throw new Error('Cannot execute tests: driver is null');
    }

    if (typeof testFn !== 'function') {
      throw new Error('Cannot execute tests: testFn is not a function');
    }

    try {
      await testFn(driver);
    } catch (err) {
      throw new Error('Test execution failed: ' + err.message);
    }
  }

  /**
   * Clean up driver session.
   * @param {object} driver - WebDriverIO driver
   */
  static async deleteSession(driver) {
    if (driver) {
      try {
        await driver.deleteSession();
      } catch (_) {
        // Session already deleted
      }
    }
  }
}

module.exports = DriverManager;
