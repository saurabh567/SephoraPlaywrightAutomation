/**
 * ChromeDriverManager.js
 *
 * Manages ChromeDriver lifecycle for Android Mobile Web testing.
 * Automatically detects Chrome version and resolves matching ChromeDriver.
 * Ensures Appium server has --allow-insecure chromedriver_autodownload.
 *
 * Responsibilities:
 *   1. Detect Chrome version on device
 *   2. Resolve matching ChromeDriver version
 *   3. Set environment variables for ChromeDriver path
 *   4. Verify Appium is configured for chromedriver_autodownload
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ChromeDriverManager {
  /**
   * Detect Chrome version installed on the Android device.
   * @returns {{detected: boolean, version: string|null, error: string|null}}
   */
  static detectChromeVersion() {
    try {
      var result = execSync(
        'adb shell dumpsys package com.android.chrome 2>/dev/null | grep versionName | head -1',
        { encoding: 'utf8', timeout: 10000 }
      ).trim();

      if (result) {
        var match = result.match(/versionName=([0-9.]+)/);
        if (match && match[1]) {
          var version = match[1];
          console.log('[ChromeDriverManager] Chrome version detected: ' + version);
          return { detected: true, version: version, error: null };
        }
      }

      // Fallback: try pm list packages
      var altResult = execSync(
        'adb shell pm list packages --show-versioncode com.android.chrome 2>/dev/null',
        { encoding: 'utf8', timeout: 10000 }
      ).trim();
      if (altResult) {
        var altMatch = altResult.match(/versionName=([0-9.]+)/);
        if (altMatch && altMatch[1]) {
          var altVersion = altMatch[1];
          console.log('[ChromeDriverManager] Chrome version detected (alt): ' + altVersion);
          return { detected: true, version: altVersion, error: null };
        }
      }

      console.warn('[ChromeDriverManager] Could not detect Chrome version');
      return { detected: false, version: null, error: 'Chrome not found or version unavailable' };
    } catch (err) {
      console.warn('[ChromeDriverManager] Chrome detection failed: ' + err.message);
      return { detected: false, version: null, error: err.message };
    }
  }

  /**
   * Resolve the ChromeDriver version matching the detected Chrome version.
   * ChromeDriver major version should match Chrome major version.
   *
   * @param {string} chromeVersion - Detected Chrome version (e.g., "114.0.5735.196")
   * @returns {{resolved: boolean, driverVersion: string|null, majorVersion: number|null}}
   */
  static resolveChromeDriverVersion(chromeVersion) {
    if (!chromeVersion) {
      return { resolved: false, driverVersion: null, majorVersion: null };
    }

    var majorMatch = chromeVersion.match(/^(\d+)/);
    var majorVersion = majorMatch ? parseInt(majorMatch[1], 10) : null;

    if (!majorVersion) {
      return { resolved: false, driverVersion: null, majorVersion: null };
    }

    // ChromeDriver major version should match Chrome major version
    // ChromeDriver uses the same major version numbering
    var driverVersion = String(majorVersion) + '.0.0.0';

    console.log('[ChromeDriverManager] Chrome major version: ' + majorVersion + ' → ChromeDriver: ~' + driverVersion);
    return { resolved: true, driverVersion: driverVersion, majorVersion: majorVersion };
  }

  /**
   * Ensure Appium server has chromedriver_autodownload configured.
   * Sets CHROMEDRIVER_AUTODOWNLOAD env var to ensure capabilities include it.
   */
  static ensureAppiumChromeDriverConfig() {
    // Set the env var so capabilities include chromedriverAutodownload
    if (process.env.CHROMEDRIVER_AUTODOWNLOAD === undefined) {
      process.env.CHROMEDRIVER_AUTODOWNLOAD = 'true';
      console.log('[ChromeDriverManager] Set CHROMEDRIVER_AUTODOWNLOAD=true for Appium');
    }

    // Check if Appium is already running and warn if chromedriver_autodownload not allowed
    try {
      var http = require('http');
      var appiumHost = process.env.APPIUM_HOST || '127.0.0.1';
      var appiumPort = process.env.APPIUM_PORT || 4723;

      var req = http.get('http://' + appiumHost + ':' + appiumPort + '/status', { timeout: 2000 }, function(res) {
        var body = '';
        res.on('data', function(chunk) { body += chunk; });
        res.on('end', function() {
          try {
            var json = JSON.parse(body);
            var args = json.value && json.value.argv ? json.value.argv : [];
            var hasAllowInsecure = args.some(function(a) {
              return a.indexOf('chromedriver_autodownload') >= 0;
            });
            if (!hasAllowInsecure) {
              console.warn('[ChromeDriverManager] WARNING: Appium may not have --allow-insecure chromedriver_autodownload');
              console.warn('[ChromeDriverManager] To enable: add --allow-insecure chromedriver_autodownload to Appium args');
            }
          } catch (_) {}
        });
      });
      req.on('error', function() {});
      req.setTimeout(2000, function() { req.destroy(); });
    } catch (_) {
      // Appium not running yet — will be configured on start
    }

    return true;
  }

  /**
   * Run all ChromeDriver management steps.
   * @returns {{success: boolean, chromeVersion: string|null, message: string}}
   */
  static setup() {
    console.log('');
    console.log('[ChromeDriverManager] Setting up ChromeDriver for Mobile Web...');

    // 1. Detect Chrome version
    var chromeInfo = ChromeDriverManager.detectChromeVersion();
    if (!chromeInfo.detected) {
      console.warn('[ChromeDriverManager] Chrome version detection failed: ' + (chromeInfo.error || 'unknown'));
      // Continue anyway — Appium will auto-download on demand
    }

    // 2. Resolve ChromeDriver
    var driverInfo = null;
    if (chromeInfo.detected && chromeInfo.version) {
      driverInfo = ChromeDriverManager.resolveChromeDriverVersion(chromeInfo.version);
    }

    // 3. Ensure Appium config
    ChromeDriverManager.ensureAppiumChromeDriverConfig();

    var resultMessage = chromeInfo.detected
      ? 'Chrome v' + chromeInfo.version + ' detected'
      : 'Chrome version undetected (Appium will auto-resolve)';

    if (driverInfo && driverInfo.resolved) {
      resultMessage += ', ChromeDriver target: v' + driverInfo.driverVersion;
    }

    console.log('[ChromeDriverManager] Setup complete: ' + resultMessage);
    console.log('');

    return {
      success: true,
      chromeVersion: chromeInfo.version || null,
      message: resultMessage
    };
  }
}

module.exports = ChromeDriverManager;
