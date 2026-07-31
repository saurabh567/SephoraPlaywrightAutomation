/**
 * ExecutionMode.js
 *
 * Enterprise-grade execution mode enum for the entire automation framework.
 *
 * Every component MUST consume execution mode from this single source of truth.
 * Execution mode is detected ONCE at startup and never re-inferred.
 *
 * Modes:
 *   ANDROID_NATIVE  — Appium session for Amazon Android native app
 *   ANDROID_WEB     — Appium session for Chrome on Android
 *   IOS_NATIVE      — Appium session for iOS native app
 *   IOS_WEB         — Appium session for Safari on iOS
 *   WEB             — Playwright browser (default)
 *   API             — API-only (no browser/mobile)
 *
 * Detection priority:
 *   1. EXECUTION_MODE env var (explicit override)
 *   2. TEST_PLATFORM + BROWSER_NAME / APP_PACKAGE heuristics
 *   3. Default: WEB
 */

'use strict';

const EXECUTION_MODES = Object.freeze({
  ANDROID_NATIVE: 'ANDROID_NATIVE',
  ANDROID_WEB: 'ANDROID_WEB',
  IOS_NATIVE: 'IOS_NATIVE',
  IOS_WEB: 'IOS_WEB',
  WEB: 'WEB',
  API: 'API'
});

/**
 * Detect the execution mode once from environment.
 * This function is called exactly once per process lifecycle.
 *
 * @returns {string} One of EXECUTION_MODES values
 */
function detectExecutionMode() {
  // 1. Explicit EXECUTION_MODE env var overrides everything
  var explicitMode = process.env.EXECUTION_MODE;
  if (explicitMode) {
    var normalized = String(explicitMode).trim().toUpperCase();
    if (Object.values(EXECUTION_MODES).indexOf(normalized) !== -1) {
      return normalized;
    }
    console.warn('[ExecutionMode] WARNING: Unknown EXECUTION_MODE="' + explicitMode + '". Falling back to auto-detect.');
  }

  // 2. Check TEST_PLATFORM
  var platform = (process.env.TEST_PLATFORM || 'WEB').trim().toUpperCase();

  // API mode
  if (platform === 'API' || process.env.API_ONLY === 'true') {
    return EXECUTION_MODES.API;
  }

  // iOS platform
  if (platform === 'IOS') {
    var iosBrowserName = process.env.BROWSER_NAME || '';
    if (iosBrowserName.toLowerCase() === 'safari' || iosBrowserName.toLowerCase() === 'safari' === '') {
      // If no browserName specified or Safari, check if native app is configured
      if (process.env.APP_PATH || process.env.BUNDLE_ID) {
        return EXECUTION_MODES.IOS_NATIVE;
      }
      return EXECUTION_MODES.IOS_WEB;
    }
    return EXECUTION_MODES.IOS_WEB;
  }

  // Android platform
  if (platform === 'ANDROID') {
    var androidBrowserName = process.env.BROWSER_NAME || '';
    if (androidBrowserName.toLowerCase() === 'chrome') {
      return EXECUTION_MODES.ANDROID_WEB;
    }
    // If no browserName, check if native app is configured or if APP_PACKAGE is set
    if (process.env.APP_PACKAGE || process.env.APP_PATH) {
      return EXECUTION_MODES.ANDROID_NATIVE;
    }
    // If browserName is empty and no app package, default to web
    return EXECUTION_MODES.ANDROID_WEB;
  }

  // Default: WEB
  return EXECUTION_MODES.WEB;
}

// Detect once and cache
var _cachedMode = null;

/**
 * Get the cached execution mode, detecting it on first call.
 */
function getExecutionMode() {
  if (!_cachedMode) {
    _cachedMode = detectExecutionMode();
    console.log('[ExecutionMode] Detected: ' + _cachedMode);
  }
  return _cachedMode;
}

/**
 * Reset the cached execution mode (for testing).
 */
function resetExecutionMode() {
  _cachedMode = null;
}

/**
 * Convenience checks.
 */
function isAndroidNative() { return getExecutionMode() === EXECUTION_MODES.ANDROID_NATIVE; }
function isAndroidWeb() { return getExecutionMode() === EXECUTION_MODES.ANDROID_WEB; }
function isAndroid() { return isAndroidNative() || isAndroidWeb(); }
function isIOSNative() { return getExecutionMode() === EXECUTION_MODES.IOS_NATIVE; }
function isIOSWeb() { return getExecutionMode() === EXECUTION_MODES.IOS_WEB; }
function isIOS() { return isIOSNative() || isIOSWeb(); }
function isMobile() { return isAndroid() || isIOS(); }
function isWeb() { return getExecutionMode() === EXECUTION_MODES.WEB; }
function isApi() { return getExecutionMode() === EXECUTION_MODES.API; }

module.exports = {
  EXECUTION_MODES,
  detectExecutionMode,
  getExecutionMode,
  resetExecutionMode,
  isAndroidNative,
  isAndroidWeb,
  isAndroid,
  isIOSNative,
  isIOSWeb,
  isIOS,
  isMobile,
  isWeb,
  isApi
};
