/**
 * BrowserCacheCleanup — reusable browser cache cleanup utility.
 *
 * Clears browser state (cookies, localStorage, sessionStorage, IndexedDB, cache)
 * before each test scenario on Web (Playwright), Android, and iOS.
 *
 * Usage:
 *   const BrowserCacheCleanup = require('./framework/common/BrowserCacheCleanup');
 *
 *   // Web (Playwright page)
 *   await BrowserCacheCleanup.clearWeb({ page });
 *
 *   // Mobile (Appium/WebDriverIO driver)
 *   await BrowserCacheCleanup.clearAll({ driver, platform: 'ANDROID' });
 *
 * Supports:
 *   - Web (Playwright) — cookies, localStorage, sessionStorage, IndexedDB
 *   - Android native apps with WebView (Amazon app)
 *   - iOS Safari browser
 *   - iOS native apps with WebView
 *
 * Thread-safe (no shared mutable state) — safe for parallel Cucumber execution.
 */

const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// WebView / Browser JavaScript snippets
// ─────────────────────────────────────────────────────────────────────────────

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
const JS_CLEAR_CACHE = `try {
  if (window.caches) {
    caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); });
  }
} catch(e) {}`;

const JS_CLEAR_ALL_STORAGE = [
  JS_CLEAR_COOKIES,
  JS_CLEAR_LOCAL_STORAGE,
  JS_CLEAR_SESSION_STORAGE,
  JS_CLEAR_INDEXED_DB,
  JS_CLEAR_CACHE
].join('\n');

const JS_RELOAD = 'window.location.reload(true)';

// ─────────────────────────────────────────────────────────────────────────────
// Web (Playwright) cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clear all browser state for a Playwright page.
 * Runs inside the page context to clear cookies, localStorage,
 * sessionStorage, IndexedDB, and Cache API.
 *
 * For fresh pages on about:blank, first navigates to the base URL
 * so storage APIs resolve against a valid origin.
 *
 * @param {object} options
 * @param {object} options.page       - Playwright Page object
 * @param {string} [options.baseUrl]  - Base URL to navigate to before clearing (optional)
 */
async function clearWeb(options = {}) {
  const { page, baseUrl } = options;

  if (!page) {
    logger.warn('[CacheCleanup][Web] No page provided — skipping cleanup');
    return;
  }

  try {
    // Clear cookies at the context level (doesn't need a page URL)
    const context = page.context();
    if (context && typeof context.clearCookies === 'function') {
      await context.clearCookies();
      logger.info('[CacheCleanup][Web] Cookies cleared via context.clearCookies()');
    }

    // If page is on about:blank, navigate to base URL first so storage APIs work
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === 'about:blank') {
      const targetUrl = baseUrl || 'https://www.amazon.in';
      logger.info(`[CacheCleanup][Web] Page on blank — navigating to ${targetUrl} before clearing storage`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    }

    // Clear localStorage, sessionStorage, IndexedDB, and Cache API via page JS
    await page.evaluate(JS_CLEAR_ALL_STORAGE);
    logger.info('[CacheCleanup][Web] localStorage, sessionStorage, IndexedDB, and Cache cleared');
  } catch (err) {
    logger.warn(`[CacheCleanup][Web] Cleanup failed: ${err.message}`);
  }

  logger.info('[CacheCleanup][Web] Cache cleanup completed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Android cleanup strategies
// ─────────────────────────────────────────────────────────────────────────────

const ANDROID_AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';
const ANDROID_CHROME_PACKAGE = 'com.android.chrome';
const ANDROID_WEBVIEW_PACKAGES = [ANDROID_AMAZON_PACKAGE, ANDROID_CHROME_PACKAGE];

/**
 * Clear Android app data via ADB (pm clear).
 * This removes cookies, localStorage, sessionStorage, cache, and history in one shot.
 */
async function androidClearAppData(packageName) {
  const { execSync } = require('child_process');
  for (const pkg of [packageName].flat()) {
    try {
      execSync(`adb shell pm clear ${pkg}`, { timeout: 15000, stdio: 'pipe' });
      logger.info(`[CacheCleanup] Android: Cleared app data for ${pkg}`);
    } catch (err) {
      logger.warn(`[CacheCleanup] Android: Could not clear data for ${pkg}: ${err.message}`);
    }
  }
}

/**
 * Clear Android WebView browser state via JavaScript execution in the current context.
 * This is a lighter alternative when app data cannot be cleared mid-session.
 */
async function androidClearWebViewViaJS(driver) {
  try {
    const contexts = await driver.getContexts();
    const webviewContext = contexts.find(ctx => ctx.toLowerCase().includes('webview'));
    if (webviewContext) {
      await driver.switchContext(webviewContext);
    }
  } catch (err) {
    logger.warn(`[CacheCleanup] Android: Could not switch to WebView context: ${err.message}`);
    return;
  }

  try {
    const source = await driver.getPageSource();
    if (source.includes('<html') || source.includes('<WEBVIEW')) {
      await driver.execute(JS_CLEAR_ALL_STORAGE);
      logger.info('[CacheCleanup] Android: Cleared cookies, localStorage, sessionStorage, IndexedDB, cache via JS');
    }
  } catch (err) {
    logger.warn(`[CacheCleanup] Android: JS storage clear failed: ${err.message}`);
  }
}

/**
 * Clear Android browser state using Appium mobile commands.
 */
async function androidClearViaAppiumCommands(driver) {
  try {
    await driver.execute('mobile: clearCookies');
    logger.info('[CacheCleanup] Android: Cleared cookies via mobile:clearCookies');
  } catch (err) {
    logger.warn(`[CacheCleanup] Android: mobile:clearCookies failed: ${err.message}`);
  }
}

/**
 * Primary Android cache cleanup — clears app data via ADB first, then JS fallback.
 */
async function clearAndroid(driver, skipAdb = false) {
  // Step 1: Clear app data via ADB (most thorough — removes everything)
  if (!skipAdb) {
    await androidClearAppData(ANDROID_WEBVIEW_PACKAGES);
  } else {
    logger.info('[CacheCleanup] Android: Skipping ADB app data clear (skipAdb=true)');
  }

  // Step 2: Try Appium mobile commands inside the current session
  try {
    await androidClearViaAppiumCommands(driver);
  } catch (err) {
    logger.warn(`[CacheCleanup] Android: Appium command cleanup failed: ${err.message}`);
  }

  // Step 3: JS fallback in WebView context
  try {
    await androidClearWebViewViaJS(driver);
  } catch (err) {
    logger.warn(`[CacheCleanup] Android: JS WebView cleanup failed: ${err.message}`);
  }

  logger.info('[CacheCleanup] Android: Cache cleanup completed');
}

// ─────────────────────────────────────────────────────────────────────────────
// iOS cleanup strategies
// ─────────────────────────────────────────────────────────────────────────────

const IOS_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

/**
 * Clear iOS Safari browser data via Appium mobile: commands.
 * These commands work on real devices and simulators running iOS 9+.
 */
async function iosClearSafariData(driver) {
  try {
    await driver.execute('mobile: clearPasteboard');
    logger.info('[CacheCleanup] iOS: Cleared pasteboard');
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: clearPasteboard failed: ${err.message}`);
  }

  // Clear Safari cookies via mobile command
  try {
    await driver.execute('mobile: clearSafariData');
    logger.info('[CacheCleanup] iOS: Cleared Safari data via mobile:clearSafariData');
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: mobile:clearSafariData failed: ${err.message}`);
  }

  // Delete Safari app data via terminate + remove
  try {
    await driver.terminateApp(IOS_SAFARI_BUNDLE_ID);
    logger.info('[CacheCleanup] iOS: Terminated Safari');
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: Terminate Safari failed: ${err.message}`);
  }
}

/**
 * Clear iOS WebView state via JavaScript execution.
 */
async function iosClearWebViewViaJS(driver) {
  let previousContext = null;
  try {
    previousContext = await driver.getContext();
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: Could not get context: ${err.message}`);
    return;
  }

  const webviewContexts = [];
  try {
    const contexts = await driver.getContexts();
    contexts.forEach(ctx => {
      if (ctx.toLowerCase().includes('webview')) {
        webviewContexts.push(ctx);
      }
    });
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: Could not list contexts: ${err.message}`);
  }

  for (const ctx of webviewContexts) {
    try {
      await driver.switchContext(ctx);
      await driver.execute(JS_CLEAR_ALL_STORAGE);
      logger.info(`[CacheCleanup] iOS: Cleared WebView storage in context: ${ctx}`);
    } catch (err) {
      logger.warn(`[CacheCleanup] iOS: JS clear failed in context ${ctx}: ${err.message}`);
    }
  }

  if (previousContext) {
    try {
      await driver.switchContext(previousContext);
    } catch (err) {
      logger.warn(`[CacheCleanup] iOS: Could not restore context: ${err.message}`);
    }
  }
}

/**
 * Clear iOS Safari cookies via JavaScript (executed in Safari's WebView context).
 */
async function iosClearSafariCookiesViaJS(driver) {
  let previousContext = null;
  try {
    previousContext = await driver.getContext();
    const contexts = await driver.getContexts();
    const safariContext = contexts.find(ctx =>
      ctx.toLowerCase().includes('safari') || ctx.includes('WEBVIEW_safari')
    );
    if (safariContext) {
      await driver.switchContext(safariContext);
      await driver.execute(JS_CLEAR_COOKIES);
      logger.info('[CacheCleanup] iOS: Cleared Safari cookies via JS');
    }
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: Safari JS cookie clear failed: ${err.message}`);
  }

  if (previousContext) {
    try {
      await driver.switchContext(previousContext);
    } catch (err) {
      logger.warn(`[CacheCleanup] iOS: Could not restore context: ${err.message}`);
    }
  }
}

/**
 * Primary iOS cache cleanup.
 */
async function clearIOS(driver, isSafari = false) {
  if (isSafari) {
    // For full Safari browser automation, use Appium mobile: commands
    await iosClearSafariData(driver);
  }

  // Clear WebView storage via JavaScript (works for both native apps and Safari)
  await iosClearWebViewViaJS(driver);
  await iosClearSafariCookiesViaJS(driver);

  // Try to clear cookies via native Appium command
  try {
    await driver.execute('mobile: clearCookies');
    logger.info('[CacheCleanup] iOS: Cleared cookies via mobile:clearCookies');
  } catch (err) {
    logger.warn(`[CacheCleanup] iOS: mobile:clearCookies failed: ${err.message}`);
  }

  logger.info('[CacheCleanup] iOS: Cache cleanup completed');
}

/**
 * Post-scenario cleanup — clears any remaining state that might leak.
 * Runs after the scenario completes, before the next scenario begins.
 */
async function clearPostScenario(options = {}) {
  const { page, driver, platform } = options;

  // Web: clear cookies and storage after each scenario
  if (page && platform === 'WEB') {
    try {
      const context = page.context();
      if (context && typeof context.clearCookies === 'function') {
        await context.clearCookies();
      }
      const url = page.url();
      if (url && url !== 'about:blank') {
        await page.evaluate(JS_CLEAR_ALL_STORAGE).catch(() => {});
      }
      logger.info('[CacheCleanup][Post] Post-scenario web cache cleared');
    } catch (err) {
      logger.warn(`[CacheCleanup][Post] Post-scenario web cleanup failed: ${err.message}`);
    }
    return;
  }

  // Mobile: no additional post-scenario cleanup needed beyond session delete
  if (driver) {
    logger.info('[CacheCleanup][Post] Mobile session will be closed — no additional cleanup needed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PLATFORMS = { WEB: 'WEB', ANDROID: 'ANDROID', IOS: 'IOS' };

/**
 * Clear all browser/app cache for the given mobile platform.
 *
 * @param {object} options
 * @param {object} options.driver        - WebDriverIO driver instance
 * @param {string} options.platform      - 'ANDROID' or 'IOS'
 * @param {boolean} [options.isSafari]   - true if running iOS Safari browser
 * @param {boolean} [options.skipAdb]    - true to skip ADB-based cleanup (Android only)
 */
async function clearAll(options = {}) {
  const { driver, platform, isSafari = false, skipAdb = false } = options;

  if (!driver) {
    logger.warn('[CacheCleanup] No driver provided — skipping cleanup');
    return;
  }

  if (!platform) {
    logger.warn('[CacheCleanup] No platform provided — skipping cleanup');
    return;
  }

  const normalizedPlatform = String(platform).toUpperCase();

  logger.info(`[CacheCleanup] Starting cache cleanup for ${normalizedPlatform}`);

  if (normalizedPlatform === TEST_PLATFORMS.ANDROID) {
    await clearAndroid(driver, skipAdb);
  } else if (normalizedPlatform === TEST_PLATFORMS.IOS) {
    await clearIOS(driver, isSafari);
  } else if (normalizedPlatform === TEST_PLATFORMS.WEB) {
    logger.warn('[CacheCleanup] Use clearWeb({ page }) for web platform instead of clearAll');
  } else {
    logger.warn(`[CacheCleanup] Unknown platform: ${platform}`);
  }

  logger.info(`[CacheCleanup] Cache cleanup finished for ${normalizedPlatform}`);
}

module.exports = {
  clearAll,
  clearWeb,
  clearPostScenario,
  clearAndroid,
  clearIOS,
  // Exported for unit testing
  JS_CLEAR_ALL_STORAGE,
  JS_CLEAR_COOKIES,
  JS_CLEAR_LOCAL_STORAGE,
  JS_CLEAR_SESSION_STORAGE,
  JS_CLEAR_INDEXED_DB,
  ANDROID_AMAZON_PACKAGE,
  ANDROID_CHROME_PACKAGE,
  IOS_SAFARI_BUNDLE_ID
};
