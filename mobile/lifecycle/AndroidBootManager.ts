import DeviceManager from './DeviceManager';
/**
 * AndroidBootManager.js — ENTERPRISE REFACTOR
 *
 * Lightweight backward-compatible wrapper around the new DeviceManager.
 *
 * DEPRECATED: New code should use DeviceManager.bootAndVerifyEmulator() directly.
 * This class is kept for backward compatibility and delegates all logic to
 * DeviceManager.js for consistency.
 *
 * Breaks from the old pattern:
 *   - NO emulator launch logic (delegated to DeviceManager)
 *   - NO hardcoded AVD fallback
 *   - NO arbitrary sleep() calls
 *   - Uses deterministic polling with configurable timeouts
 */

'use strict';


// ── Defaults ─────────────────────────────────────────────────
const ADB_DEVICE_TIMEOUT     = 180000;
const BOOT_COMPLETED_TIMEOUT = 180000;
const POLL_INTERVAL          = 2000;
const LAUNCHER_TIMEOUT       = 60000;

const AMAZON_PACKAGE         = 'in.amazon.mShop.android.shopping';

class AndroidBootManager {

  /**
   * Wait for Android boot to complete — full lifecycle.
   *
   * Delegates to DeviceManager.bootAndVerifyEmulator().
   *
   * @param {object} options
   * @param {number} options.adbTimeout
   * @param {number} options.bootTimeout
   * @param {number} options.pmTimeout
   * @param {number} options.launcherTimeout
   * @param {number} options.pollInterval
   * @param {string} options.appPackage
   * @param {boolean} options.skipLauncherCheck
   * @returns {Promise<{serial:string, bootTime:number}>}
   */
  static async waitForBoot(options: any) {
    options = options || {};
    const adbTimeout      = options.adbTimeout      || ADB_DEVICE_TIMEOUT;
    const bootTimeout     = options.bootTimeout     || BOOT_COMPLETED_TIMEOUT;
    const pollInterval    = options.pollInterval    || POLL_INTERVAL;
    const skipLauncher    = options.skipLauncherCheck === true;

    console.log('');
    console.log('[AndroidBootManager] DEPRECATED — delegating to DeviceManager.bootAndVerifyEmulator()');
    console.log('');

    var avdName = process.env.ANDROID_AVD || process.env.ANDROID_AVD_NAME || '';

    if (!avdName) {
      throw new Error(
        '[AndroidBootManager] ANDROID_AVD not set. ' +
        'Configure it in .env.android or set the ANDROID_AVD environment variable.'
      );
    }

    var result = await DeviceManager.bootAndVerifyEmulator({
      avdName:       avdName,
      bootTimeout:   bootTimeout,
      pollInterval:  pollInterval,
      skipLauncher:  skipLauncher
    });

    // Verify app installation (backward compat)
    var appPackage = options.appPackage || process.env.APP_PACKAGE || AMAZON_PACKAGE;
    if (process.env.APP_PACKAGE || process.env.APP_PATH) {
      try {
        console.log('[AndroidBootManager] Verifying application: ' + appPackage);
        DeviceManager.verifyApplicationInstalled(appPackage);
      } catch (err: any) {
        throw new Error('[AndroidBootManager] ' + err.message);
      }
    }

    return { serial: result.serial, bootTime: result.bootTime };
  }

  // ── Backward-compatible static references ────────────────
  static ensureAdbServer()       { DeviceManager._ensureAdbServer(); }
  static unlockDevice(serial: any)    { DeviceManager._unlockDevice(serial); }
  static verifyApplicationInstalled(pkg: any) { DeviceManager.verifyApplicationInstalled(pkg); }

  static _exec(cmd: any, timeout: any)     { return DeviceManager._exec(cmd, timeout); }
  static _sleep(ms: any)              { return DeviceManager._sleep(ms); }
  static _parseAdbDevices(out: any)   { return DeviceManager._parseAdbDevices(out); }
  static _collectDiagnostics(l: any)  { DeviceManager._collectDiagnostics(l); }
  static _collectLaunchDiagnostics(pkg: any) { DeviceManager._collectDiagnostics('launch-' + pkg); }
  static _waitForPackageForeground() { return Promise.resolve(false); }
  static _handlePreAppiumCleanup() {}
}

export default AndroidBootManager;
