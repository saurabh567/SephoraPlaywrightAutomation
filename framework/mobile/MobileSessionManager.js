/**
 * MobileSessionManager — centralized mobile session lifecycle manager.
 *
 * Manages creation and disposal of Appium driver sessions for Android and iOS.
 * Guarantees every test case starts with a completely isolated session:
 *   - No cookies, localStorage, sessionStorage, IndexedDB, or Cache Storage
 *   - No browser history, saved permissions, or previous auth state
 *   - No reused browser session, tab, or shared memory
 *
 * Lifecycle per scenario:
 *   1. Create brand-new Appium driver session with noReset=false
 *   2. Clear app data via ADB (Android) or removeApp + WebView cleanup (iOS)
 *   3. Execute test steps
 *   4. Dispose driver session (always, even on failure)
 *
 * NOTE: Mobile first-launch language popup handling is done in hooks.js
 * AFTER createSession() returns and BEFORE any Cucumber step executes.
 * This separation keeps concerns clear: createSession() creates the
 * session, hooks.js handles the popup.
 *
 * Thread-safe — no shared mutable state across workers.
 */

const logger = require('../../utils/logger');
const MobileDriverFactory = require('./MobileDriverFactory');
const { TEST_PLATFORMS } = require('../common/platforms');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ANDROID_AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const ANDROID_CHROME_PACKAGE = 'com.android.chrome';
const ANDROID_WEBVIEW_PACKAGES = [ANDROID_AMAZON_PACKAGE, ANDROID_CHROME_PACKAGE];

// JavaScript snippets for clearing WebView storage (executed via Appium execute)
const JS_CLEAR_COOKIES = `document.cookie.split(";").forEach(function(c) {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});`;

const JS_CLEAR_LOCAL_STORAGE = 'try { localStorage.clear(); } catch(e) {}';
const JS_CLEAR_SESSION_STORAGE = 'try { sessionStorage.clear(); } catch(e) {}';
const JS_CLEAR_INDEXED_DB = `try {
  indexedDB.databases().then(function(dbs) {
    dbs.forEach(function(db) {
      if (db.name) { indexedDB.deleteDatabase(db.name); }
    });
  });
} catch(e) {}`;
const JS_CLEAR_CACHE_API = `try {
  if (window.caches) {
    caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); });
  }
} catch(e) {}`;

const JS_CLEAR_ALL_STORAGE = [
  JS_CLEAR_COOKIES,
  JS_CLEAR_LOCAL_STORAGE,
  JS_CLEAR_SESSION_STORAGE,
  JS_CLEAR_INDEXED_DB,
  JS_CLEAR_CACHE_API
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// MobileSessionManager
// ─────────────────────────────────────────────────────────────────────────────

class MobileSessionManager {
  /**
   * Create a brand-new mobile driver session with full isolation guarantees.
   *
   * Returns the driver immediately after session creation and state clearing.
   * Mobile popup handling (language selection, sign-in skip) is done in
   * hooks.js after this method returns — NOT inside createSession().
   *
   * @param {object} config - Environment configuration object
   * @param {number} [retries=2] - Number of retries for transient failures
   * @param {number} [delayMs=15000] - Delay between retries in ms
   * @returns {Promise<object>} WebDriverIO driver instance
   */
  static async createSession(config, retries = 2, delayMs = 15000) {
    const platform = config.testPlatform;
    const isAndroid = platform && String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    const isIOS = platform && String(platform).toUpperCase() === TEST_PLATFORMS.IOS;

    let lastError;

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        if (isAndroid) {
          logger.info('[MobileSessionManager] Creating fresh Android session...');
        } else if (isIOS) {
          logger.info('[MobileSessionManager] Creating fresh iOS session...');
        } else {
          logger.info(`[MobileSessionManager] Creating new ${platform} session (attempt ${attempt}/${retries + 1})`);
        }

        const driver = await MobileDriverFactory.createDriver(config);

        // Clear any residual app state immediately after session creation
        await MobileSessionManager.clearAppState(driver, platform).catch(err => {
          logger.warn(`[MobileSessionManager] Initial state clear failed (non-fatal): ${err.message}`);
        });

        return driver;
      } catch (err) {
        lastError = err;
        const msg = String(err.message || '');
        const isRetryable =
          msg.includes('session is either terminated') ||
          msg.includes('No targets') ||
          msg.includes('could not be matched') ||
          msg.includes('instrumentation process cannot be initialized') ||
          msg.includes('instrumentation process crashed') ||
          msg.includes('An unknown server-side error') ||
          msg.includes('Unable to connect') ||
          msg.includes('ECONNREFUSED');

        if (attempt <= retries && isRetryable) {
          logger.warn(`[MobileSessionManager] Session creation attempt ${attempt} failed: ${msg.substring(0, 150)}. Retrying in ${delayMs / 1000}s ...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw err;
        }
      }
    }

    throw lastError || new Error(`Failed to create mobile session after ${retries + 1} attempts`);
  }

  /**
   * Dispose a mobile driver session and release all resources.
   * Safe to call multiple times — no-ops if already disposed.
   *
   * For iOS: removes the app via mobile:removeApp (supported) before session
   * deletion, guaranteeing a clean install on the next scenario.
   * Does NOT use unsupported mobile:clearSafariData / mobile:clearCookies.
   *
   * @param {object} driver - WebDriverIO driver instance
   * @param {object} options
   * @param {string} options.platform - 'ANDROID' or 'IOS'
   * @param {string} [options.appId] - App bundle ID to terminate before session delete
   */
  static async disposeSession(driver, options = {}) {
    if (!driver) {
      logger.warn('[MobileSessionManager] No driver to dispose');
      return;
    }

    const { platform, appId } = options;
    let disposed = false;

    // Step 1: Terminate the app first to release in-app resources
    if (appId) {
      try {
        await driver.terminateApp(appId);
        logger.info(`[MobileSessionManager] App terminated: ${appId}`);
      } catch (err) {
        logger.warn(`[MobileSessionManager] App termination skipped or failed: ${err.message}`);
      }
    }

    // Step 2: For iOS, remove the app entirely so the next session gets a clean install.
    if (platform === TEST_PLATFORMS.IOS && appId) {
      try {
        await driver.execute('mobile: removeApp', { bundleId: appId });
        logger.info('[iOS] Fresh installation completed.');
      } catch (err) {
        logger.warn(`[MobileSessionManager] iOS: removeApp skipped (non-fatal): ${err.message.substring(0, 120)}`);
      }
    }

    // Step 3: Attempt to delete the Appium session
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await driver.deleteSession();
        logger.info('[MobileSessionManager] Driver session deleted successfully');
        disposed = true;
        break;
      } catch (err) {
        const msg = String(err.message || '');
        if (attempt < 2) {
          logger.warn(`[MobileSessionManager] Session delete attempt ${attempt} failed: ${msg.substring(0, 120)}. Retrying...`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          logger.warn(`[MobileSessionManager] Session delete failed after 2 attempts: ${msg.substring(0, 120)}`);
        }
      }
    }

    // Step 4: For Android, clear app data via ADB as a safety net
    if (platform === TEST_PLATFORMS.ANDROID) {
      try {
        const { execSync } = require('child_process');
        for (const pkg of ANDROID_WEBVIEW_PACKAGES) {
          try {
            execSync(`adb shell pm clear ${pkg} 2>/dev/null || true`, { timeout: 10000 });
          } catch (_) { /* ignore */ }
        }
        logger.info('[MobileSessionManager] Android app data cleared via ADB (safety net)');
      } catch (_) { /* ignore */ }
    }

    logger.info('[MobileSessionManager] Session resources released');
    return disposed;
  }

  /**
   * Clear app state (cookies, storage, cache) immediately after session creation.
   */
  static async clearAppState(driver, platform) {
    if (!driver || !platform) return;

    const normalizedPlatform = String(platform).toUpperCase();

    if (normalizedPlatform === TEST_PLATFORMS.ANDROID) {
      await MobileSessionManager._clearAndroidAppState(driver);
    } else if (normalizedPlatform === TEST_PLATFORMS.IOS) {
      await MobileSessionManager._clearIOSAppState(driver);
    }
  }

  /**
   * Android-specific app state cleanup.
   */
  static async _clearAndroidAppState(driver) {
    try {
      const { execSync } = require('child_process');
      for (const pkg of ANDROID_WEBVIEW_PACKAGES) {
        try {
          execSync(`adb shell pm clear ${pkg} 2>/dev/null || true`, { timeout: 15000 });
          logger.info(`[MobileSessionManager] Android: Cleared app data for ${pkg}`);
        } catch (err) {
          logger.warn(`[MobileSessionManager] Android: Could not clear data for ${pkg}: ${err.message}`);
        }
      }
    } catch (_) { /* ADB not available */ }

    try {
      await driver.execute('mobile: clearCookies');
    } catch (err) {
      logger.warn(`[MobileSessionManager] Android: mobile:clearCookies failed: ${err.message}`);
    }

    try {
      const contexts = await driver.getContexts();
      const webviewContext = contexts.find(ctx => String(ctx).toLowerCase().includes('webview'));
      if (webviewContext) {
        await driver.switchContext(webviewContext);
        await driver.execute(JS_CLEAR_ALL_STORAGE);
        if (contexts.includes('NATIVE_APP')) {
          await driver.switchContext('NATIVE_APP');
        }
      }
    } catch (err) {
      logger.warn(`[MobileSessionManager] Android: WebView JS cleanup skipped: ${err.message}`);
    }
  }

  /**
   * iOS-specific app state cleanup.
   * No unsupported mobile: commands used.
   */
  static async _clearIOSAppState(driver) {
    let previousContext = null;
    try {
      previousContext = await driver.getContext();
    } catch (_) { /* ignore */ }

    try {
      const contexts = await driver.getContexts();
      const hasWebView = contexts.some(ctx => String(ctx).toLowerCase().includes('webview'));
      if (!hasWebView) return;

      for (const ctx of contexts) {
        if (String(ctx).toLowerCase().includes('webview')) {
          try {
            await driver.switchContext(ctx);
            await driver.execute(JS_CLEAR_ALL_STORAGE);
            logger.info('[iOS] WebView storage cleared.');
          } catch (err) {
            logger.warn(`[MobileSessionManager] iOS: JS clear failed in context ${ctx}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logger.warn(`[MobileSessionManager] iOS: WebView context listing failed: ${err.message}`);
    }

    if (previousContext) {
      try {
        await driver.switchContext(previousContext);
      } catch (_) { /* ignore */ }
    }
  }

  /**
   * Get the appropriate app identifier for the given platform and config.
   */
  static getAppId(config) {
    if (config.testPlatform === TEST_PLATFORMS.ANDROID) {
      return config.mobile.appPackage || ANDROID_AMAZON_PACKAGE;
    }
    if (config.testPlatform === TEST_PLATFORMS.IOS) {
      if (config.mobile.browserName && config.mobile.browserName.toLowerCase() === 'safari') {
        return process.env.IOS_SAFARI_BUNDLE_ID || 'com.apple.mobilesafari';
      }
      return config.mobile.bundleId || '';
    }
    return '';
  }

  /**
   * Verify that a mobile driver session is still healthy.
   */
  static async isSessionHealthy(driver) {
    if (!driver) return false;
    try {
      await driver.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}

// Legacy constant kept for backwards compatibility
const IOS_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

module.exports = MobileSessionManager;
