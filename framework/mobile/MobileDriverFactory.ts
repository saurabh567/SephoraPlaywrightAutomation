import { TEST_PLATFORMS, normalizePlatform } from '../common/platforms';
import ExecutionMode from '../common/ExecutionMode';
import androidCapabilities from '../../mobile/capabilities/android.capabilities';
import androidNativeCapabilities from '../../mobile/capabilities/androidNativeCapabilities';
import androidWebCapabilities from '../../mobile/capabilities/androidWebCapabilities';
import iosCapabilities from '../../mobile/capabilities/ios.capabilities';
/**
 * MobileDriverFactory.js
 *
 * Factory for creating Appium driver sessions.
 *
 * ══════════════════════════════════════════════════════════════════
 * IMPORTANT: This factory is the FALLBACK session creator.
 * The PRIMARY session creator is the lifecycle DriverManager
 * (mobile/lifecycle/DriverManager.js), which is used by the
 * StartupOrchestrator.
 *
 * This factory is used when:
 *   1. The lifecycle DriverManager delegates to it (backward compat)
 *   2. Standalone execution without the orchestrator
 * ══════════════════════════════════════════════════════════════════
 *
 * Capabilities are now separated:
 *   - ANDROID_NATIVE → androidNativeCapabilities (no browserName)
 *   - ANDROID_WEB    → androidWebCapabilities (no appPackage/activity)
 *   - IOS_NATIVE     → iosCapabilities (native)
 *   - IOS_WEB        → iosCapabilities (Safari)
 */


class MobileDriverFactory {
  /**
   * Get capabilities for the given platform.
   * Uses execution mode to determine native vs web capabilities.
   *
   * @param {string} platform - 'ANDROID' or 'IOS'
   * @returns {object} Capabilities object
   */
  static getCapabilities(platform: any) {
    const normalizedPlatform = normalizePlatform(platform);

    if (normalizedPlatform === TEST_PLATFORMS.ANDROID) {
      // Check execution mode to determine which capabilities to use
      if (ExecutionMode.isAndroidNative()) {
        return androidNativeCapabilities();
      }
      if (ExecutionMode.isAndroidWeb()) {
        return androidWebCapabilities();
      }
      // Fallback: use old capability builder (backward compat)
      return androidCapabilities();
    }

    if (normalizedPlatform === TEST_PLATFORMS.IOS) {
      return iosCapabilities();
    }

    throw new Error(`Unsupported mobile platform: ${platform}`);
  }

  /**
   * Create a driver session via WebDriverIO remote.
   *
   * @param {object} config - Test configuration
   * @returns {Promise<object>} WebDriverIO driver
   */
  static async createDriver(config: any) {
    let remote;
    try {
      ({ remote } = require('webdriverio'));
    } catch (error: any) {
      throw new Error('Mobile execution requires webdriverio. Run: npm install');
    }

    var caps: any = this.getCapabilities(config.testPlatform);
    var executionMode = ExecutionMode.getExecutionMode();

    // Log capabilities
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   APPIUM SESSION CAPABILITIES              ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('  Execution mode: ' + executionMode);
    console.log('  Platform:  ' + config.testPlatform);
    console.log('  Appium:    ' + config.appium.protocol + '://' + config.appium.hostname + ':' + config.appium.port + config.appium.path);
    console.log('');

    // Log relevant capabilities
    for (var key in caps) {
      if (caps.hasOwnProperty(key) && caps[key] !== undefined) {
        console.log('  ' + key + ' = ' + JSON.stringify(caps[key]));
      }
    }
    console.log('');

    // Validate capability separation
    if (ExecutionMode.isAndroidNative()) {
      if (caps['appium:browserName']) {
        console.warn('[MobileDriverFactory] WARNING: Native capabilities should not include browserName');
        delete caps['appium:browserName'];
        delete caps.browserName;
      }
    }
    if (ExecutionMode.isAndroidWeb()) {
      if (caps['appium:appPackage']) {
        console.warn('[MobileDriverFactory] WARNING: Web capabilities should not include appPackage');
        delete caps['appium:appPackage'];
        delete caps['appium:appActivity'];
        delete caps['appium:appWaitActivity'];
        delete caps['appium:appWaitPackage'];
        delete caps['appium:appWaitDuration'];
        delete caps['appium:app'];
      }
    }

    return remote({
      protocol: config.appium.protocol,
      hostname: config.appium.hostname,
      port: config.appium.port,
      path: config.appium.path,
      logLevel: config.appium.logLevel,
      connectionRetryTimeout: config.appium.connectionRetryTimeout,
      connectionRetryCount: config.appium.connectionRetryCount,
      capabilities: caps,
    });
  }
}

export default MobileDriverFactory;
