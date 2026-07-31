import path from 'path';
import ExecutionMode from '../../framework/common/ExecutionMode';
import androidNativeCapabilities from '../capabilities/androidNativeCapabilities';
import androidWebCapabilities from '../capabilities/androidWebCapabilities';
import AppInstallationDetector from '../utils/AppInstallationDetector';
import DynamicActivityResolver from '../utils/DynamicActivityResolver';
import ChromeDriverManager from '../utils/ChromeDriverManager';
/**
 * DriverManager.js
 *
 * SINGLE source of truth for mobile driver creation across the entire framework.
 *
 * ONE driver session per execution. No duplicate creation.
 * Hooks and MobileSessionManager reuse the driver from this manager.
 *
 * Responsibilities:
 *   - Detect execution mode (ANDROID_NATIVE | ANDROID_WEB)
 *   - Build correct capabilities (separate native vs web builders)
 *   - Verify app installation for native mode (via AppInstallationDetector)
 *   - Resolve launchable activity dynamically (no hardcoded activities)
 *   - Setup ChromeDriver for mobile web
 *   - Create ONE Appium driver session
 *   - Launch Chrome/Safari browsers and navigate to target URL
 *
 * Key design:
 *   - Browser/App is NEVER launched before:
 *       a) Environment validation completes
 *       b) Appium is healthy
 *       c) Driver session creation starts
 *   - Execution mode is detected once via ExecutionMode module
 *   - Native capabilities NEVER include browserName
 *   - Web capabilities NEVER include appPackage/appActivity
 *
 * App Installation Flow:
 *   [Driver] Creating Android Driver
 *     │
 *     ├── ANDROID_NATIVE ──→ [APK] APP_PATH detected/not configured
 *     │                         │
 *     │                         ├── APP_PATH exists → install APK → verify → launch
 *     │                         │
 *     │                         └── APP_PATH absent → verify package → launch or fail
 *     │
 *     └── ANDROID_WEB ──→ Setup ChromeDriver → Create session
 */

'use strict';


// Singleton driver instance — shared across entire process
var _sharedDriver: any = null;
var _driverCreated = false;
    _startupCompleted = false;
var _startupCompleted = false;


class DriverManager {
  /**
   * Create an Android driver session based on execution mode.
   *
   * @param {object} appiumConfig - Appium connection configuration
   * @param {object} options - Driver options
   * @returns {Promise<object>} WebDriverIO browser/driver object
   */
  static async createAndroidDriver(appiumConfig: any, options: any) {
    options = options || {};

    // ── Check if driver already exists ──────────────────────────────
    if (_driverCreated && _sharedDriver) {
      console.log('[DriverManager] Reusing existing Android driver session');
      return _sharedDriver;
    }

    var executionMode = ExecutionMode.getExecutionMode();
    var isNative = ExecutionMode.isAndroidNative();
    var isWeb = ExecutionMode.isAndroidWeb();

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   DRIVER MANAGER — ANDROID SESSION          ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('  Execution mode: ' + executionMode);
    console.log('');

    var caps: any;

    if (isNative) {
      // ════════════════════════════════════════════════════════════════
      // ANDROID NATIVE PATH
      // ════════════════════════════════════════════════════════════════
      var appPackage = options.appPackage || process.env.APP_PACKAGE || 'in.amazon.mShop.android.shopping';
      var appPath = options.appPath || process.env.APP_PATH || '';

      console.log('[Driver] Creating Android Driver');
      console.log('[Driver] ANDROID_NATIVE mode: ' + appPackage);

      // ── Step 1: Ensure app is available (install/verify/launch) ──
      // AppInstallationDetector handles:
      //   - Installing APK if APP_PATH is configured
      //   - Verifying package if APP_PATH is absent
      //   - Launching the app via ADB
      //   - Returning actionable diagnostics on failure
      var installResult = AppInstallationDetector.ensureAppAvailable(appPackage, appPath);
      if (!installResult.available) {
        throw new Error('[DriverManager] App availability check failed: ' + installResult.message);
      }

      console.log('[Driver] Launching application');

      // ── Step 2: Resolve launchable activity dynamically ──
      var resolvedActivity = DynamicActivityResolver.resolve(appPackage);
      if (resolvedActivity) {
        console.log('[DriverManager] Using resolved activity: ' + resolvedActivity);
      }

      // ── Step 3: Get native capabilities (NO browserName) ──
      caps = androidNativeCapabilities();

      // ── Step 4: Let Appium launch the application via capabilities ──
      // ADB does NOT launch the app. Appium handles all app lifecycle.
      // appium:autoLaunch defaults to true in androidNativeCapabilities.
      if (resolvedActivity) {
        caps['appium:appActivity'] = resolvedActivity;
        caps['appium:autoLaunch'] = true;
        console.log('[DriverManager] Appium will launch app with activity: ' + resolvedActivity);
      } else {
        // No activity resolved - rely on appPackage alone (Appium will use MAIN/LAUNCHER)
        caps['appium:autoLaunch'] = true;
        console.log('[DriverManager] Appium will launch app (no specific activity resolved)');
      }

      console.log('[Driver] Android session created');
    } else if (isWeb) {
      // ════════════════════════════════════════════════════════════════
      // ANDROID MOBILE WEB PATH (Chrome only)
      // ════════════════════════════════════════════════════════════════
      console.log('[DriverManager] ANDROID_WEB mode: Chrome browser');

      // Step 1: Setup ChromeDriver
      ChromeDriverManager.setup();

      // Step 2: Get web capabilities (NO native app caps)
      caps = androidWebCapabilities();
      caps['appium:autoLaunch'] = true;

      console.log('[DriverManager] Android Web capabilities ready — Chrome only');
    } else {
      throw new Error('[DriverManager] Unsupported Android execution mode: ' + executionMode);
    }

    // ── Merge any caller overrides ──────────────────────────────────
    if (options.capabilities) {
      for (var key in options.capabilities) {
        if (options.capabilities.hasOwnProperty(key)) {
          caps[key] = options.capabilities[key];
        }
      }
    }

    // ── Log capabilities ──────────────────────────────────────────
    console.log('');
    console.log('  CAPABILITIES:');
    var capKeys = Object.keys(caps);
    for (var i = 0; i < capKeys.length; i++) {
      var val = caps[capKeys[i]];
      if (val !== undefined && val !== null) {
        console.log('    ' + capKeys[i] + ' = ' + JSON.stringify(val));
      }
    }
    console.log('');

    // ── Validate capability separation ─────────────────────────────
    if (isNative && caps['appium:browserName']) {
      console.warn('[DriverManager] WARNING: Native mode should not have browserName capability');
      delete caps['appium:browserName'];
      delete caps.browserName;
    }
    if (isWeb && caps['appium:appPackage']) {
      console.warn('[DriverManager] WARNING: Web mode should not have appPackage capability');
      delete caps['appium:appPackage'];
      delete caps['appium:appActivity'];
      delete caps['appium:appWaitActivity'];
      delete caps['appium:appWaitPackage'];
      delete caps['appium:appWaitDuration'];
      delete caps['appium:app'];
    }

    // ── Create driver via WebDriverIO ──────────────────────────────
    var { remote } = require('webdriverio');

    var wdioTimeout = Number(options.connectionRetryTimeout ||
                              process.env.APPIUM_CONNECTION_RETRY_TIMEOUT || 300000);
    var wdioRetries = Number(options.connectionRetryCount ||
                              process.env.APPIUM_CONNECTION_RETRY_COUNT || 1);

    console.log('[DriverManager] Creating session (timeout=' + wdioTimeout + 'ms, retries=' + wdioRetries + ')');

    var driver = await remote({
      protocol: appiumConfig.protocol || 'http',
      hostname: appiumConfig.hostname || appiumConfig.host || '127.0.0.1',
      port: appiumConfig.port || 4723,
      path: appiumConfig.path || appiumConfig.basePath || '/',
      logLevel: options.logLevel || process.env.WDIO_LOG_LEVEL || 'warn',
      connectionRetryTimeout: wdioTimeout,
      connectionRetryCount: wdioRetries,
      capabilities: caps
    });

    driver.__mobilePlatform = 'android';
    driver.__executionMode = executionMode;

    // Cache as shared singleton
    _sharedDriver = driver;
    _driverCreated = true;

    console.log('[DriverManager] ✅ Android ' + (isNative ? 'Native' : 'Web') + ' driver session created');
    console.log('');

    return driver;
  }

  /**
   * Create an iOS driver session.
   * @param {object} appiumConfig - Appium connection configuration
   * @param {object} options - Driver options
   * @returns {Promise<object>} WebDriverIO browser/driver object
   */
  static async createIOSDriver(appiumConfig: any, options: any) {
    options = options || {};

    // ── Check if driver already exists ──────────────────────────────
    if (_driverCreated && _sharedDriver) {
      console.log('[DriverManager] Reusing existing iOS driver session');
      return _sharedDriver;
    }

    var MobileDriverFactory;
    try {
      MobileDriverFactory = require(path.join(process.cwd(), 'framework', 'mobile', 'MobileDriverFactory'));
    } catch (_: any) {
      MobileDriverFactory = require(path.join(process.cwd(), 'mobile', 'drivers', 'MobileDriverFactory'));
    }

    var caps: any = MobileDriverFactory.getCapabilities('IOS');

    // Merge overrides
    if (options.capabilities) {
      for (var key in options.capabilities) {
        if (options.capabilities.hasOwnProperty(key)) {
          caps[key] = options.capabilities[key];
        }
      }
    }

    var executionMode = ExecutionMode.getExecutionMode();
    var isWeb = ExecutionMode.isIOSWeb();
    var isNative = ExecutionMode.isIOSNative();

    if (isWeb) {
      // iOS Web (Safari) — ensure browser name
      var effectiveBrowserName = caps['appium:browserName'] || caps.browserName ||
                                  options.browserName || process.env.BROWSER_NAME || 'Safari';
      caps['appium:browserName'] = effectiveBrowserName;
      caps.browserName = effectiveBrowserName;
      caps['safari:useSimulator'] = true;
      caps['safari:clearData'] = true;
    }

    // Remove undefined values
    var cleanCaps: Record<string, any> = {};
    for (var key in caps) {
      if (caps.hasOwnProperty(key) && caps[key] !== undefined) {
        cleanCaps[key] = caps[key];
      }
    }
    caps = cleanCaps;

    // Ensure device name
    if (!caps['appium:deviceName'] && !caps.deviceName) {
      caps['appium:deviceName'] = process.env.DEVICE_NAME || 'iPhone 15';
    }

    // Use UDID from options or env
    if (options && options.udid) {
      caps['appium:udid'] = options.udid;
    } else if (!caps['appium:udid'] && process.env.UDID) {
      caps['appium:udid'] = process.env.UDID;
    }

    // WDA timeouts
    if (!caps['appium:wdaLaunchTimeout']) {
      caps['appium:wdaLaunchTimeout'] = Number(process.env.WDA_LAUNCH_TIMEOUT || 180000);
    }
    if (!caps['appium:wdaConnectionTimeout']) {
      caps['appium:wdaConnectionTimeout'] = Number(process.env.WDA_CONNECTION_TIMEOUT || 180000);
    }

    console.log('');
    console.log('  CAPABILITIES (sent to Appium):');
    console.log('  ' + JSON.stringify(caps, null, 4).split('\n').join('\n  '));
    console.log('');

    var { remote } = require('webdriverio');

    var wdioTimeout = Number(options.connectionRetryTimeout ||
                              process.env.APPIUM_CONNECTION_RETRY_TIMEOUT || 300000);
    var wdioRetries = Number(options.connectionRetryCount ||
                              process.env.APPIUM_CONNECTION_RETRY_COUNT || 1);

    console.log('[DriverManager] WebDriverIO timeout=' + wdioTimeout + 'ms, retries=' + wdioRetries);

    var driver = await remote({
      protocol: appiumConfig.protocol || 'http',
      hostname: appiumConfig.hostname || appiumConfig.host || '127.0.0.1',
      port: appiumConfig.port || 4723,
      path: appiumConfig.path || appiumConfig.basePath || '/',
      logLevel: options.logLevel || process.env.WDIO_LOG_LEVEL || 'warn',
      connectionRetryTimeout: wdioTimeout,
      connectionRetryCount: wdioRetries,
      capabilities: caps
    });

    driver.__mobilePlatform = 'ios';
    driver.__executionMode = executionMode;

    // Cache as shared singleton
    _sharedDriver = driver;
    _driverCreated = true;

    console.log('[DriverManager] ✅ iOS ' + (isWeb ? 'Safari' : 'Native') + ' driver session created');
    return driver;
  }

  /**
   * Get the shared driver instance (if already created).
   * @returns {object|null}
   */
  static getSharedDriver() {
    return _sharedDriver;
  }

  /**
   * Check if a driver session has been created.
   * @returns {boolean}
   */
  static hasDriver() {
    return _driverCreated && _sharedDriver !== null;
  }

  /**
   * Reset the shared driver (for testing or cleanup).
   */

  /**
   * Mark application startup as completed.
   */
  static markStartupCompleted() {
    _startupCompleted = true;
  }

  /**
   * Check if application startup has been completed.
   * @returns {boolean}
   */
  static isStartupCompleted() {
    return _startupCompleted;
  }

  /**
   * Reset the startup completion flag (for testing/cleanup).
   */
  static resetStartupCompleted() {
    _startupCompleted = false;
  }

  static resetSharedDriver() {
    _sharedDriver = null;
    _driverCreated = false;
    _startupCompleted = false;
  }

  /**
   * Launch Chrome on Android and navigate to target URL.
   * @param {object} driver - WebDriverIO driver
   * @param {string} url - Target URL
   * @returns {Promise<void>}
   */
  static async launchChromeAndNavigate(driver: any, url: any) {
    url = url || process.env.BASE_URL || 'https://www.amazon.in';

    if (!driver) {
      throw new Error('[DriverManager] Driver is null — cannot launch Chrome');
    }

    if (ExecutionMode.isAndroidNative()) {
      console.log('[DriverManager] Native mode — skipping Chrome launch');
      return;
    }

    console.log('[DriverManager] Launching Chrome and navigating to: ' + url);

    try {
      // Get all available contexts
      var contexts = await driver.getContexts();
      var chromeContext = null;
      for (var i = 0; i < contexts.length; i++) {
        var c = contexts[i];
        if (typeof c === 'string') {
          if (c.toLowerCase().indexOf('chrome') >= 0 ||
              c.toLowerCase().indexOf('webview') >= 0 ||
              c.indexOf('WEBVIEW') >= 0) {
            chromeContext = c;
            break;
          }
        }
      }

      if (chromeContext) {
        console.log('[DriverManager] Switching to context: ' + chromeContext);
        await driver.switchContext(chromeContext);
      }

      // Navigate to URL
      await driver.url(url);
      console.log('[DriverManager] Navigation initiated to: ' + url);

      // Verify navigation
      var currentUrl = await driver.getUrl();
      var domain = url.replace(/https?:\/\//, '').split('/')[0];
      if (!currentUrl || currentUrl.indexOf(domain) < 0) {
        console.log('[DriverManager] Navigation verification failed — retrying...');
        await driver.url(url);
        await driver.pause(2000);
      } else {
        console.log('[DriverManager] Navigation confirmed: ' + currentUrl);
      }
    } catch (err: any) {
      // If context switching fails, try direct navigation
      try {
        console.log('[DriverManager] Context switching failed, trying direct navigation: ' + err.message);
        await driver.url(url);
        await driver.pause(3000);
      } catch (navErr: any) {
        throw new Error('[DriverManager] Failed to launch Chrome and navigate: ' + navErr.message);
      }
    }
  }

  /**
   * Launch Safari on iOS simulator and navigate to target URL.
   * @param {object} driver - WebDriverIO driver
   * @param {string} url - Target URL
   * @returns {Promise<void>}
   */
  static async launchSafariAndNavigate(driver: any, url: any) {
    url = url || process.env.BASE_URL || 'https://www.amazon.in';

    if (!driver) {
      throw new Error('[DriverManager] Driver is null — cannot launch Safari');
    }

    console.log('[DriverManager] Launching Safari and navigating to: ' + url);

    try {
      // Navigate to about:blank first to clear previous session
      console.log('[Safari] Navigating to about:blank (clearing previous session)...');
      await driver.url('about:blank');
      await driver.pause(1000);

      // Navigate to target URL with retry
      for (var attempt = 0; attempt < 3; attempt++) {
        await driver.url(url);
        await driver.pause(2000);

        var currentUrl = await driver.getUrl();
        console.log('[Safari] Current URL (attempt ' + (attempt + 1) + '): ' + (currentUrl || 'null'));

        if (currentUrl && currentUrl !== 'about:blank' &&
            currentUrl.indexOf(url.replace(/https?:\/\//, '').split('/')[0]) >= 0) {
          console.log('[Safari] Navigation confirmed to: ' + currentUrl);
          return;
        }
      }

      throw new Error('[Safari] Failed to navigate to ' + url + ' after 3 attempts');
    } catch (err: any) {
      throw new Error('[DriverManager] Failed to launch Safari and navigate: ' + err.message);
    }
  }

  /**
   * Execute mobile tests using the created driver.
   * @param {object} driver - WebDriverIO driver
   * @param {function} testFn - Async test function to execute
   * @returns {Promise<{success: boolean, message: string}>}
   */
  static async executeTests(driver: any, testFn: any) {
    if (!testFn) {
      return { success: true, message: 'No test function provided — skipping execution' };
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   TEST EXECUTION                            ║');
    console.log('╚══════════════════════════════════════════════╝');

    try {
      await testFn(driver);
      console.log('');
      console.log('[DriverManager] ✅ Test execution completed successfully');
      return { success: true, message: 'Test execution completed' };
    } catch (err: any) {
      console.log('');
      console.log('[DriverManager] ❌ Test execution failed: ' + err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Delete the current driver session and clean up.
   * @param {object} driver - WebDriverIO driver to delete
   */
  static async deleteSession(driver: any) {
    if (driver) {
      try {
        await driver.deleteSession();
        console.log('[DriverManager] Driver session deleted');
      } catch (_: any) {}
    }
    _sharedDriver = null;
    _driverCreated = false;
    _startupCompleted = false;
  }
}

export default DriverManager;
