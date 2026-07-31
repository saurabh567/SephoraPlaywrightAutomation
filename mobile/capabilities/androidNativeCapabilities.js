/**
 * androidNativeCapabilities.js
 *
 * Android Native App capabilities — ONLY native app capabilities.
 * NO browserName, NO Chrome-related capabilities.
 *
 * For Amazon Shopping app (in.amazon.mShop.android.shopping) and
 * other native Android apps under test.
 *
 * ════════════════════════════════════════════════════════════════════════
 * ENTERPRISE LIFECYCLE — Appium owns the app lifecycle
 * ════════════════════════════════════════════════════════════════════════
 *   appium:autoLaunch = true by default — Appium launches the app
 *   ADB never launches the application
 *
 * Configuration (from .env.android):
 *   ANDROID_CLEAN_START=true         → Force-stop + clear data + fresh launch
 *   ANDROID_REUSE_SESSION=true       → Keep app data, fast re-launch
 *   ANDROID_CLEAR_APP_DATA=true      → pm clear before Appium launch
 *   ANDROID_FORCE_STOP_BEFORE_RUN=true → Force-stop before Appium launch
 *   NO_RESET=false                   → Allow full reset
 *
 * Lock Screen Support:
 *   APPIUM_UNLOCK_STRATEGY: 'swipe', 'pin', 'pattern', 'password', or 'disabled'
 *   APPIUM_UNLOCK_KEY: PIN/password (default: 1234)
 *   APPIUM_SKIP_UNLOCK: if 'true', skip lock screen handling
 */

'use strict';

function androidNativeCapabilities() {
  // ── Execution mode configuration ──────────────────────────────────
  var cleanStart = process.env.ANDROID_CLEAN_START === 'true';
  var reuseSession = process.env.ANDROID_REUSE_SESSION === 'true';
  var noReset = cleanStart ? false : (process.env.NO_RESET === 'true' || reuseSession);
  var fullReset = cleanStart || process.env.ANDROID_CLEAR_APP_DATA === 'true';
  var forceStop = process.env.ANDROID_FORCE_STOP_BEFORE_RUN === 'true' || cleanStart;

  var capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // ── App Lifecycle — Appium launches the app ─────────────────────
    'appium:autoLaunch': true,

    // ── Session Isolation ───────────────────────────────────────────
    // ANDROID_CLEAN_START=true → fullReset=true, noReset=false
    // ANDROID_REUSE_SESSION=true → noReset=true, fullReset=false
    'appium:noReset': noReset,
    'appium:fullReset': fullReset,
    'appium:dontStopAppOnReset': !forceStop,

    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 300),
    'appium:adbExecTimeout': Number(process.env.ADB_EXEC_TIMEOUT || 60000),
    'appium:uiautomator2ServerLaunchTimeout': Number(process.env.UIAUTOMATOR2_LAUNCH_TIMEOUT || 60000),
    'appium:ensureWebviewsHavePages': true,
    'appium:recreateChromeDriverSessions': true,
    'appium:nativeWebScreenshot': true
  };

  // ── Log configuration for debugging ───────────────────────────────
  if (cleanStart || reuseSession || fullReset || forceStop) {
    console.log('[androidNativeCapabilities] Mode: ' +
      (cleanStart ? 'CLEAN_START' : reuseSession ? 'REUSE_SESSION' : 'DEFAULT') +
      ' | noReset=' + noReset +
      ' | fullReset=' + fullReset +
      ' | forceStop=' + forceStop +
      ' | dontStopAppOnReset=' + !forceStop);
  }

  // ══════════════════════════════════════════════════════════════════
  // LOCK SCREEN AUTO-UNLOCK CAPABILITIES
  // ══════════════════════════════════════════════════════════════════
  if (process.env.APPIUM_SKIP_UNLOCK !== 'true') {
    var unlockStrategy = process.env.APPIUM_UNLOCK_STRATEGY || 'locksettings';
    var unlockKey = process.env.APPIUM_UNLOCK_KEY || '1234';

    if (unlockStrategy !== 'disabled') {
      capabilities['appium:unlockStrategy'] = unlockStrategy;
      capabilities['appium:unlockKey'] = unlockKey;

      if (unlockStrategy === 'pin') {
        capabilities['appium:unlockType'] = 'pin';
      } else if (unlockStrategy === 'pattern') {
        capabilities['appium:unlockType'] = 'pattern';
      } else if (unlockStrategy === 'password') {
        capabilities['appium:unlockType'] = 'password';
      }

      capabilities['appium:skipDeviceInitialization'] = false;
      console.log('[androidNativeCapabilities] Unlock: strategy=' + unlockStrategy + ', key=' + unlockKey);
    }
  }

  // ── App package ──────────────────────────────────────────────────
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    capabilities['appium:appWaitPackage'] = process.env.APP_WAIT_PACKAGE || process.env.APP_PACKAGE;

    // Activity is resolved dynamically by DriverManager
    if (process.env.APP_ACTIVITY && process.env.APP_ACTIVITY.trim().length > 0) {
      var appActivity = process.env.APP_ACTIVITY.trim();
      if (appActivity.indexOf('/') >= 0) {
        var parts = appActivity.split('/');
        appActivity = parts[parts.length - 1];
      }
      capabilities['appium:appActivity'] = appActivity;
    }

    capabilities['appium:appWaitActivity'] = process.env.APP_WAIT_ACTIVITY || '*';
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 45000);
  }

  // ── APK path (if provided) ───────────────────────────────────────
  if (process.env.APP_PATH) {
    capabilities['appium:app'] = process.env.APP_PATH;
  }

  // ── Device-specific ──────────────────────────────────────────────
  if (process.env.UDID) {
    capabilities['appium:udid'] = process.env.UDID;
  }
  if (process.env.CHROMEDRIVER_PORT) {
    capabilities['appium:chromedriverPort'] = Number(process.env.CHROMEDRIVER_PORT);
  }
  if (process.env.CHROMEDRIVER_EXECUTABLE) {
    capabilities['appium:chromedriverExecutable'] = process.env.CHROMEDRIVER_EXECUTABLE;
  }

  return capabilities;
}

module.exports = androidNativeCapabilities;
