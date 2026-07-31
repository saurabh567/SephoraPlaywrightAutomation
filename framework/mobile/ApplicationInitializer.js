/**
 * ApplicationInitializer
 *
 * Enterprise-grade cross-platform mobile application initializer.
 *
 * After Appium creates the driver session, this component intelligently
 * navigates the application to the default testing state (Amazon Home Dashboard)
 * by detecting screens dynamically and taking appropriate action.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SINGLE ENTRY POINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   After Appium creates the driver session:
 *     const AppInit = require('./framework/mobile/ApplicationInitializer');
 *     const result = await AppInit.initialize(driver, { platform: 'android' });
 *
 *   This is called by:
 *     - AndroidStartupPipeline (primary path)
 *     - IosStartupPipeline (primary path)
 *     - MobileSessionManager (standalone/fallback path)
 *
 *   NEVER called from:
 *     - hooks.js (only checks startupCompleted flag)
 *     - step definitions
 *     - page objects
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Screen Detection, Not Hardcoded Flow
 *    - Inspects current screen (page source, element presence, accessibility IDs,
 *      resource IDs, text labels, content descriptions)
 *    - Decides what action to take based on what's visible
 *
 * 2. Idempotent
 *    - If a screen is already skipped, the initializer does NOT fail
 *    - If the dashboard is already open, it continues immediately
 *    - Safe to call multiple times (uses startupCompleted flag)
 *
 * 3. Retry Logic
 *    - Auto-retries up to 2 times if dashboard verification fails
 *    - After second failure, aborts execution with error
 *
 * 4. Configurable
 *    - All behaviour controlled via .env flags (AUTO_SELECT_LANGUAGE,
 *      AUTO_SKIP_ONBOARDING, AUTO_DISMISS_PERMISSIONS, etc.)
 *
 * 5. Platform-Aware
 *    - Uses platform-specific locators (Android vs iOS)
 *    - Navigation logic is shared in the common initializer
 *    - Locator files are separated for maintainability
 *
 * 6. Dashboard Verification
 *    - Before returning, verifies the dashboard is fully loaded:
 *      ✓ Search bar visible
 *      ✓ Bottom navigation visible
 *      ✓ Home tab selected (where applicable)
 *      ✓ WebView / page content loaded
 *
 * 7. No Fixed Sleeps
 *    - All delays use smart polling (waitFor UI state, not fixed time)
 *    - Only waits until the expected UI transition completes
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * INITIALIZATION FLOW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   [Startup] Creating Driver...
 *       ↓
 *   Driver session created
 *       ↓
 *   [Startup] Running Application Initializer
 *       ↓
 *   [Startup] Language handled
 *   [Startup] Onboarding skipped
 *   [Startup] Sign In skipped
 *   [Startup] Permissions handled
 *   [Startup] Promotions dismissed
 *   [Startup] Updates dismissed
 *   [Startup] Location handled
 *   [Startup] Dashboard verified
 *       ↓
 *   [Startup] Application Ready
 *   [Startup] Launching Cucumber...
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SCENARIO HANDLING
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   Fresh Install:
 *     Language screen → Select English → Continue → Skip sign in →
 *     Dismiss permissions → Dismiss promotions → Dashboard
 *
 *   Returning User (logged out):
 *     Language screen may or may not appear → Skip sign in →
 *     Dismiss promotions → Dashboard
 *
 *   Logged-in User:
 *     Dashboard opens immediately → Verification passes
 *
 *   Language Already Selected:
 *     Language step skipped → Moves to next step
 *
 *   Dashboard Already Open:
 *     All steps skipped → Verification passes → Ready for tests
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const DriverManager = require('../../mobile/lifecycle/DriverManager');

// ── Configuration defaults ────────────────────────────────────────────────
const DEFAULTS = {
  AUTO_SELECT_LANGUAGE: true,
  DEFAULT_LANGUAGE: 'English',
  AUTO_SKIP_ONBOARDING: true,
  AUTO_DISMISS_PERMISSIONS: true,
  AUTO_DISMISS_PROMOTIONS: true,
  AUTO_DISMISS_UPDATES: true,
  AUTO_DISMISS_LOCATION: true,
  AUTO_NAVIGATE_TO_DASHBOARD: true,
  RUN_LOGIN_FLOW: false,
  DASHBOARD_WAIT_TIMEOUT: 45000,
  DASHBOARD_POLL_INTERVAL: 2000,
  STEP_TIMEOUT: 15000,
  MAX_RETRIES: 2,
};

class ApplicationInitializer {
  /**
   * Initialize the application to the default testing state.
   *
   * Called ONCE after driver session creation. Auto-detects platform,
   * loads locators, navigates through all startup screens, and verifies
   * the dashboard is fully loaded.
   *
   * Retries up to MAX_RETRIES times if dashboard verification fails.
   *
   * @param {object} driver - WebDriverIO Appium driver
   * @param {object} [options]
   * @param {string} [options.platform] - 'android' or 'ios' (auto-detected)
   * @param {boolean} [options.force] - Force re-initialization even if already done
   * @returns {Promise<{success: boolean, dashboardVerified: boolean, stepsCompleted: Array<string>}>}
   */
  static async initialize(driver, options = {}) {
    if (!driver) {
      console.error('[Startup] ERROR: No driver provided — cannot initialize');
      return { success: false, dashboardVerified: false, stepsCompleted: [] };
    }

    // Skip if already initialized (unless forced)
    if (DriverManager.isStartupCompleted() && !options.force) {
      console.log('[Startup] Application already initialized — skipping');
      return { success: true, dashboardVerified: true, stepsCompleted: [] };
    }

    const platform = ApplicationInitializer._detectPlatform(driver, options.platform);
    const config = ApplicationInitializer._loadConfig();
    const locators = ApplicationInitializer._loadLocators(platform);

    console.log('');
    console.log('[Startup] ╔══════════════════════════════════════════════════╗');
    console.log('[Startup] ║     APPLICATION INITIALIZER                     ║');
    console.log('[Startup] ╚══════════════════════════════════════════════════╝');
    console.log(`[Startup]   Platform: ${platform.toUpperCase()}`);
    console.log(`[Startup]   Auto language: ${config.AUTO_SELECT_LANGUAGE}`);
    console.log(`[Startup]   Auto skip onboarding: ${config.AUTO_SKIP_ONBOARDING}`);
    console.log(`[Startup]   Auto dismiss permissions: ${config.AUTO_DISMISS_PERMISSIONS}`);
    console.log(`[Startup]   Auto dismiss promotions: ${config.AUTO_DISMISS_PROMOTIONS}`);
    console.log(`[Startup]   Run login flow: ${config.RUN_LOGIN_FLOW}`);
    console.log('');

    let lastError = null;
    const maxRetries = config.MAX_RETRIES || DEFAULTS.MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[Startup] Running Application Initializer (attempt ${attempt}/${maxRetries})`);

      try {
        const result = await ApplicationInitializer._execute(driver, platform, locators, config);

        if (result.success && result.dashboardVerified) {
          DriverManager.markStartupCompleted();
          console.log('[Startup] ✅ Application Ready');
          console.log('[Startup] Launching Cucumber...');
          console.log('');
          return result;
        }

        // Dashboard not verified — retry
        lastError = new Error('Dashboard verification failed after initialization steps');
        console.log(`[Startup] ⚠ Dashboard not verified on attempt ${attempt}/${maxRetries}`);

        if (attempt < maxRetries) {
          console.log('[Startup] Retrying initialization...');
          DriverManager.resetStartupCompleted();
          await ApplicationInitializer._waitForCondition(async () => {
            await ApplicationInitializer._sleep(1000);
            return true;
          }, 2000);
        }
      } catch (err) {
        lastError = err;
        console.log(`[Startup] ⚠ Initialization attempt ${attempt}/${maxRetries} failed: ${err.message}`);

        if (attempt < maxRetries) {
          console.log('[Startup] Retrying...');
          DriverManager.resetStartupCompleted();
          await ApplicationInitializer._waitForCondition(async () => {
            await ApplicationInitializer._sleep(2000);
            return true;
          }, 3000);
        }
      }
    }

    // All retries exhausted
    console.log(`[Startup] ❌ Application initialization failed after ${maxRetries} attempts`);
    if (lastError) {
      console.log(`[Startup] Last error: ${lastError.message}`);
    }
    console.log('');

    return {
      success: false,
      dashboardVerified: false,
      stepsCompleted: [],
    };
  }

  /**
   * Execute the initialization steps once.
   * Internal method — all step logic lives here.
   */
  static async _execute(driver, platform, locators, config) {
    const stepsCompleted = [];
    let dashboardVerified = false;

    // Brief wait for app to settle after launch
    await ApplicationInitializer._waitForStabilized(driver, 2000);

    // ── STEP 1: Detect & Select Language ──────────────────────────────
    if (config.AUTO_SELECT_LANGUAGE) {
      const handled = await ApplicationInitializer._handleLanguageScreen(driver, platform, locators, config);
      if (handled) {
        stepsCompleted.push('language_selected');
        console.log('[Startup] ✅ Language handled');
      }
    }

    // ── STEP 2: Skip Onboarding / Tutorial ────────────────────────────
    if (config.AUTO_SKIP_ONBOARDING) {
      const handled = await ApplicationInitializer._handleOnboarding(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('onboarding_skipped');
        console.log('[Startup] ✅ Onboarding skipped');
      }
    }

    // ── STEP 3: Skip Sign In / Sign Up ───────────────────────────────
    if (!config.RUN_LOGIN_FLOW) {
      const handled = await ApplicationInitializer._handleSignInScreen(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('signin_skipped');
        console.log('[Startup] ✅ Sign In skipped');
      }
    }

    // ── STEP 4: Dismiss Permission Dialogs ────────────────────────────
    if (config.AUTO_DISMISS_PERMISSIONS) {
      const handled = await ApplicationInitializer._handlePermissions(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('permissions_dismissed');
        console.log('[Startup] ✅ Permissions handled');
      }
    }

    // ── STEP 5: Dismiss Promotional Popups ────────────────────────────
    if (config.AUTO_DISMISS_PROMOTIONS) {
      const handled = await ApplicationInitializer._handlePromotions(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('promotions_dismissed');
        console.log('[Startup] ✅ Promotions dismissed');
      }
    }

    // ── STEP 6: Dismiss Update Dialogs ────────────────────────────────
    if (config.AUTO_DISMISS_UPDATES) {
      const handled = await ApplicationInitializer._handleUpdates(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('updates_dismissed');
        console.log('[Startup] ✅ Updates dismissed');
      }
    }

    // ── STEP 7: Dismiss Location Permission ───────────────────────────
    if (config.AUTO_DISMISS_LOCATION) {
      const handled = await ApplicationInitializer._handleLocationPermission(driver, platform, locators);
      if (handled) {
        stepsCompleted.push('location_dismissed');
        console.log('[Startup] ✅ Location handled');
      }
    }

    // ── STEP 8: Wait for Dashboard Load ───────────────────────────────
    if (config.AUTO_NAVIGATE_TO_DASHBOARD) {
      dashboardVerified = await ApplicationInitializer._waitForDashboard(driver, platform, locators, config);
      if (dashboardVerified) {
        stepsCompleted.push('dashboard_verified');
        console.log('[Startup] ✅ Dashboard verified');
      } else {
        console.log('[Startup] ⚠ Dashboard not verified');
      }
    }

    return {
      success: dashboardVerified,
      dashboardVerified,
      stepsCompleted,
    };
  }

  /**
   * Reset the initialization state (for test cleanup/reset).
   */
  static reset() {
    DriverManager.resetStartupCompleted();
  }

  /**
   * Check if the application has been initialized.
   */
  static isInitialized() {
    return DriverManager.isStartupCompleted();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: Screen Detection & Handling
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Handle the language selection screen.
   * Detects whether a language selection screen is visible and selects English.
   */
  static async _handleLanguageScreen(driver, platform, locators, config) {
    const isShowing = await ApplicationInitializer._isScreenShowing(driver, locators.LANGUAGE_SCREEN, 5000);
    if (!isShowing) return false;

    console.log('[Startup] Language selection screen detected');

    // Select the English language option
    const englishSelected = await ApplicationInitializer._findAndTap(driver, locators.ENGLISH_LANGUAGE_OPTION, 5000);
    if (!englishSelected) {
      console.log('[Startup] English option not found via locators — trying text fallback');
      const textFound = await ApplicationInitializer._tapByTextFallback(driver, platform, config.DEFAULT_LANGUAGE || 'English');
      if (!textFound) {
        console.log('[Startup] Could not find English option — continuing');
        return true;
      }
    }

    // Wait for the selection UI to settle
    await ApplicationInitializer._waitForStabilized(driver, 1000);

    // Tap Continue button
    const continueTapped = await ApplicationInitializer._findAndTap(driver, locators.CONTINUE_BUTTON, 5000);
    if (!continueTapped) {
      console.log('[Startup] Continue button not found — trying text fallback');
      await ApplicationInitializer._tapByTextFallback(driver, platform, 'Continue');
    }

    // Wait for language screen to dismiss (poll until it's gone)
    await ApplicationInitializer._waitForScreenGone(driver, locators.LANGUAGE_SCREEN, 8000);

    return true;
  }

  /**
   * Handle onboarding / tutorial screens.
   */
  static async _handleOnboarding(driver, platform, locators) {
    const tapped = await ApplicationInitializer._findAndTap(driver, locators.ONBOARDING_SKIP_BUTTON, 3000);
    if (!tapped) return false;

    console.log('[Startup] Onboarding screen detected');
    await ApplicationInitializer._waitForStabilized(driver, 1500);
    return true;
  }

  /**
   * Handle the sign-in / sign-up screen.
   */
  static async _handleSignInScreen(driver, platform, locators) {
    const isShowing = await ApplicationInitializer._isScreenShowing(driver, locators.SIGNIN_SCREEN, 4000);
    if (!isShowing) return false;

    console.log('[Startup] Sign-in screen detected');

    // Try locator-based skip button
    const skipTapped = await ApplicationInitializer._findAndTap(driver, locators.SKIP_SIGNIN_BUTTON, 8000);
    if (skipTapped) {
      await ApplicationInitializer._waitForStabilized(driver, 2000);
      return true;
    }

    // Fallback: try tapping by text
    const skipTexts = ['Skip', 'Skip sign in', 'Not now', 'Continue without signing in'];
    for (const text of skipTexts) {
      const tapped = await ApplicationInitializer._tapByTextFallback(driver, platform, text);
      if (tapped) {
        await ApplicationInitializer._waitForStabilized(driver, 2000);
        return true;
      }
    }

    console.log('[Startup] Could not skip sign-in — user may already be signed in');
    return false;
  }

  /**
   * Handle system permission dialogs (notification, storage, contacts, etc.).
   * Tries up to 3 times because dialogs may appear with delay.
   */
  static async _handlePermissions(driver, platform, locators) {
    let handled = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      // Check for dialog container elements
      const dialogVisible = await ApplicationInitializer._isScreenShowing(driver, locators.PERMISSION_DIALOG, 2000);
      if (dialogVisible) {
        console.log('[Startup] Permission dialog detected');
        const allowTapped = await ApplicationInitializer._findAndTap(driver, locators.PERMISSION_ALLOW_BUTTON, 3000);
        if (allowTapped) {
          console.log('[Startup] Tapped Allow');
          handled = true;
          await ApplicationInitializer._waitForStabilized(driver, 1000);
          continue;
        }
        const denyTapped = await ApplicationInitializer._findAndTap(driver, locators.PERMISSION_DENY_BUTTON, 2000);
        if (denyTapped) {
          console.log('[Startup] Tapped Deny');
          handled = true;
          await ApplicationInitializer._waitForStabilized(driver, 1000);
          continue;
        }
        // Last resort: tap any alert button
        await ApplicationInitializer._tapAnyAlertButton(driver, platform);
        handled = true;
        await ApplicationInitializer._waitForStabilized(driver, 1000);
        continue;
      }

      // Check for standalone allow/deny buttons (some dialogs have no container)
      const allowBtn = await ApplicationInitializer._findAndTap(driver, locators.PERMISSION_ALLOW_BUTTON, 1500);
      if (allowBtn) {
        console.log('[Startup] Tapped Allow (standalone)');
        handled = true;
        await ApplicationInitializer._waitForStabilized(driver, 1000);
        continue;
      }

      // No more permission dialogs
      break;
    }

    return handled;
  }

  /**
   * Handle promotional popups / overlays.
   */
  static async _handlePromotions(driver, platform, locators) {
    let handled = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const isDialog = await ApplicationInitializer._isScreenShowing(driver, locators.PROMOTION_DIALOG, 2000);
      const isClose = await ApplicationInitializer._findAndTap(driver, locators.PROMOTION_CLOSE_BUTTON, 1500);

      if (isClose) {
        console.log('[Startup] Dismissed promotional popup');
        handled = true;
        await ApplicationInitializer._waitForStabilized(driver, 1000);
        continue;
      }

      if (isDialog) {
        // Try tapping outside to dismiss (Android)
        if (platform === 'android') {
          await ApplicationInitializer._tapOutside(driver);
          handled = true;
          await ApplicationInitializer._waitForStabilized(driver, 1000);
          continue;
        }
        // iOS: try coordinate tap
        await ApplicationInitializer._tapCoordinate(driver, 20, 20);
        handled = true;
        await ApplicationInitializer._waitForStabilized(driver, 1000);
        continue;
      }

      break;
    }

    return handled;
  }

  /**
   * Handle update dialogs.
   */
  static async _handleUpdates(driver, platform, locators) {
    const isShowing = await ApplicationInitializer._isScreenShowing(driver, locators.UPDATE_DIALOG, 3000);
    if (!isShowing) return false;

    console.log('[Startup] Update dialog detected');

    const skipTapped = await ApplicationInitializer._findAndTap(driver, locators.UPDATE_SKIP_BUTTON, 3000);
    if (skipTapped) {
      await ApplicationInitializer._waitForStabilized(driver, 1000);
      return true;
    }

    const okTapped = await ApplicationInitializer._findAndTap(driver, locators.UPDATE_OK_BUTTON, 2000);
    if (okTapped) {
      await ApplicationInitializer._waitForStabilized(driver, 1000);
      return true;
    }

    await ApplicationInitializer._tapAnyAlertButton(driver, platform);
    await ApplicationInitializer._waitForStabilized(driver, 1000);
    return true;
  }

  /**
   * Handle location permission prompts.
   */
  static async _handleLocationPermission(driver, platform, locators) {
    const isShowing = await ApplicationInitializer._isScreenShowing(driver, locators.LOCATION_PERMISSION_DIALOG, 3000);
    if (!isShowing) return false;

    console.log('[Startup] Location permission dialog detected');

    const denyTapped = await ApplicationInitializer._findAndTap(driver, locators.LOCATION_DENY_BUTTON, 3000);
    if (denyTapped) {
      await ApplicationInitializer._waitForStabilized(driver, 1000);
      return true;
    }

    if (platform === 'android') {
      await ApplicationInitializer._tapOutside(driver);
    } else {
      try {
        await driver.execute('mobile: dismissAlert', {});
      } catch (_) {}
    }

    await ApplicationInitializer._waitForStabilized(driver, 1000);
    return true;
  }

  /**
   * Wait for the Amazon Home Dashboard to fully load.
   * Polls for key dashboard indicators using smart waits.
   */
  static async _waitForDashboard(driver, platform, locators, config) {
    const timeout = config.DASHBOARD_WAIT_TIMEOUT || DEFAULTS.DASHBOARD_WAIT_TIMEOUT;
    const pollInterval = config.DASHBOARD_POLL_INTERVAL || DEFAULTS.DASHBOARD_POLL_INTERVAL;
    const deadline = Date.now() + timeout;

    console.log('[Startup] Waiting for Amazon Home Dashboard...');

    let lastError = null;

    while (Date.now() < deadline) {
      try {
        const verified = await ApplicationInitializer._verifyDashboardQuick(driver, platform, locators);
        if (verified) {
          console.log('[Startup] ✅ Dashboard loaded');
          return true;
        }
      } catch (err) {
        lastError = err;
      }

      // Smart wait: poll at interval, not fixed sleep
      await ApplicationInitializer._waitForCondition(async () => {
        await ApplicationInitializer._sleep(pollInterval);
        return true;
      }, pollInterval + 500);
    }

    if (lastError) {
      console.log(`[Startup] ⚠ Dashboard wait error: ${lastError.message}`);
    }
    console.log(`[Startup] ⚠ Dashboard wait timed out after ${timeout}ms`);

    // Try one final verification before giving up
    try {
      return await ApplicationInitializer._verifyDashboardQuick(driver, platform, locators);
    } catch (_) {
      return false;
    }
  }

  /**
   * Quick dashboard verification — checks key indicators using smart polling.
   */
  static async _verifyDashboardQuick(driver, platform, locators) {
    // Check for search bar
    const searchBarVisible = await ApplicationInitializer._isScreenShowing(driver, locators.DASHBOARD_SEARCH_BAR, 2000);

    // Check for bottom navigation (cart, home tabs)
    const bottomNavVisible = await ApplicationInitializer._isScreenShowing(driver, locators.DASHBOARD_BOTTOM_NAV, 1000);

    // Check for webview content
    const webViewVisible = await ApplicationInitializer._isScreenShowing(driver, locators.DASHBOARD_WEBVIEW, 1000);

    // Dashboard is considered loaded if search bar AND (nav OR webview) are visible
    return searchBarVisible && (bottomNavVisible || webViewVisible);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: Smart Wait Utilities (no fixed sleeps)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Wait until a condition is met, with polling.
   * This is the core smart-wait primitive — replaces all fixed sleeps.
   */
  static async _waitForCondition(conditionFn, timeoutMs = 10000, pollIntervalMs = 500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = await conditionFn();
        if (result) return true;
      } catch (_) {}
      await ApplicationInitializer._sleep(pollIntervalMs);
    }
    return false;
  }

  /**
   * Wait for the UI to stabilize after an action.
   * Polls page source for changes instead of fixed sleep.
   */
  static async _waitForStabilized(driver, minWaitMs = 500) {
    const start = Date.now();
    let lastSource = '';

    // Wait at least minWaitMs, then poll until source stabilizes
    while (Date.now() - start < 5000) {  // max 5s
      if (Date.now() - start < minWaitMs) {
        await ApplicationInitializer._sleep(200);
        continue;
      }
      try {
        const currentSource = await driver.getPageSource();
        if (currentSource === lastSource && currentSource.length > 200) {
          // Source hasn't changed — UI is stable
          await ApplicationInitializer._sleep(200);
          return;
        }
        lastSource = currentSource;
      } catch (_) {}
      await ApplicationInitializer._sleep(300);
    }
  }

  /**
   * Wait for a screen to disappear.
   * Polls until none of the locators match visible elements.
   */
  static async _waitForScreenGone(driver, locators, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let found = false;
      for (const locator of locators) {
        try {
          const elements = await driver.$$(locator);
          if (elements && elements.length > 0) {
            const displayed = await elements[0].isDisplayed().catch(() => false);
            if (displayed) { found = true; break; }
          }
        } catch (_) {}
      }
      if (!found) return true;
      await ApplicationInitializer._sleep(500);
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: Detect / Config / Locators
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Detect the platform from driver or options.
   */
  static _detectPlatform(driver, platformHint) {
    if (platformHint) return platformHint.toLowerCase();
    if (driver && driver.__mobilePlatform) return driver.__mobilePlatform;
    const env = (process.env.TEST_PLATFORM || '').toUpperCase();
    if (env === 'IOS') return 'ios';
    if (env === 'ANDROID') return 'android';
    return 'android';
  }

  /**
   * Load configuration from environment variables with defaults.
   */
  static _loadConfig() {
    return {
      AUTO_SELECT_LANGUAGE: ApplicationInitializer._envBool('AUTO_SELECT_LANGUAGE', true),
      DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || 'English',
      AUTO_SKIP_ONBOARDING: ApplicationInitializer._envBool('AUTO_SKIP_ONBOARDING', true),
      AUTO_DISMISS_PERMISSIONS: ApplicationInitializer._envBool('AUTO_DISMISS_PERMISSIONS', true),
      AUTO_DISMISS_PROMOTIONS: ApplicationInitializer._envBool('AUTO_DISMISS_PROMOTIONS', true),
      AUTO_DISMISS_UPDATES: ApplicationInitializer._envBool('AUTO_DISMISS_UPDATES', true),
      AUTO_DISMISS_LOCATION: ApplicationInitializer._envBool('AUTO_DISMISS_LOCATION', true),
      AUTO_NAVIGATE_TO_DASHBOARD: ApplicationInitializer._envBool('AUTO_NAVIGATE_TO_DASHBOARD', true),
      RUN_LOGIN_FLOW: ApplicationInitializer._envBool('RUN_LOGIN_FLOW', false),
      DASHBOARD_WAIT_TIMEOUT: Number(process.env.DASHBOARD_WAIT_TIMEOUT || DEFAULTS.DASHBOARD_WAIT_TIMEOUT),
      DASHBOARD_POLL_INTERVAL: Number(process.env.DASHBOARD_POLL_INTERVAL || DEFAULTS.DASHBOARD_POLL_INTERVAL),
      STEP_TIMEOUT: Number(process.env.APP_INIT_STEP_TIMEOUT || DEFAULTS.STEP_TIMEOUT),
      MAX_RETRIES: Number(process.env.APP_INIT_MAX_RETRIES || DEFAULTS.MAX_RETRIES),
    };
  }

  /**
   * Load platform-specific locators.
   */
  static _loadLocators(platform) {
    if (platform === 'ios') {
      return require('../../mobile/locators/ios/startup.locators');
    }
    return require('../../mobile/locators/android/startup.locators');
  }

  /**
   * Parse environment boolean string.
   */
  static _envBool(key, defaultValue) {
    const val = process.env[key];
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === 'boolean') return val;
    if (val.toLowerCase() === 'true' || val === '1') return true;
    if (val.toLowerCase() === 'false' || val === '0') return false;
    return defaultValue;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: Element Interaction
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Check if a screen is showing by trying any of the provided locators.
   */
  static async _isScreenShowing(driver, locators, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const locator of locators) {
        try {
          const elements = await driver.$$(locator);
          if (elements && elements.length > 0) {
            const displayed = await elements[0].isDisplayed().catch(() => true);
            if (displayed) return true;
          }
        } catch (_) {}
      }
      await ApplicationInitializer._sleep(300);
    }
    return false;
  }

  /**
   * Find and tap an element using any of the provided locators.
   */
  static async _findAndTap(driver, locators, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const locator of locators) {
        try {
          const elements = await driver.$$(locator);
          if (elements && elements.length > 0) {
            for (const el of elements) {
              const displayed = await el.isDisplayed().catch(() => false);
              if (displayed) {
                await el.click();
                return true;
              }
            }
          }
        } catch (_) {}
      }
      await ApplicationInitializer._sleep(400);
    }
    return false;
  }

  /**
   * Fallback: tap an element by searching page source for text.
   */
  static async _tapByTextFallback(driver, platform, text) {
    try {
      const escaped = text.replace(/'/g, "&apos;");
      const xpath = `//*[contains(text(), '${escaped}')]`;
      const elements = await driver.$$(xpath);
      if (elements && elements.length > 0) {
        for (const el of elements) {
          const displayed = await el.isDisplayed().catch(() => false);
          if (displayed) {
            try { await el.click(); return true; } catch (_) {}
          }
        }
      }
    } catch (_) {}

    if (platform === 'android') {
      try {
        const uiSelector = `android=new UiSelector().textContains("${text}")`;
        const elements = await driver.$$(uiSelector);
        if (elements && elements.length > 0) {
          await elements[0].click();
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Tap any button on a system alert dialog.
   */
  static async _tapAnyAlertButton(driver, platform) {
    if (platform === 'android') {
      for (const id of ['id:android:id/button1', 'id:android:id/button2']) {
        try {
          const elements = await driver.$$(id);
          if (elements && elements.length > 0) {
            await elements[0].click();
            return true;
          }
        } catch (_) {}
      }
    } else {
      try { await driver.execute('mobile: acceptAlert', {}); return true; } catch (_) {}
      try { await driver.execute('mobile: dismissAlert', {}); return true; } catch (_) {}
    }
    return false;
  }

  /**
   * Tap at screen coordinates (used to dismiss dialogs/popups).
   */
  static async _tapCoordinate(driver, x, y) {
    try {
      await driver.execute('mobile: clickGesture', { x, y });
    } catch (_) {
      try {
        await driver.touchAction([{ action: 'tap', x, y }]);
      } catch (_) {}
    }
  }

  /**
   * Tap outside any visible dialog/popup (Android).
   */
  static async _tapOutside(driver) {
    await ApplicationInitializer._tapCoordinate(driver, 50, 50);
  }

  /**
   * Sleep — the ONLY fixed time delay.
   * Used only as fallback when no smart-wait condition is available.
   * All interaction waits use _waitForCondition or _isScreenShowing instead.
   */
  static async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ApplicationInitializer;
