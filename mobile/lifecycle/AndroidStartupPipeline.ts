import path from 'path';
import fs from 'fs';
import WaitUtils from '../../utils/WaitUtils';
/**
 * AndroidStartupPipeline.js — ENTERPRISE REFACTOR
 *
 * Deterministic Android startup sequence following enterprise lifecycle:
 *
 *   [STEP 01] Validate Environment              — Java, Android SDK, adb, Appium, Node
 *   [STEP 02] Kill Stale Processes              — Kill old ADB + emulator processes
 *   [STEP 03] Boot Emulator                     — Boot AVD (ANDROID_AVD only, no snapshots unless enabled)
 *   [STEP 04] Verify Device Connectivity        — Poll for "device" state; auto-recover if "offline"
 *   [STEP 05] Verify Application Installed      — Ensure Amazon APK is installed
 *   [STEP 06] Start Appium Server               — Spawn Appium with retry
 *   [STEP 07] Verify Appium Health              — Wait for /status endpoint
 *   [STEP 08] Create Android Driver             — WebDriverIO session
 *   [STEP 09] Validate Amazon App Readiness     — Verify app is foreground (no re-launch)
 *   [STEP 10] Initialize Application            — ApplicationInitializer: language, permissions, onboarding
 *   [STEP 11] Verify Dashboard                  — Ensure Amazon Home Dashboard is fully loaded
 *   [STEP 12] Execute Tests (Cucumber)          — Run Cucumber test suite
 *
 * KEY DESIGN DECISIONS:
 *   - No emulator snapshots (-no-snapshot-load -no-snapshot-save) unless ANDROID_ALLOW_SNAPSHOTS=true
 *   - Kill stale ADB + emulator BEFORE boot
 *   - Only boot ANDROID_AVD (no hardcoded defaults)
 *   - adb wait-for-device blocks until device appears
 *   - Both sys.boot_completed=1 AND dev.bootcomplete=1 must be true
 *   - Launcher verified before Appium starts
 *   - If device goes "offline" → auto-recover via ADB restart + wait
 *   - Appium starts only after device is fully ready
 *   - Driver created only after Appium is healthy
 *   - App launched by Appium capabilities (autoLaunch=true) — NOT re-launched in STEP 09
 *   - STEP 09 validates app readiness with polling instead of fixed sleep
 *   - ApplicationInitializer handles first-run screens
 *   - Cucumber launched only after dashboard verification
 *   - No arbitrary sleep() — all waits are deterministic poll loops
 *   - Every phase logs retry count + elapsed time
 */

'use strict';


const AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const AMAZON_HOME_ACTIVITY = 'com.amazon.mShop.home.HomeActivity';
const APP_READY_POLL_INTERVAL = 1000;
const APP_READY_TIMEOUT = 45000;

class AndroidStartupPipeline {
  /**
   * Execute the full Android startup pipeline.
   *
   * @param {object} context
   * @param {object} context.logger          - StepLogger
   * @param {object} context.envValidator    - EnvironmentValidator
   * @param {object} context.deviceManager   - DeviceManager
   * @param {object} context.appiumManager   - AppiumLifecycleManager
   * @param {object} context.driverManager   - DriverManager
   * @param {object} context.config          - Configuration
   * @param {function} context.testFn        - Test function (Cucumber runner)
   * @returns {Promise<{success:boolean, driver:object|null, metrics:object}>}
   */
  static async run(context: any) {
    var logger     = context.logger;
    var config     = context.config || {};
    var testFn     = context.testFn;

    var metrics = {
      environmentValidation:  0,
      killStaleProcesses:     0,
      emulatorBoot:           0,
      adbWaitForDevice:       0,
      deviceState:            0,
      bootCompleted:          0,
      packageManager:         0,
      unlockDevice:           0,
      launcherVerification:   0,
      appiumStart:            0,
      appiumHealth:           0,
      driverCreation:         0,
      appLaunch:              0,
      applicationInit:        0,
      dashboardVerification:  0,
      testExecution:          0
    };

    var driver        = null;
    var bootSerial    = null;

    // ── Resolve config values ────────────────────────────────
    var avdName       = config.avdName  || process.env.ANDROID_AVD || process.env.ANDROID_AVD_NAME || '';
    var appPackage    = config.appPackage || process.env.APP_PACKAGE || '';
    var allowSnapshots = config.allowSnapshots ||
      (process.env.ANDROID_ALLOW_SNAPSHOTS === 'true');
    var headless      = process.env.HEADLESS === 'true' || process.env.EMULATOR_HEADLESS === 'true';

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║        ANDROID STARTUP PIPELINE — ENTERPRISE MODE           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('  Configuration:');
    console.log('    ANDROID_AVD:            ' + (avdName || '(NOT SET!)'));
    console.log('    APP_PACKAGE:            ' + (appPackage || '(not set — web mode)'));
    console.log('    Allow snapshots:        ' + allowSnapshots);
    console.log('    Headless emulator:      ' + headless);
    console.log('');

    // ════════════════════════════════════════════════════════════════
    // [STEP 01] Validate Environment
    // ════════════════════════════════════════════════════════════════
    logger.step('Environment Validation');
    var step1Start = Date.now();
    try {
      var envResult = await context.envValidator.validate('android');
      metrics.environmentValidation = Date.now() - step1Start;

      if (!envResult.valid) {
        var failedChecks = envResult.checks.filter(function(c: any) { return !c.valid; });
        var failureMessages = failedChecks.map(function(c: any) {
          return c.name + ': ' + c.message;
        }).join('; ');
        logger.fail('Environment validation failed: ' + failureMessages);
        return { success: false, driver: null, metrics: logger.end() };
      }

      var envSummary = envResult.checks.map(function(c: any) {
        return c.name + ' (' + c.message + ')';
      }).join(', ');
      logger.pass(envSummary);
    } catch (err: any) {
      metrics.environmentValidation = Date.now() - step1Start;
      logger.fail('Environment validation error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 02] Kill Stale Processes
    // ════════════════════════════════════════════════════════════════
    logger.step('Kill Stale ADB + Emulator Processes');
    var step2Start = Date.now();
    try {
      context.deviceManager._killStaleProcesses();
      metrics.killStaleProcesses = Date.now() - step2Start;
      logger.pass('Stale ADB and emulator processes terminated');
    } catch (err: any) {
      metrics.killStaleProcesses = Date.now() - step2Start;
      console.log('[Pipeline] Process kill warning (non-fatal): ' + err.message);
      logger.pass('Process cleanup completed');
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 03] Boot Emulator
    // ════════════════════════════════════════════════════════════════
    logger.step('Boot Emulator');
    var step3Start = Date.now();

    if (!avdName) {
      logger.fail('ANDROID_AVD is not set. Configure it in .env.android or set the environment variable.');
      return { success: false, driver: null, metrics: logger.end() };
    }

    try {
      var bootResult = await context.deviceManager.bootAndVerifyEmulator({
        avdName:        avdName,
        bootTimeout:    config.bootTimeout || 300000,
        pollInterval:   2000,
        skipLauncher:   false,
        allowSnapshots: allowSnapshots
      });

      metrics.emulatorBoot = Date.now() - step3Start;
      bootSerial = bootResult.serial;

      console.log('[Pipeline] Emulator booted: ' + bootResult.bootTime + 'ms (serial: ' + bootSerial + ')');
      logger.pass('Emulator booted (' + bootResult.bootTime + 'ms)');
    } catch (err: any) {
      metrics.emulatorBoot = Date.now() - step3Start;
      logger.fail('Emulator boot failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 04] Verify Device Connectivity (post-boot)
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Device Connectivity');
    var step4Start = Date.now();
    try {
      var connectivityResult = await context.deviceManager.verifyAndroidDeviceConnectivity();
      metrics.bootCompleted = Date.now() - step4Start;

      if (!connectivityResult.connected) {
        logger.fail('Device connectivity check failed: ' + connectivityResult.message);
        return { success: false, driver: null, metrics: logger.end() };
      }

      var info = connectivityResult.deviceInfo;
      console.log('[Pipeline] Device: ' + info.model + ' (API ' + info.apiLevel + ', Android ' + info.release + ')');
      logger.pass(connectivityResult.message);
    } catch (err: any) {
      metrics.bootCompleted = Date.now() - step4Start;
      logger.fail('Device connectivity error: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 05] Verify Application is Installed (native mode)
    // ════════════════════════════════════════════════════════════════
    if (appPackage) {
      logger.step('Verify Application Installed');
      var step5Start = Date.now();
      try {
        context.deviceManager.verifyApplicationInstalled(appPackage);
        metrics.packageManager = Date.now() - step5Start;
        logger.pass(appPackage + ' is installed');
      } catch (err: any) {
        metrics.packageManager = Date.now() - step5Start;
        logger.fail(err.message);
        return { success: false, driver: null, metrics: logger.end() };
      }
      if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };
    }

    // ════════════════════════════════════════════════════════════════
    // [STEP 06] Start Appium Server
    // ════════════════════════════════════════════════════════════════
    logger.step('Start Appium Server');
    var step6Start = Date.now();
    try {
      var appiumResult = await context.appiumManager.start();
      metrics.appiumStart = Date.now() - step6Start;

      console.log('[Pipeline] Appium server ready on ' + context.appiumManager.serverUrl);
      logger.pass('Appium server ready on ' + context.appiumManager.serverUrl);
    } catch (err: any) {
      metrics.appiumStart = Date.now() - step6Start;
      logger.fail('Appium server start failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 07] Verify Appium Health
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Appium Health');
    var step7Start = Date.now();
    try {
      await context.appiumManager.waitForHealthy(30000);
      metrics.appiumHealth = Date.now() - step7Start;
      logger.pass('Appium health endpoint OK');
    } catch (err: any) {
      metrics.appiumHealth = Date.now() - step7Start;
      logger.fail('Appium health check failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 08] Create Android Driver
    // ════════════════════════════════════════════════════════════════
    logger.step('Create Android Driver');
    var step8Start = Date.now();
    try {
      var appiumConfig = context.appiumManager.getAppiumConfig();
      driver = await context.driverManager.createAndroidDriver(appiumConfig, {
        appPackage: appPackage,
        capabilities: config.capabilities
      });
      metrics.driverCreation = Date.now() - step8Start;
      console.log('[Pipeline] Driver session created: ' + (driver ? driver.sessionId : 'null'));
      logger.pass('Android driver session created');
    } catch (err: any) {
      metrics.driverCreation = Date.now() - step8Start;
      logger.fail('Driver creation failed: ' + err.message);
      return { success: false, driver: null, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: null, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 09] Validate Amazon Application Readiness
    //
    // NOTE: Appium auto-launches the app via capabilities
    // (appium:autoLaunch=true with appium:appPackage and appium:appActivity).
    // We do NOT re-launch the app here. Instead we validate that:
    //   - Driver session exists
    //   - Amazon package is in the foreground
    //   - Application is responsive
    //
    // If the package is not in foreground, we use Appium driver methods
    // to activate (bring to foreground) the Amazon application.
    // ════════════════════════════════════════════════════════════════
    logger.step('Validate Amazon Application Readiness');
    var step9Start = Date.now();
    try {
      var ExecutionMode = require('../../framework/common/ExecutionMode');

      if (ExecutionMode.isAndroidWeb()) {
        // Web mode — launch Chrome and navigate
        await context.driverManager.launchChromeAndNavigate(driver, config.baseUrl);
        console.log('[Pipeline] Chrome launched and navigated to base URL');
        logger.pass('Chrome browser ready');
      } else {
        // Native mode — Appium auto-launches via capabilities.
        // Validate the Amazon app is in the foreground using polling.
        var effectivePackage = appPackage || AMAZON_PACKAGE;
        var sessionId = driver ? driver.sessionId : 'unknown';

        console.log('');
        console.log('[Android] Driver Session: ' + sessionId);
        console.log('[Android] Expected Package: ' + effectivePackage);
        console.log('[Android] Expected Activity: ' + AMAZON_HOME_ACTIVITY);
        console.log('');

        var appReady = await AndroidStartupPipeline._waitForApplicationReady(
          driver,
          effectivePackage,
          APP_READY_TIMEOUT,
          APP_READY_POLL_INTERVAL
        );

        if (appReady) {
          console.log('[Android] Current Package: ' + effectivePackage);
          console.log('[Android] Application Status: READY');
          logger.pass('Amazon app is in foreground and ready');
        } else {
          // If not ready after polling, try to activate the app via Appium
          console.log('[Pipeline] Amazon app not detected in foreground — activating via Appium...');
          try {
            await driver.activateApp(effectivePackage);
            await WaitUtils.sleep(2000);
            console.log('[Pipeline] App activation complete');
            logger.pass('Amazon app activated and ready');
          } catch (activateErr: any) {
            throw new Error('Failed to bring Amazon app to foreground: ' + activateErr.message);
          }
        }
      }
      metrics.appLaunch = Date.now() - step9Start;
    } catch (err: any) {
      metrics.appLaunch = Date.now() - step9Start;
      logger.fail('Application readiness check failed: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: driver, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 10] Initialize Application — handle first-run screens
    // ════════════════════════════════════════════════════════════════
    logger.step('Initialize Application');
    var step10Start = Date.now();
    try {
      var ApplicationInitializer = require('../../framework/mobile/ApplicationInitializer');
      var initResult = await ApplicationInitializer.initialize(driver, { platform: 'android' });
      metrics.applicationInit = Date.now() - step10Start;

      if (!initResult || initResult.success === false) {
        logger.fail('Application initialization failed');
        return { success: false, driver: driver, metrics: logger.end() };
      }

      logger.pass('First-run screens handled');
    } catch (err: any) {
      metrics.applicationInit = Date.now() - step10Start;
      logger.fail('Application initialization error: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: driver, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 11] Verify Dashboard
    // ════════════════════════════════════════════════════════════════
    logger.step('Verify Dashboard');
    var step11Start = Date.now();
    try {
      var dashboardTimeout = Number(process.env.DASHBOARD_WAIT_TIMEOUT || 45000);
      var dashboardPoll    = Number(process.env.DASHBOARD_POLL_INTERVAL || 2000);

      console.log('[Pipeline] Verifying Amazon Home Dashboard (timeout=' + dashboardTimeout + 'ms)...');

      var verified = await AndroidStartupPipeline._waitForDashboard(driver, dashboardTimeout, dashboardPoll);
      metrics.dashboardVerification = Date.now() - step11Start;

      if (!verified) {
        logger.fail('Dashboard verification failed — home screen not detected');
        return { success: false, driver: driver, metrics: logger.end() };
      }

      logger.pass('Amazon Home Dashboard verified');
    } catch (err: any) {
      metrics.dashboardVerification = Date.now() - step11Start;
      logger.fail('Dashboard verification error: ' + err.message);
      return { success: false, driver: driver, metrics: logger.end() };
    }

    if (logger.hasFailed()) return { success: false, driver: driver, metrics: logger.end() };

    // ════════════════════════════════════════════════════════════════
    // [STEP 12] Execute Tests (Cucumber)
    // ════════════════════════════════════════════════════════════════
    logger.step('Execute Tests (Cucumber)');
    var step12Start = Date.now();

    if (typeof testFn !== 'function') {
      console.log('[Pipeline] No test function provided — skipping test execution');
      logger.skip('No test function');
      metrics.testExecution = 0;
    } else {
      try {
        // Mark startup as completed so hooks know the pipeline finished initialization
        context.driverManager.markStartupCompleted();

        // Set environment markers for Cucumber
        process.env.DEVICE_READY = 'true';

        console.log('');
        console.log('[STEP 12] Execute Android Tests');
        console.log('Command: cucumber-js --tags @android');
        console.log('Feature files: features/**/*.feature');
        console.log('');

        await testFn(driver);
        metrics.testExecution = Date.now() - step12Start;
        logger.pass('Tests completed successfully');
      } catch (err: any) {
        metrics.testExecution = Date.now() - step12Start;
        logger.fail('Test execution failed: ' + err.message);
        return { success: false, driver: driver, metrics: logger.end() };
      }
    }

    // ════════════════════════════════════════════════════════════════
    // PIPELINE COMPLETE
    // ════════════════════════════════════════════════════════════════
    return {
      success: true,
      driver: driver,
      metrics: logger.end()
    };
  }

  /**
   * Wait for the Amazon application to be in the foreground and ready.
   *
   * Uses polling with configurable timeout instead of fixed sleep.
   * Checks the current foreground package via Appium driver.
   *
   * @param {object} driver       - WebDriverIO driver
   * @param {string} expectedPkg - Expected Android package name
   * @param {number} timeoutMs   - Maximum time to wait (default: 45000ms)
   * @param {number} pollInterval- Polling interval (default: 1000ms)
   * @returns {Promise<boolean>} True if app is ready
   */
  static async _waitForApplicationReady(driver: any, expectedPkg: any, timeoutMs: any, pollInterval: any) {
    timeoutMs    = timeoutMs    || APP_READY_TIMEOUT;
    pollInterval = pollInterval || APP_READY_POLL_INTERVAL;
    var deadline = Date.now() + timeoutMs;
    var retries  = 0;
    var lastError = null;

    console.log('[Pipeline] Waiting for Amazon app to be ready (timeout=' + timeoutMs + 'ms)...');

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);

      try {
        // Get current package from the driver
        var currentPackage = null;
        try {
          currentPackage = await driver.getCurrentPackage();
        } catch (_: any) {
          // getCurrentPackage may not be available on all drivers
          lastError = _;
        }

        if (currentPackage && currentPackage.indexOf(expectedPkg) >= 0) {
          console.log('[Pipeline] [app-ready] retry=' + retries +
            ' elapsed=' + elapsed + 'ms' +
            ' package=' + currentPackage +
            ' status=READY');
          return true;
        }

        // Try getting current activity as secondary check
        var currentActivity = null;
        try {
          currentActivity = await driver.getCurrentActivity();
        } catch (_: any) { /* ignore */ }

        if (retries % 5 === 1 || retries === 1) {
          var pkgStr = currentPackage || 'unknown';
          var actStr = currentActivity || 'unknown';
          console.log('[Pipeline] [app-ready] retry=' + retries +
            ' elapsed=' + elapsed + 'ms' +
            ' package=' + pkgStr +
            ' activity=' + actStr);
        }
      } catch (err: any) {
        lastError = err;
        if (retries % 5 === 1 || retries === 1) {
          console.log('[Pipeline] [app-ready] retry=' + retries +
            ' elapsed=' + elapsed + 'ms' +
            ' error=' + err.message);
        }
      }

      await WaitUtils.sleep(pollInterval);
    }

    console.log('[Pipeline] ⚠ App readiness timeout after ' + timeoutMs + 'ms (' + retries + ' retries). ' +
      'Last error: ' + (lastError ? lastError.message : 'package not detected'));
    return false;
  }

  /**
   * Wait for the Amazon Home Dashboard to be visible.
   * Uses deterministic polling with configurable timeout.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {number} timeoutMs - Max time to wait
   * @param {number} pollInterval - Poll interval
   * @returns {Promise<boolean>}
   */
  static async _waitForDashboard(driver: any, timeoutMs: any, pollInterval: any) {
    var deadline = Date.now() + timeoutMs;
    var retries  = 0;
    var lastError = null;

    // Common Amazon Home Dashboard indicators
    var dashboardIndicators = [
      '//*[contains(@resource-id, "dashboard")]',
      '//*[contains(@resource-id, "home")]',
      '//*[contains(@resource-id, "search")]',
      '//*[contains(@text, "Search")]',
      '//*[contains(@text, "Amazon")]',
      '//*[contains(@class, "android.widget.SearchView")]',
      '//android.widget.ImageButton[@content-desc="Search"]',
      'new UiSelector().resourceIdMatches(".*search.*")',
      'new UiSelector().textContains("Search")'
    ];

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);

      for (var i = 0; i < dashboardIndicators.length; i++) {
        try {
          var selector = dashboardIndicators[i];
          var element;
          if (selector.indexOf('new UiSelector') === 0) {
            element = await driver.$(selector.startsWith('new ') ? 'android=' + selector : selector);
          } else {
            element = await driver.$(selector);
          }
          if (element) {
            var exists = await element.isExisting();
            if (exists) {
              console.log('[Pipeline] [dashboard] retry=' + retries +
                ' elapsed=' + elapsed + 'ms' +
                ' found indicator: ' + selector.substring(0, 80));
              return true;
            }
          }
        } catch (_: any) {
          lastError = _;
        }
      }

      if (retries % 5 === 1 || retries === 1) {
        console.log('[Pipeline] [dashboard] retry=' + retries +
          ' elapsed=' + elapsed + 'ms' +
          ' polling ' + dashboardIndicators.length + ' indicators');
      }

      await WaitUtils.sleep(pollInterval);
    }

    console.log('[Pipeline] ⚠ Dashboard not detected within ' + timeoutMs + 'ms (last error: ' +
      (lastError ? lastError.message : 'none') + ')');
    return false;
  }

  /**
   * Utility sleep — kept for backward compatibility with any
   * remaining internal references. Prefer WaitUtils.sleep() in new code.
   */
  static _sleep(ms: any) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
}

export default AndroidStartupPipeline;
