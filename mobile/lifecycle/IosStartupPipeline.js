/**
 * IosStartupPipeline.js
 *
 * Deterministic iOS startup sequence following enterprise lifecycle:
 *
 *   [STEP 01] Validate Environment    — Xcode, xcodebuild, simctl, Appium, Node
 *   [STEP 02] Detect Simulator        — simctl list with retry
 *   [STEP 03] Boot Simulator          — Boot simulator, wait for boot completed
 *   [STEP 04] Unlock Simulator        — Dismiss lock screen
 *   [STEP 05] Verify/Install WDA      — Check WebDriverAgent presence
 *   [STEP 06] Build WDA (if required) — xcodebuild with retry
 *   [STEP 07] Launch WDA              — Start WDA on simulator
 *   [STEP 08] Verify WDA Health       — Wait for WDA health endpoint
 *   [STEP 09] Start Appium Server     — Spawn Appium with retry
 *   [STEP 10] Verify Appium Health    — Wait for /status endpoint
 *   [STEP 11] Create iOS Driver       — WebDriverIO Safari session
 *   [STEP 12] Launch Safari           — Open browser
 *   [STEP 13] Navigate to Target URL  — Go to BASE_URL
   [STEP 14] Initialize Application  — Navigate to Dashboard
   [STEP 15] Execute Tests           — Run test function
 *   [STEP 15] Execute Tests           — Run test function
 *
 * Strict ordering ensures no browser/app launches before:
 *   - Environment validation completes
 *   - Appium is healthy
 *   - WDA is healthy
 *   - Driver creation starts
 */

'use strict';

const path = require('path');

class IosStartupPipeline {
  /**
   * Execute the full iOS startup pipeline.
   *
   * @param {object} context - Pipeline context
   * @param {object} context.logger - StepLogger instance
   * @param {object} context.envValidator - EnvironmentValidator
   * @param {object} context.deviceManager - DeviceManager
   * @param {object} context.wdaManager - WdaLifecycleManager
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
      simulatorDetection: 0,
      simulatorBoot: 0,
      simulatorUnlock: 0,
      wdaVerification: 0,
      wdaBuild: 0,
      wdaLaunch: 0,
      wdaHealth: 0,
      appiumStart: 0,
      appiumHealth: 0,
      driverCreation: 0,
      safariLaunch: 0,
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
      var envResult = await context.envValidator.validate('ios');
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
    // [STEP 02] Detect Simulator
    // ════════════════════════════════════════════════════════════════
    logger.step('Detect Simulator');
    var step2Start = Date.now();
    try {
      var simResult = await context.deviceManager.detectIOSSimulator({
        udid: config.udid || process.env.UDID
      });
      metrics.simulatorDetection = Date.now() - step2Start;

      if (!simResult.detected) {
        logger.fail('No iOS simulator found: ' + simResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      var simInfo = simResult.simulators.map(function(s) {
        return s.name + ' (' + s.udid + ') [' + s.state + ']';
      }).join(', ');
      logger.pass(simResult.message + ' (' + simInfo + ')');

      // Store the UDID for later steps
      if (simResult.simulators.length > 0 && !config.udid) {
        config.udid = simResult.simulators[0].udid;
        if (context.wdaManager) {
          context.wdaManager.udid = config.udid;
        }
      }
    } catch (err) {
      metrics.simulatorDetection = Date.now() - step2Start;
      logger.fail('Simulator detection error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 03] Boot Simulator (if needed)
    // ════════════════════════════════════════════════════════════════
    logger.step('Boot Simulator');
    var step3Start = Date.now();
    try {
      var bootResult = await context.deviceManager.bootIOSSimulator(
        config.udid,
        180000
      );
      metrics.simulatorBoot = Date.now() - step3Start;

      if (!bootResult.booted) {
        logger.fail('Simulator boot failed: ' + bootResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      logger.pass(bootResult.message + ' (' + bootResult.bootTime + 'ms)');
    } catch (err) {
      metrics.simulatorBoot = Date.now() - step3Start;
      logger.fail('Simulator boot error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 04] Unlock Simulator
    // ════════════════════════════════════════════════════════════════
    logger.step('Unlock Simulator');
    var step4Start = Date.now();
    try {
      await context.deviceManager.unlockIOSSimulator(config.udid);
      metrics.simulatorUnlock = Date.now() - step4Start;
      logger.pass('Simulator unlocked');
    } catch (err) {
      metrics.simulatorUnlock = Date.now() - step4Start;
      logger.fail('Simulator unlock failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 05] Verify WDA Installation
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify WebDriverAgent Installation');
    var step5Start = Date.now();
    try {
      var wdaProject = context.wdaManager.findWdaProjectPath();
      metrics.wdaVerification = Date.now() - step5Start;

      if (!wdaProject) {
        logger.fail('WebDriverAgent.xcodeproj not found. Install appium-xcuitest-driver.');
        return { success: false, driver: null, metrics: logger.end() };
      }

      var builtStatus = context.wdaManager.isBuilt();
      var statusMsg = 'WDA found at ' + wdaProject;
      if (builtStatus) {
        statusMsg += ' (already built)';
      } else {
        statusMsg += ' (needs build)';
      }
      logger.pass(statusMsg);
    } catch (err) {
      metrics.wdaVerification = Date.now() - step5Start;
      logger.fail('WDA verification error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 06] Build WDA (only if required)
    // ════════════════════════════════════════════════════════════════
    logger.step('Build WebDriverAgent');
    var step6Start = Date.now();
    if (!context.wdaManager.isBuilt()) {
      try {
        var buildResult = await context.wdaManager.build();
        metrics.wdaBuild = Date.now() - step6Start;

        if (!buildResult.built) {
          logger.fail('WDA build failed: ' + buildResult.message);
          return { success: false, driver: null, metrics: logger.end() };
        }

        logger.pass(buildResult.message + ' (' + buildResult.duration + 'ms)');
      } catch (err) {
        metrics.wdaBuild = Date.now() - step6Start;
        logger.fail('WDA build error: ' + err.message);
        return { success: false, driver: null, metrics: logger.end() };
      }
    } else {
      logger.skip('Already built');
      metrics.wdaBuild = 0;
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 07] Launch WDA
    // ════════════════════════════════════════════════════════════════
    logger.step('Launch WebDriverAgent');
    var step7Start = Date.now();
    try {
      var wdaLaunchResult = await context.wdaManager.launch();
      metrics.wdaLaunch = Date.now() - step7Start;

      if (!wdaLaunchResult.launched) {
        logger.fail('WDA launch failed: ' + wdaLaunchResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      logger.pass(wdaLaunchResult.message + ' (' + wdaLaunchResult.duration + 'ms)');
    } catch (err) {
      metrics.wdaLaunch = Date.now() - step7Start;
      logger.fail('WDA launch error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 08] Verify WDA Health
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify WDA Health');
    var step8Start = Date.now();
    try {
      var wdaHealthResult = await context.wdaManager.verifyHealth();
      metrics.wdaHealth = Date.now() - step8Start;

      if (!wdaHealthResult.verified) {
        logger.fail('WDA health check failed: ' + wdaHealthResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      logger.pass(wdaHealthResult.message);
    } catch (err) {
      metrics.wdaHealth = Date.now() - step8Start;
      logger.fail('WDA health error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 09] Start Appium Server
    // ════════════════════════════════════════════════════════════════
    logger.step('Start Appium Server');
    var step9Start = Date.now();
    try {
      var appiumResult = await context.appiumManager.start();
      metrics.appiumStart = Date.now() - step9Start;

      logger.pass('Appium server ready on ' + context.appiumManager.serverUrl +
        ' (attempts: ' + (appiumResult.startedByFramework ? 'started' : 'already-running') + ')');
    } catch (err) {
      metrics.appiumStart = Date.now() - step9Start;
      logger.fail('Appium server start failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 10] Verify Appium Health
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Appium Health');
    var step10Start = Date.now();
    try {
      await context.appiumManager.waitForHealthy(15000);
      metrics.appiumHealth = Date.now() - step10Start;
      logger.pass('Appium health endpoint OK');
    } catch (err) {
      metrics.appiumHealth = Date.now() - step10Start;
      logger.fail('Appium health check failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 11] Create iOS Driver
    // ════════════════════════════════════════════════════════════════
    logger.step('Create iOS Driver');
    var step11Start = Date.now();
    try {
      var appiumConfig = context.appiumManager.getAppiumConfig();
      driver = await context.driverManager.createIOSDriver(appiumConfig, {
        browserName: config.browserName || process.env.BROWSER_NAME || 'Safari',
        capabilities: config.capabilities
      });
      metrics.driverCreation = Date.now() - step11Start;
      logger.pass('iOS driver session created');
    } catch (err) {
      metrics.driverCreation = Date.now() - step11Start;
      logger.fail('Driver creation failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 12] Launch Safari
    // ════════════════════════════════════════════════════════════════
    logger.step('Launch Safari');
    var step12Start = Date.now();
    try {
      var targetUrl = config.baseUrl || process.env.BASE_URL || 'https://www.amazon.in';
      await context.driverManager.launchSafariAndNavigate(driver, targetUrl);
      metrics.safariLaunch = Date.now() - step12Start;
      logger.pass('Safari launched');
    } catch (err) {
      metrics.safariLaunch = Date.now() - step12Start;
      logger.fail('Safari launch failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: driver, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 13] Navigate to Target URL
    // ════════════════════════════════════════════════════════════════
    logger.step('Navigate to Target URL');
    var step13Start = Date.now();
    try {
      var currentUrl = await driver.getUrl();
      metrics.navigation = Date.now() - step13Start;
      logger.pass('Navigated to: ' + (currentUrl || targetUrl));
    } catch (err) {
      metrics.navigation = Date.now() - step13Start;
      logger.fail('Navigation failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) {
      return { success: false, driver: driver, metrics: logger.end() };
    }


    // ════════════════════════════════════════════════════════════════
    // [STEP 14] Initialize Application (navigate to Dashboard)
    //
    // ApplicationInitializer handles all startup screens on iOS:
    //   - Language selection (Safari web redirect)
    //   - Onboarding skip
    //   - Sign in skip
    //   - Permission dialogs
    //   - Promotional popups
    //   - Dashboard wait + verification
    //
    // IDEMPOTENT — safe for all user states. Retries up to
    // APP_INIT_MAX_RETRIES times if dashboard verification fails.
    // ════════════════════════════════════════════════════════════════
    console.log("[iOS-Pipeline] [STEP 14/16] Initializing application to dashboard...");
    logger.step("Initialize Application (navigate to Dashboard)");
    var initStart = Date.now();
    try {
      var ApplicationInitializer = require("../../framework/mobile/ApplicationInitializer");
      var initResult = await ApplicationInitializer.initialize(driver, { platform: "ios" });
      if (!initResult.success || !initResult.dashboardVerified) {
        console.log("[iOS-Pipeline] [FAIL] Application initialization failed after retries");
        logger.fail("Application initialization failed: dashboard not verified");
        return { success: false, driver: driver, metrics: logger.end() };
      }
      console.log("[iOS-Pipeline] [PASS] Application initialized and Dashboard verified (" +
        initResult.stepsCompleted.length + " steps)");
      logger.pass("Application initialized to Dashboard");
    } catch (err) {
      console.log("[iOS-Pipeline] [FAIL] Application initialization error: " + err.message);
      logger.fail("Application initialization error: " + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: driver, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 15] Execute Tests
    // ════════════════════════════════════════════════════════════════
    logger.step('Execute Tests');
    var step14Start = Date.now();
    try {
      if (testFn) {
        await context.driverManager.executeTests(driver, testFn);
      }
      metrics.testExecution = Date.now() - step14Start;
      logger.pass('Test execution completed');
    } catch (err) {
      metrics.testExecution = Date.now() - step14Start;
      logger.fail('Test execution failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    return { success: true, driver: driver, metrics: metrics };
  }
}

module.exports = IosStartupPipeline;
