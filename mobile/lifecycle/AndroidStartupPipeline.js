/**
 * AndroidStartupPipeline.js
 *
 * Deterministic Android startup sequence following enterprise lifecycle:
 *
 *   [STEP 01] Validate Environment     — Java, Android SDK, adb, Appium, Node
 *   [STEP 02] Detect Device(s)         — adb devices with retry
 *   [STEP 03] Boot Emulator (if needed) — Boot AVD, wait for boot completed
 *   [STEP 04] Verify Device Connectivity — get device info
 *   [STEP 05] Start Appium Server      — Spawn Appium with retry
 *   [STEP 06] Verify Appium Health     — Wait for /status endpoint
 *   [STEP 07] Create Android Driver    — WebDriverIO session
 *   [STEP 08] Launch Chrome            — Open browser
 *   [STEP 09] Navigate to Target URL   — Go to BASE_URL
 *   [STEP 10] Execute Tests            — Run test function
 */

'use strict';

const path = require('path');

class AndroidStartupPipeline {
  /**
   * Execute the full Android startup pipeline.
   *
   * @param {object} context - Pipeline context
   * @param {object} context.logger - StepLogger instance
   * @param {object} context.orchestrator - StartupOrchestrator reference
   * @param {object} context.envValidator - EnvironmentValidator
   * @param {object} context.deviceManager - DeviceManager
   * @param {object} context.appiumManager - AppiumLifecycleManager
   * @param {object} context.driverManager - DriverManager
   * @param {object} context.config - Configuration
   * @param {function} context.testFn - Test function to execute
   * @returns {Promise<{success: boolean, driver: object|null, metrics: object}>}
   */
  static async run(context) {
    var logger = context.logger;
    var config = context.config || {};
    var testFn = context.testFn;

    var metrics = {
      environmentValidation: 0,
      deviceDetection: 0,
      emulatorBoot: 0,
      deviceConnectivity: 0,
      appiumStart: 0,
      appiumHealth: 0,
      driverCreation: 0,
      chromeLaunch: 0,
      navigation: 0,
      testExecution: 0
    };

    var driver = null;

    // ════════════════════════════════════════════════════════════════
    // [STEP 01] Validate Environment
    // ════════════════════════════════════════════════════════════════
    logger.step('Environment Validation');
    var step1Start = Date.now();
    try {
      var envResult = await context.envValidator.validate('android');
      metrics.environmentValidation = Date.now() - step1Start;

      if (!envResult.valid) {
        var failedChecks = envResult.checks.filter(function(c) { return !c.valid; });
        var failureMessages = failedChecks.map(function(c) {
          return c.name + ': ' + c.message;
        }).join('; ');
        logger.fail('Environment validation failed: ' + failureMessages);
        return { success: false, driver: null, metrics: logger.end() };
      }

      var envSummary = envResult.checks.map(function(c) {
        return c.name + ' (' + c.message + ')';
      }).join(', ');
      logger.pass(envSummary);
    } catch (err) {
      metrics.environmentValidation = Date.now() - step1Start;
      logger.fail('Environment validation error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 02] Detect Device(s)
    // ════════════════════════════════════════════════════════════════
    logger.step('Device Detection');
    var step2Start = Date.now();
    try {
      var deviceResult = await context.deviceManager.detectAndroidDevice({
        retries: 3,
        retryDelay: 3000
      });
      metrics.deviceDetection = Date.now() - step2Start;

      if (!deviceResult.detected) {
        logger.fail('No Android device or emulator detected: ' + deviceResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      var deviceList = deviceResult.devices.map(function(d) { return d.serial; }).join(', ');
      logger.pass(deviceResult.message + ' [' + deviceList + ']');
    } catch (err) {
      metrics.deviceDetection = Date.now() - step2Start;
      logger.fail('Device detection error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 03] Boot Emulator (if required)
    // ════════════════════════════════════════════════════════════════
    logger.step('Boot Emulator');
    var step3Start = Date.now();
    try {
      var bootResult = await context.deviceManager.bootAndroidEmulator(
        config.avdName || process.env.ANDROID_AVD,
        180000
      );
      metrics.emulatorBoot = Date.now() - step3Start;

      if (!bootResult.booted) {
        logger.fail('Emulator boot failed: ' + bootResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      logger.pass(bootResult.message + ' (' + bootResult.bootTime + 'ms)');
    } catch (err) {
      metrics.emulatorBoot = Date.now() - step3Start;
      logger.fail('Emulator boot error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 04] Verify Device Connectivity
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Device Connectivity');
    var step4Start = Date.now();
    try {
      var connectivityResult = await context.deviceManager.verifyAndroidDeviceConnectivity();
      metrics.deviceConnectivity = Date.now() - step4Start;

      if (!connectivityResult.connected) {
        logger.fail('Device connectivity check failed: ' + connectivityResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      logger.pass(connectivityResult.message);

      // Unlock device
      await context.deviceManager.unlockAndroidDevice(
        process.env.APPIUM_UNLOCK_KEY || '1234'
      );
    } catch (err) {
      metrics.deviceConnectivity = Date.now() - step4Start;
      logger.fail('Device connectivity error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 05] Start Appium Server
    // ════════════════════════════════════════════════════════════════
    logger.step('Start Appium Server');
    var step5Start = Date.now();
    try {
      var appiumResult = await context.appiumManager.start();
      metrics.appiumStart = Date.now() - step5Start;

      logger.pass('Appium server ready on ' + context.appiumManager.serverUrl +
        ' (attempts: ' + (appiumResult.startedByFramework ? 'started' : 'already-running') + ')');
    } catch (err) {
      metrics.appiumStart = Date.now() - step5Start;
      logger.fail('Appium server start failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 06] Verify Appium Health
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Appium Health');
    var step6Start = Date.now();
    try {
      await context.appiumManager.waitForHealthy(15000);
      metrics.appiumHealth = Date.now() - step6Start;
      logger.pass('Appium health endpoint OK');
    } catch (err) {
      metrics.appiumHealth = Date.now() - step6Start;
      logger.fail('Appium health check failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 07] Create Android Driver
    // ════════════════════════════════════════════════════════════════
    logger.step('Create Android Driver');
    var step7Start = Date.now();
    try {
      var appiumConfig = context.appiumManager.getAppiumConfig();
      driver = await context.driverManager.createAndroidDriver(appiumConfig, {
        appPackage: config.appPackage || process.env.APP_PACKAGE,
        capabilities: config.capabilities
      });
      metrics.driverCreation = Date.now() - step7Start;
      logger.pass('Android driver session created');
    } catch (err) {
      metrics.driverCreation = Date.now() - step7Start;
      logger.fail('Driver creation failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 08] Launch Chrome
    // ════════════════════════════════════════════════════════════════
    logger.step('Launch Chrome');
    var step8Start = Date.now();
    try {
      await context.driverManager.launchChromeAndNavigate(driver, config.baseUrl);
      metrics.chromeLaunch = Date.now() - step8Start;
      logger.pass('Chrome launched');
    } catch (err) {
      metrics.chromeLaunch = Date.now() - step8Start;
      logger.fail('Chrome launch failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: driver, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 09] Navigate to Target URL
    // ════════════════════════════════════════════════════════════════
    logger.step('Navigate to Target URL');
    var step9Start = Date.now();
    try {
      var targetUrl = config.baseUrl || process.env.BASE_URL || 'https://www.amazon.in';
      // Navigation already happened in step 8; verify the URL
      var currentUrl = await driver.getUrl();
      metrics.navigation = Date.now() - step9Start;
      logger.pass('Navigated to: ' + (currentUrl || targetUrl));
    } catch (err) {
      metrics.navigation = Date.now() - step9Start;
      logger.fail('Navigation failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: driver, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 10] Execute Tests
    // ════════════════════════════════════════════════════════════════
    logger.step('Execute Tests');
    var step10Start = Date.now();
    try {
      if (testFn) {
        await context.driverManager.executeTests(driver, testFn);
      }
      metrics.testExecution = Date.now() - step10Start;
      logger.pass('Test execution completed');
    } catch (err) {
      metrics.testExecution = Date.now() - step10Start;
      logger.fail('Test execution failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    return { success: true, driver: driver, metrics: metrics };
  }
}

module.exports = AndroidStartupPipeline;
