/**
 * StartupOrchestrator.js
 *
 * Enterprise-grade StartupOrchestrator — the single entry point for the
 * mobile automation startup lifecycle.
 *
 * Responsibilities:
 *   1. Environment validation
 *   2. Device/emulator/simulator lifecycle
 *   3. Appium lifecycle
 *   4. WDA lifecycle (iOS only)
 *   5. Driver creation
 *   6. Browser/app launch
 *   7. Test execution
 *
 * Architecture:
 *   - Uses AndroidStartupPipeline and IosStartupPipeline for platform-specific
 *     deterministic sequences.
 *   - Centralised StepLogger for structured [STEP N] logs with timing metrics.
 *   - Every component is injectable for testability.
 *
 * Usage:
 *   const orchestrator = new StartupOrchestrator();
 *   const result = await orchestrator.startAndroid(myTestFunction);
 *   await orchestrator.shutdown();
 */

'use strict';

const path = require('path');
const StepLogger = require('./StepLogger');
const EnvironmentValidator = require('./EnvironmentValidator');
const DeviceManager = require('./DeviceManager');
const AppiumLifecycleManager = require('./AppiumLifecycleManager');
const DriverManager = require('./DriverManager');
const AndroidStartupPipeline = require('./AndroidStartupPipeline');
const IosStartupPipeline = require('./IosStartupPipeline');

class StartupOrchestrator {
  /**
   * Create a new StartupOrchestrator.
   *
   * @param {object} options - Configuration options
   * @param {string} options.platform - 'android' or 'ios'
   * @param {object} options.logger - Custom StepLogger (optional)
   * @param {object} options.envValidator - Custom EnvironmentValidator (optional)
   * @param {object} options.deviceManager - Custom DeviceManager (optional)
   * @param {object} options.appiumManager - Custom AppiumLifecycleManager (optional)
   * @param {object} options.wdaManager - Custom WdaLifecycleManager (optional)
   * @param {object} options.driverManager - Custom DriverManager (optional)
   * @param {object} options.config - Custom configuration
   */
  constructor(options) {
    options = options || {};

    this.platform = (options.platform || process.env.TEST_PLATFORM || 'android').toLowerCase();
    this.config = options.config || {};

    // Core components (injectable for testing)
    this.logger = options.logger || new StepLogger();
    this.envValidator = options.envValidator || EnvironmentValidator;
    this.deviceManager = options.deviceManager || DeviceManager;
    this.driverManager = options.driverManager || DriverManager;

    // Appium lifecycle manager
    this.appiumManager = options.appiumManager || new AppiumLifecycleManager({
      host: options.appiumHost || process.env.APPIUM_HOST,
      port: options.appiumPort || process.env.APPIUM_PORT,
      basePath: options.appiumBasePath || process.env.APPIUM_BASE_PATH,
      startTimeout: options.appiumTimeout || process.env.APPIUM_START_TIMEOUT,
      retryCount: options.appiumRetryCount || process.env.APPIUM_RETRY_COUNT
    });

    // WDA lifecycle manager (iOS only)
    this.wdaManager = options.wdaManager || null;

    this._driver = null;
    this._pipelineResult = null;
    this._started = false;
  }

  /**
   * Start the Android startup lifecycle.
   *
   * @param {function} testFn - Async test function to execute after startup
   * @returns {Promise<{success: boolean, driver: object|null, metrics: object}>}
   */
  async startAndroid(testFn) {
    this.platform = 'android';
    return this._start(testFn);
  }

  /**
   * Start the iOS startup lifecycle.
   *
   * @param {function} testFn - Async test function to execute after startup
   * @returns {Promise<{success: boolean, driver: object|null, metrics: object}>}
   */
  async startIOS(testFn) {
    this.platform = 'ios';
    return this._start(testFn);
  }

  /**
   * Start the platform-specific startup pipeline.
   *
   * @param {function} testFn - Async test function
   * @returns {Promise<{success: boolean, driver: object|null, metrics: object}>}
   */
  async _start(testFn) {
    this.logger.begin();

    var pipelineContext = {
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
        // Create WDA manager if not provided
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
    } catch (err) {
      this.logger.fail('Pipeline error: ' + err.message);
      this._pipelineResult = {
        success: false,
        driver: null,
        metrics: this.logger.end()
      };
      return this._pipelineResult;
    }

    this._started = true;
    this._driver = this._pipelineResult.driver;

    // Print the final summary
    this.logger.end();

    return this._pipelineResult;
  }

  /**
   * Get the created driver instance.
   * @returns {object|null}
   */
  getDriver() {
    return this._driver;
  }

  /**
   * Get pipeline execution result.
   * @returns {object|null}
   */
  getResult() {
    return this._pipelineResult;
  }

  /**
   * Check if startup was successful.
   * @returns {boolean}
   */
  isSuccessful() {
    return this._pipelineResult ? this._pipelineResult.success : false;
  }

  /**
   * Shutdown everything — stop Appium, WDA, and clean up driver.
   * @param {boolean} force - Force stop even if autoStop is disabled
   */
  async shutdown(force) {
    // Delete driver session first
    if (this._driver) {
      try {
        await this.driverManager.deleteSession(this._driver);
      } catch (_) {}
      this._driver = null;
    }

    // Stop WDA (iOS only)
    if (this.wdaManager) {
      try {
        await this.wdaManager.stop();
      } catch (_) {}
    }

    // Stop Appium
    try {
      await this.appiumManager.stop(force);
    } catch (_) {}
  }

  /**
   * Static convenience method — start Android in one call.
   * @param {function} testFn
   * @param {object} options
   * @returns {Promise<object>}
   */
  static async startAndroid(testFn, options) {
    var orchestrator = new StartupOrchestrator(Object.assign({ platform: 'android' }, options));
    var result = await orchestrator.startAndroid(testFn);
    return result;
  }

  /**
   * Static convenience method — start iOS in one call.
   * @param {function} testFn
   * @param {object} options
   * @returns {Promise<object>}
   */
  static async startIOS(testFn, options) {
    var orchestrator = new StartupOrchestrator(Object.assign({ platform: 'ios' }, options));
    var result = await orchestrator.startIOS(testFn);
    return result;
  }
}

module.exports = StartupOrchestrator;
