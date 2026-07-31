/**
 * StartupOrchestrator.js — ENTERPRISE REFACTOR
 *
 * Single entry point for the mobile automation startup lifecycle.
 * Delegates to AndroidStartupPipeline for the deterministic 16-step sequence.
 *
 * Lifecycle (Android):
 *   [01] Validate Environment
 *   [02] Kill Stale Processes
 *   [03] Boot Emulator (no snapshots; ANDROID_AVD only)
 *   [04] Verify Device Connectivity
 *   [05] Verify App Installed
 *   [06] Start Appium Server
 *   [07] Verify Appium Health
 *   [08] Create Android Driver
 *   [09] Launch Amazon App
 *   [10] Initialize Application (first-run screens)
 *   [11] Verify Dashboard
 *   [12] Execute Tests (Cucumber)
 *
 * Key design:
 *   - All components injectable for testability
 *   - StepLogger for structured [STEP N] logs with timing
 *   - Every failure records root cause and phase
 *   - Deterministic polling — no arbitrary sleep()
 */

'use strict';

var path = require('path');
var StepLogger = require('./StepLogger');
var EnvironmentValidator = require('./EnvironmentValidator');
var DeviceManager = require('./DeviceManager');
var AppiumLifecycleManager = require('./AppiumLifecycleManager');
var DriverManager = require('./DriverManager');
var AndroidStartupPipeline = require('./AndroidStartupPipeline');
var IosStartupPipeline = require('./IosStartupPipeline');

class StartupOrchestrator {
  [key: string]: any;
  /**
   * @param {object} options
   * @param {string} options.platform - 'android' or 'ios'
   * @param {object} options.logger - Custom StepLogger
   * @param {object} options.envValidator - Custom EnvironmentValidator
   * @param {object} options.deviceManager - Custom DeviceManager
   * @param {object} options.appiumManager - Custom AppiumLifecycleManager
   * @param {object} options.wdaManager - Custom WdaLifecycleManager (iOS only)
   * @param {object} options.driverManager - Custom DriverManager
   * @param {object} options.config - Configuration (avdName, allowSnapshots, etc.)
   */
  constructor(options: any) {
    options = options || {};

    this.platform = (options.platform || process.env.TEST_PLATFORM || 'android').toLowerCase();
    this.config = options.config || {};

    // Core components (injectable)
    this.logger = options.logger || new StepLogger();
    this.envValidator = options.envValidator || EnvironmentValidator;
    this.deviceManager = options.deviceManager || DeviceManager;
    this.driverManager = options.driverManager || DriverManager;

    // Appium lifecycle
    this.appiumManager = options.appiumManager || new AppiumLifecycleManager({
      host: options.appiumHost || process.env.APPIUM_HOST,
      port: options.appiumPort || process.env.APPIUM_PORT,
      basePath: options.appiumBasePath || process.env.APPIUM_BASE_PATH,
      startTimeout: options.appiumTimeout || process.env.APPIUM_START_TIMEOUT,
      retryCount: options.appiumRetryCount || process.env.APPIUM_RETRY_COUNT
    });

    // WDA (iOS only)
    this.wdaManager = options.wdaManager || null;

    this._driver = null;
    this._pipelineResult = null;
    this._started = false;
  }

  /**
   * Start Android lifecycle.
   * @param {function} testFn - Async test function
   * @returns {Promise<{success:boolean, driver:object|null, metrics:object}>}
   */
  async startAndroid(testFn: any) {
    this.platform = 'android';
    return this._start(testFn);
  }

  /**
   * Start iOS lifecycle.
   * @param {function} testFn - Async test function
   * @returns {Promise<{success:boolean, driver:object|null, metrics:object}>}
   */
  async startIOS(testFn: any) {
    this.platform = 'ios';
    return this._start(testFn);
  }

  /**
   * Internal start — delegates to platform pipeline.
   */
  async _start(testFn: any) {
    this.logger.begin();

    var pipelineContext: Record<string, any> = {
      logger: this.logger,
      envValidator: this.envValidator,
      deviceManager: this.deviceManager,
      appiumManager: this.appiumManager,
      driverManager: this.driverManager,
      config: this.config,
      testFn: testFn || null
    };

    try {
      if (this.platform === 'android') {
        this._pipelineResult = await AndroidStartupPipeline.run(pipelineContext);
      } else if (this.platform === 'ios') {
        if (!this.wdaManager) {
          var WdaLifecycleManager = require('./WdaLifecycleManager');
          this.wdaManager = new WdaLifecycleManager({
            udid: this.config.udid || process.env.UDID
          });
        }
        pipelineContext.wdaManager = this.wdaManager;
        this._pipelineResult = await IosStartupPipeline.run(pipelineContext);
      } else {
        throw new Error('Unsupported platform: ' + this.platform);
      }
    } catch (err: any) {
      this.logger.fail('Pipeline error: ' + err.message);
      this._pipelineResult = {
        success: false,
        driver: null,
        metrics: this.logger.end()
      };
      return this._pipelineResult;
    }

    this._started = true;
    this._driver = this._pipelineResult ? this._pipelineResult.driver : null;

    // Print final summary
    this.logger.end();

    return this._pipelineResult;
  }

  /** @returns {object|null} */
  getDriver() {
    return this._driver;
  }

  /** @returns {object|null} */
  getResult() {
    return this._pipelineResult;
  }

  /** @returns {boolean} */
  isSuccessful() {
    return this._pipelineResult ? this._pipelineResult.success : false;
  }

  /**
   * Shutdown everything.
   * @param {boolean} force
   */
  async shutdown(force: any) {
    if (this._driver) {
      try {
        await this._driver.deleteSession();
      } catch (_: any) {}
      this._driver = null;
    }

    if (this.wdaManager) {
      try {
        await this.wdaManager.stop();
      } catch (_: any) {}
    }

    try {
      await this.appiumManager.stop(force);
    } catch (_: any) {}
  }

  /** Static convenience. */
  static async startAndroid(testFn: any, options: any) {
    var orch = new StartupOrchestrator(Object.assign({ platform: 'android' }, options));
    return orch.startAndroid(testFn);
  }

  /** Static convenience. */
  static async startIOS(testFn: any, options: any) {
    var orch = new StartupOrchestrator(Object.assign({ platform: 'ios' }, options));
    return orch.startIOS(testFn);
  }
}

export default StartupOrchestrator;
