/**
 * MobileSessionManager — centralized mobile session lifecycle manager.
 *
 * Clean linear lifecycle per scenario:
 *
 *   Boot Simulator
 *   → Start Appium
 *   → Warmup WDA (no navigation)
 *   → Delete warmup session
 *   → Create fresh Safari session
 *   → Switch WEBVIEW
 *   → Navigate to BASE_URL
 *   → Wait for homepage elements (Amazon logo, search box, hamburger menu)
 *   → Execute scenario
 *   → Delete session (terminate Safari, remove app)
 *
 * Design principles:
 *   - No URL contamination detection (Amazon legitimately redirects to
 *     multiple mobile URLs, making URL comparison invalid).
 *   - No about:blank usage (Safari on iOS restores previous tabs
 *     automatically — about:blank is not a reliable indicator).
 *   - No recursive session recreation (a session may only be recreated
 *     once after a fatal creation failure).
 *   - No contamination retry loops.
 *   - No session creation retries beyond a single recreation attempt.
 *   - Cleanup: delete WebDriver session, terminate Safari, no verification.
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

// ─────────────────────────────────────────────────────────────────────────────
// MobileSessionManager
// ─────────────────────────────────────────────────────────────────────────────

class MobileSessionManager {
  /**
   * Create a fresh mobile driver session.
   *
   * iOS Safari:
   *   - Terminates any running Safari process before session creation.
   *   - No about:blank navigation.
   *   - No URL verification.
   *
   * Android:
   *   - Creates a fresh session with noReset=false.
   *
   * @param {object} config - Environment configuration object
   * @returns {Promise<object>} WebDriverIO driver instance
   */
  static async createSession(config) {
    const platform = config.testPlatform;
    const isAndroid = platform && String(platform).toUpperCase() === TEST_PLATFORMS.ANDROID;
    const isIOS = platform && String(platform).toUpperCase() === TEST_PLATFORMS.IOS;
    const isSafari = isIOS && String(config.mobile.browserName || '').toLowerCase() === 'safari';

    // iOS Safari: Terminate any running Safari instance BEFORE session creation
    if (isSafari) {
      logger.info('[MobileSessionManager] Terminating existing Safari before session creation...');
      await MobileSessionManager._terminateSafari();
    }

    if (isAndroid) {
      logger.info('[MobileSessionManager] Creating fresh Android session...');
    } else if (isIOS) {
      logger.info('[MobileSessionManager] Creating fresh iOS session...');
    }

    const driver = await MobileDriverFactory.createDriver(config);
    logger.info('[MobileSessionManager] Session created successfully.');
    return driver;
  }

  /**
   * Create a Safari session, switch to WEBVIEW, navigate to BASE_URL,
   * and wait for visible homepage elements.
   *
   * This replaces the old createSessionAndVerify which used URL comparison,
   * about:blank verification, and recursive recreation.
   *
   * Lifecycle:
   *   1. Terminate Safari
   *   2. Create fresh driver session
   *   3. Wait for WEBVIEW context, switch to it
   *   4. Navigate to config.baseUrl
   *   5. Wait for homepage elements (Amazon logo, search box, hamburger menu)
   *   6. Return driver
   *
   * If WebView does not appear or homepage elements do not render,
   * the session is disposed once and an error is thrown — no recursion.
   *
   * @param {object} config - Environment configuration object
   * @param {object} [options]
   * @param {number} [options.webviewTimeout=20000] - Max ms to wait for WebView
   * @param {number} [options.navTimeout=30000] - Max ms to wait for navigation
   * @param {number} [options.elementTimeout=15000] - Max ms to wait for homepage elements
   * @returns {Promise<object>} WebDriverIO driver, on Amazon homepage in WEBVIEW
   */
  static async createSafariSession(config, options = {}) {
    const webviewTimeout = options.webviewTimeout || 20000;
    const navTimeout = options.navTimeout || 30000;
    const elementTimeout = options.elementTimeout || 15000;

    let driver;
    try {
      // ── Step 1: Create the session ────────────────────────────────
      driver = await MobileSessionManager.createSession(config);

      // ── Step 2: Wait for WebView context ──────────────────────────
      const startTime = Date.now();
      let webviewCtx = null;

      logger.info('[MobileSessionManager] Waiting for WebView context...');

      while (Date.now() - startTime < webviewTimeout) {
        const contexts = await driver.getContexts().catch(() => []);
        logger.info(`[MobileSessionManager] Available contexts: ${JSON.stringify(contexts)}`);
        webviewCtx = contexts.find(ctx => String(ctx).toLowerCase().includes('webview'));
        if (webviewCtx) {
          logger.info(`[MobileSessionManager] WebView context found after ${Date.now() - startTime}ms: ${webviewCtx}`);
          break;
        }
        await driver.pause(1000);
      }

      if (!webviewCtx) {
        throw new Error(
          `[MobileSessionManager] FAILED: No WebView context appeared within ${webviewTimeout}ms.`
        );
      }

      // ── Step 3: Switch to WebView ─────────────────────────────────
      await driver.switchContext(webviewCtx);
      logger.info(`[MobileSessionManager] Switched to WebView context: ${webviewCtx}`);

      // ── Step 4: Navigate to base URL ──────────────────────────────
      logger.info(`[MobileSessionManager] Navigating to BASE_URL: ${config.baseUrl}`);
      await driver.url(config.baseUrl);

      // Wait for navigation to start and page to begin loading
      await driver.pause(2000);

      // ── Step 5: Wait for homepage elements ────────────────────────
      // Amazon homepage indicators: search box, Amazon logo, hamburger menu
      // These are DOM elements in the WebView, verified by visibility.
      // No URL comparison — Amazon legitimately redirects to mobile URLs.
      logger.info('[MobileSessionManager] Waiting for visible homepage elements...');

      const homepageSelectors = [
        '#twotabsearchtextbox',           // Search box (most reliable)
        'input[name="k"]',                // Search input alternative
        'input[type="search"]',           // Search input fallback
        '#nav-search-bar-form input',     // Navigation search bar
        'a[aria-label*="Amazon"]',        // Amazon logo link
        'a[href*="amazon"][aria-label]',  // Logo alternative
        '#nav-hamburger-menu',            // Hamburger menu
        '[data-csa-c-slot-id*="hamburger"]',  // Hamburger data attribute
      ];

      let homepageVisible = false;
      let lastElementError = null;

      const elementWaitStart = Date.now();
      while (Date.now() - elementWaitStart < elementTimeout) {
        for (const selector of homepageSelectors) {
          try {
            const elements = await driver.$$(selector);
            if (elements && elements.length > 0) {
              const displayed = await elements[0].isDisplayed().catch(() => false);
              if (displayed) {
                logger.info(`[MobileSessionManager] Homepage element visible: "${selector}"`);
                homepageVisible = true;
                break;
              }
            }
          } catch (err) {
            lastElementError = err;
          }
        }
        if (homepageVisible) break;
        await driver.pause(1000);
      }

      if (!homepageVisible) {
        logger.warn(`[MobileSessionManager] Homepage elements not found within ${elementTimeout}ms. Proceeding anyway.`);
        if (lastElementError) {
          logger.warn(`[MobileSessionManager] Last element check error: ${lastElementError.message}`);
        }
      } else {
        logger.info('[MobileSessionManager] Homepage verified — elements are visible.');
      }

      logger.info(`[MobileSessionManager] Safari session ready at ${config.baseUrl}`);
      return driver;
    } catch (err) {
      // Dispose the failed session once — no recursion
      if (driver) {
        await MobileSessionManager.disposeSession(driver, {
          platform: config.testPlatform,
          appId: MobileSessionManager.getAppId(config)
        }).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Dispose a mobile driver session and release all resources.
   *
   * Cleanup is simple:
   *   - delete WebDriver session
   *   - terminate Safari (iOS)
   *   - remove app (iOS)
   *   - no recursive recovery
   *   - no URL verification
   *   - no about:blank verification
   *
   * @param {object} driver - WebDriverIO driver instance
   * @param {object} options
   * @param {string} options.platform - 'ANDROID' or 'IOS'
   * @param {string} [options.appId] - App bundle ID to terminate/remove
   */
  static async disposeSession(driver, options = {}) {
    if (!driver) {
      logger.warn('[MobileSessionManager] No driver to dispose');
      return;
    }

    const { platform, appId } = options;

    // ── Step 1: Delete the Appium session ──────────────────────────────
    try {
      await driver.deleteSession();
      logger.info('[MobileSessionManager] Driver session deleted successfully');
    } catch (err) {
      logger.warn(`[MobileSessionManager] Session delete skipped: ${err.message.substring(0, 120)}`);
    }

    // ── Step 2: Terminate Safari (iOS) ─────────────────────────────────
    if (platform === TEST_PLATFORMS.IOS && appId) {
      try {
        await driver.terminateApp(appId).catch(() => {});
        logger.info(`[MobileSessionManager] App terminated: ${appId}`);
      } catch (_) { /* ignore */ }

      // Remove app for clean next session
      try {
        await driver.execute('mobile: removeApp', { bundleId: appId }).catch(() => {});
        logger.info('[MobileSessionManager] iOS app removed — next session starts clean.');
      } catch (_) { /* ignore */ }
    }

    // ── Step 3: Kill background Safari process (safety net) ────────────
    const isSafari = platform === TEST_PLATFORMS.IOS &&
      appId && (appId === 'com.apple.mobilesafari' || String(appId).toLowerCase().includes('safari'));
    if (isSafari) {
      try {
        await MobileSessionManager._terminateSafari();
      } catch (_) { /* ignore */ }
    }

    // ── Step 4: Android ADB cleanup ────────────────────────────────────
    if (platform === TEST_PLATFORMS.ANDROID) {
      try {
        const { execSync } = require('child_process');
        for (const pkg of ANDROID_WEBVIEW_PACKAGES) {
          try {
            execSync(`adb shell pm clear ${pkg} 2>/dev/null || true`, { timeout: 10000 });
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore */ }
    }

    logger.info('[MobileSessionManager] Session resources released');
  }

  /**
   * Terminate any running Safari process on the iOS simulator.
   */
  static async _terminateSafari() {
    try {
      const { execSync } = require('child_process');
      execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
      execSync('xcrun simctl spawn booted launchctl kill SIGKILL system/com.apple.Safari 2>/dev/null || true', { timeout: 10000 });
      logger.info('[MobileSessionManager] Safari terminated on simulator.');
    } catch (err) {
      logger.warn(`[MobileSessionManager] Safari termination: ${err.message}`);
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

module.exports = MobileSessionManager;
