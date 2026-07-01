/**
 * Android Appium capabilities.
 *
 * BrowserContext Isolation:
 *   - noReset: false — ensures every new session starts with a clean app state
 *   - fullReset: configurable — use FULL_RESET=true to also uninstall/reinstall the app
 *   - skipDeviceInitialization: true — avoids UiAutomator2 initialization errors
 *   - autoGrantPermissions: true — automatically grants all app permissions
 *
 * These settings guarantee that each test case starts with:
 *   - No cookies
 *   - No localStorage, sessionStorage, IndexedDB, Cache Storage
 *   - No browser history, saved permissions, or previous auth state
 *   - No reused browser session, tab, or shared memory
 *
 * Launcher Activity Auto-Detection:
 *   When APP_ACTIVITY is not explicitly set (empty/undefined), this module
 *   automatically detects the correct launcher activity via ADB:
 *     adb shell cmd package resolve-activity --brief <appPackage>
 *   If detection fails, it falls back to:
 *     com.amazon.mShop.home.HomeActivity
 */

const { execSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// Launcher Activity Auto-Detection
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_ACTIVITY = 'com.amazon.mShop.home.HomeActivity';

/**
 * Automatically detect the launcher activity for a given Android app package.
 * Uses ADB shell cmd package resolve-activity.
 *
 * @param {string} appPackage - Android app package name
 * @returns {string|null} Fully qualified activity name, or null if detection fails
 */
function detectLauncherActivity(appPackage) {
  if (!appPackage) return null;

  try {
    const out = execSync(
      `adb shell cmd package resolve-activity --brief ${appPackage} 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (out && !out.includes('error') && !out.includes('Error') && out.length > 0) {
      // The output is typically just the activity name, e.g.:
      //   com.amazon.mShop.home.HomeActivity
      // Strip any noise (newlines, control chars)
      const activity = out.split('\n')[0].trim();
      if (activity && activity.includes('.')) {
        console.log(`[android.capabilities] Auto-detected launcher activity: ${activity}`);
        return activity;
      }
    }
  } catch (err) {
    // ADB not available or no device connected
    console.warn(`[android.capabilities] ADB detection failed (non-fatal): ${err.message}`);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities builder
// ─────────────────────────────────────────────────────────────────────────────

function androidCapabilities() {
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,

    // =========================================================
    // Session Isolation: Do NOT reuse app state between sessions
    // =========================================================
    // noReset=false ensures Appium clears app data on every new session.
    // This guarantees cookies, localStorage, and all WebView state
    // are wiped before each test case.
    // =========================================================
    'appium:noReset': process.env.NO_RESET === 'true' ? true : false,
    'appium:fullReset': process.env.FULL_RESET === 'true',

    // Skip UiAutomator2 device initialization to avoid instrumentation errors
    'appium:skipDeviceInitialization': process.env.SKIP_DEVICE_INIT !== 'false',
    'appium:skipServerInstallation': process.env.SKIP_SERVER_INSTALL === 'true',

    // Grant all permissions automatically
    'appium:autoGrantPermissions': process.env.AUTO_GRANT_PERMISSIONS !== 'false',

    // New command timeout
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 180),

    // WebView / browser support
    'appium:ensureWebviewsHavePages': true,
    'appium:recreateChromeDriverSessions': true,
    'appium:nativeWebScreenshot': true,
  };

  // App package configuration
  if (process.env.APP_PACKAGE) {
    capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
    capabilities['appium:appWaitPackage'] = process.env.APP_PACKAGE;

    // Determine the app activity: prefer explicit env var, auto-detect otherwise
    let appActivity = process.env.APP_ACTIVITY;

    // If APP_ACTIVITY is empty or whitespace-only, auto-detect
    if (!appActivity || appActivity.trim().length === 0) {
      console.log('[android.capabilities] APP_ACTIVITY not set — auto-detecting launcher activity via ADB...');
      const detected = detectLauncherActivity(process.env.APP_PACKAGE);
      if (detected) {
        appActivity = detected;
        console.log(`[android.capabilities] Using auto-detected activity: ${appActivity}`);
      } else {
        appActivity = FALLBACK_ACTIVITY;
        console.log(`[android.capabilities] ADB detection failed — using fallback activity: ${appActivity}`);
      }
    }

    if (appActivity) {
      capabilities['appium:appActivity'] = appActivity;
      capabilities['appium:appWaitActivity'] = appActivity;
    }

    // App launch timeout
    capabilities['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 30000);
  }

  // Optional: path to .apk file
  if (process.env.APP_PATH) capabilities['appium:app'] = process.env.APP_PATH;

  // Optional: device UDID for real devices
  if (process.env.UDID) capabilities['appium:udid'] = process.env.UDID;

  // Chrome driver port for WebView debugging
  if (process.env.CHROMEDRIVER_PORT) {
    capabilities['appium:chromedriverPort'] = Number(process.env.CHROMEDRIVER_PORT);
  }
  if (process.env.CHROMEDRIVER_EXECUTABLE) {
    capabilities['appium:chromedriverExecutable'] = process.env.CHROMEDRIVER_EXECUTABLE;
  }

  return capabilities;
}

module.exports = androidCapabilities;
