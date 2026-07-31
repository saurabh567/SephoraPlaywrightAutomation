import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
/**
 * AppInstallationDetector.js
 *
 * Enterprise-grade Android app installation detector.
 *
 * REFACTORED — Does NOT launch the application.
 * Appium owns the app lifecycle.
 * ADB is only used for verification and diagnostics.
 *
 * Flow:
 *   APP_PATH exists?
 *     |
 *     +-- YES --> Verify APK exists --> Install APK --> Verify package
 *     |
 *     +-- NO  --> Verify package installed
 *                    |
 *                    +-- YES --> Return success (Appium will launch)
 *                    |
 *                    +-- NO  --> Throw meaningful error with actionable diagnostics
 *
 * Never terminates with a generic error. Always provides actionable diagnostics.
 */

'use strict';


class AppInstallationDetector {
  /**
   * Ensure the Android app is available on the device.
   * Does NOT launch the application -- Appium handles that.
   *
   * @param {string} appPackage - Android package name
   * @param {string} appPath - Optional path to APK file
   * @returns {{available: boolean, message: string, action: string, launched: boolean}}
   *   - launched is always false -- Appium handles launch
   */
  static ensureAppAvailable(appPackage: any, appPath: any) {
    if (!appPackage) {
      return {
        available: false,
        message: 'No appPackage provided. Set APP_PACKAGE environment variable.',
        action: 'error',
        launched: false
      };
    }

    appPath = appPath || process.env.APP_PATH || '';
    var appPathConfigured = appPath && appPath.trim().length > 0;

    console.log('');
    console.log('[AppInstallationDetector] Ensuring app availability');
    console.log('[AppInstallationDetector] Package: ' + appPackage);

    // STEP 1: Check ADB availability
    var adbAvailable = false;
    try {
      var adbCheck = execSync('adb get-state 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
      adbAvailable = adbCheck.length > 0 && adbCheck !== 'no-device';
    } catch (_: any) {
      adbAvailable = false;
    }

    if (!adbAvailable) {
      return {
        available: false,
        message: 'ADB not available. Cannot verify app installation. Ensure device/emulator is connected.',
        action: 'error',
        launched: false
      };
    }

    // PATH A: APP_PATH IS CONFIGURED
    if (appPathConfigured) {
      console.log('[APK] APP_PATH detected: ' + appPath);

      if (!fs.existsSync(appPath)) {
        return {
          available: false,
          message: 'APP_PATH "' + appPath + '" does not exist. Cannot install ' + appPackage + '.',
          action: 'error',
          launched: false
        };
      }

      console.log('[APK] APK exists at: ' + appPath);

      var alreadyInstalled = AppInstallationDetector._isPackageInstalled(appPackage);
      if (alreadyInstalled) {
        console.log('[APK] Package already installed - skipping installation');
        console.log('[APK] Package verified');
        return {
          available: true,
          message: appPackage + ' already installed on device',
          action: 'already-installed',
          launched: false
        };
      }

      // Package not installed - install APK
      console.log('[APK] Installing APK...');
      var installResult = AppInstallationDetector._installApk(appPath);
      if (!installResult.success) {
        return {
          available: false,
          message: 'APK installation failed: ' + installResult.error,
          action: 'error',
          launched: false
        };
      }

      console.log('[APK] Installation successful');

      var isInstalled = AppInstallationDetector._isPackageInstalled(appPackage);
      if (!isInstalled) {
        return {
          available: false,
          message: 'APK installation completed but package ' + appPackage + ' not found.',
          action: 'error',
          launched: false
        };
      }

      console.log('[APK] Package verified');
      return {
        available: true,
        message: appPackage + ' installed successfully from ' + appPath,
        action: 'installed',
        launched: false
      };
    }

    // PATH B: APP_PATH IS NOT CONFIGURED
    console.log('[APK] APP_PATH not configured');
    console.log('[APK] Checking installed package...');

    var packageInstalled = AppInstallationDetector._isPackageInstalled(appPackage);

    if (packageInstalled) {
      console.log('[APK] Package found - Appium will launch');
      return {
        available: true,
        message: appPackage + ' is installed on the device',
        action: 'found',
        launched: false
      };
    }

    // Package not installed and no APP_PATH - meaningful error
    var errorMsg = [
      '',
      '  The Android native app "' + appPackage + '" is NOT installed on the device.',
      '  APP_PATH is not configured.',
      '',
      '  To resolve, choose ONE:',
      '  Option 1: Configure APP_PATH in .env.android',
      '  Option 2: Install manually: adb install /path/to/amazon-app.apk',
      '  Option 3: Switch to Android Web mode (BROWSER_NAME=Chrome)',
      ''
    ].join('\n');

    console.error(errorMsg);
    return {
      available: false,
      message: appPackage + ' is not installed.',
      action: 'not-found',
      launched: false
    };
  }

  /**
   * Check if the given package is installed.
   */
  static _isPackageInstalled(appPackage: any) {
    try {
      var checkResult = execSync(
        'adb shell pm list packages ' + appPackage + ' 2>/dev/null',
        { encoding: 'utf8', timeout: 10000 }
      );
      return checkResult.indexOf('package:' + appPackage) >= 0;
    } catch (_: any) {
      return false;
    }
  }

  /**
   * Install an APK on the device.
   */
  static _installApk(appPath: any) {
    try {
      var result = execSync(
        'adb install -r ' + appPath + ' 2>&1',
        { encoding: 'utf8', timeout: 120000 }
      ).trim();

      if (result.indexOf('Success') >= 0) return { success: true, error: null };
      if (result.indexOf('INSTALL_FAILED_ALREADY_EXISTS') >= 0) return { success: true, error: null };

      return { success: false, error: result.substring(0, 300) };
    } catch (err: any) {
      return { success: false, error: 'APK installation error: ' + (err.message || 'unknown') };
    }
  }

  /**
   * Legacy verify method - kept for backward compatibility.
   * @deprecated Use ensureAppAvailable() instead.
   */
  static verify(appPackage: any, appPath: any) {
    var result = AppInstallationDetector.ensureAppAvailable(appPackage, appPath);
    return {
      installed: result.available,
      message: result.message,
      action: result.action
    };
  }
}

export default AppInstallationDetector;
