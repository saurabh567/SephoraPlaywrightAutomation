import logger from '../../utils/logger';
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
 *   - iOS Safari browser (JS-based WebView cleanup + simulator-level data removal)
 *   - iOS native apps with WebView
 *
 * iOS Safari Cleanup Strategy:
 *   1. Simulator-level: Remove Safari filesystem data via xcrun simctl spawn
 *      (rm -rf Safari caches, WebKit data, cookies database)
 *   2. Kill Safari process to force data flush
 *   3. JS-based cleanup in WebView context (cookies, localStorage, etc.)
 *   4. Multi-domain cookie clearing for amazon.in, www.amazon.in, etc.
 *
 * Thread-safe (no shared mutable state) — safe for parallel Cucumber execution.
 */


// ─────────────────────────────────────────────────────────────────────────────
// WebView / Browser JavaScript snippets
// ─────────────────────────────────────────────────────────────────────────────

const JS_CLEAR_COOKIES = `document.cookie.split(";").forEach(function(c) {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/;domain=" + location.hostname);
  // Also clear with and without leading dot for subdomain coverage
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/;domain=." + location.hostname);
});`;

const JS_CLEAR_LOCAL_STORAGE = 'try { localStorage.clear(); } catch (e: any) {}';
const JS_CLEAR_SESSION_STORAGE = 'try { sessionStorage.clear(); } catch (e: any) {}';
const JS_CLEAR_INDEXED_DB = `try {
  indexedDB.databases().then(function(dbs) {
    dbs.forEach(function(db) {
      if (db.name) { indexedDB.deleteDatabase(db.name); }
    });
  });
} catch (e: any) {}`;
const JS_CLEAR_CACHE = `try {
  if (window.caches) {
    caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); });
  }
} catch (e: any) {}`;
const JS_CLEAR_SERVICE_WORKERS = `try {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(reg) { reg.unregister(); });
    });
  }
} catch (e: any) {}`;

const JS_CLEAR_ALL_STORAGE = [
  JS_CLEAR_COOKIES,
  JS_CLEAR_LOCAL_STORAGE,
  JS_CLEAR_SESSION_STORAGE,
  JS_CLEAR_INDEXED_DB,
  JS_CLEAR_CACHE,
  JS_CLEAR_SERVICE_WORKERS
].join('\n');

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
async function clearWeb(options: any = {}) {
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
    logger.info('[CacheCleanup][Web] localStorage, sessionStorage, IndexedDB, Cache, and Service Workers cleared');
  } catch (err: any) {
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
async function androidClearAppData(packageName: any) {
  const { execSync } = require('child_process');
  for (const pkg of [packageName].flat()) {
    try {
      execSync(`adb shell pm clear ${pkg}`, { timeout: 15000, stdio: 'pipe' });
      logger.info(`[CacheCleanup] Android: Cleared app data for ${pkg}`);
    } catch (err: any) {
      logger.warn(`[CacheCleanup] Android: Could not clear data for ${pkg}: ${err.message}`);
    }
  }
}

/**
 * Clear Android WebView browser state via JavaScript execution in the current context.
 * This is a lighter alternative when app data cannot be cleared mid-session.
 */
async function androidClearWebViewViaJS(driver: any) {
  try {
    const contexts = await driver.getContexts();
    const webviewContext = contexts.find((ctx: any) => ctx.toLowerCase().includes('webview'));
    if (webviewContext) {
      await driver.switchContext(webviewContext);
    }
  } catch (err: any) {
    logger.warn(`[CacheCleanup] Android: Could not switch to WebView context: ${err.message}`);
    return;
  }

  try {
    const source = await driver.getPageSource();
    if (source.includes('<html') || source.includes('<WEBVIEW')) {
      await driver.execute(JS_CLEAR_ALL_STORAGE);
      logger.info('[CacheCleanup] Android: Cleared cookies, localStorage, sessionStorage, IndexedDB, cache via JS');
    }
  } catch (err: any) {
    logger.warn(`[CacheCleanup] Android: JS storage clear failed: ${err.message}`);
  }
}

/**
 * Clear Android browser state using Appium mobile commands.
 */
async function androidClearViaAppiumCommands(driver: any) {
  try {
    await driver.execute('mobile: clearCookies');
    logger.info('[CacheCleanup] Android: Cleared cookies via mobile:clearCookies');
  } catch (err: any) {
    logger.warn(`[CacheCleanup] Android: mobile:clearCookies failed: ${err.message}`);
  }
}

/**
 * Primary Android cache cleanup — clears app data via ADB first, then JS fallback.
 */
async function clearAndroid(driver: any, skipAdb = false) {
  // Step 1: Clear app data via ADB (most thorough — removes everything)
  if (!skipAdb) {
    await androidClearAppData(ANDROID_WEBVIEW_PACKAGES);
  } else {
    logger.info('[CacheCleanup] Android: Skipping ADB app data clear (skipAdb=true)');
  }

  // Step 2: Try Appium mobile commands inside the current session
  try {
    await androidClearViaAppiumCommands(driver);
  } catch (err: any) {
    logger.warn(`[CacheCleanup] Android: Appium command cleanup failed: ${err.message}`);
  }

  // Step 3: JS fallback in WebView context
  try {
    await androidClearWebViewViaJS(driver);
  } catch (err: any) {
    logger.warn(`[CacheCleanup] Android: JS WebView cleanup failed: ${err.message}`);
  }

  logger.info('[CacheCleanup] Android: Cache cleanup completed');
}

// ─────────────────────────────────────────────────────────────────────────────
// iOS cleanup strategies
//
// Strategy (tiered):
//   1. Simulator-level: Remove Safari data directories via xcrun simctl spawn
//      (rm -rf ~/Library/Caches/com.apple.Safari, ~/Library/Safari, ~/Library/WebKit)
//   2. Terminate Safari process to flush all data
//   3. JS-based WebView cleanup (cookies, localStorage, sessionStorage, IndexedDB, Cache API)
//   4. Multi-domain cookie clearing for Amazon-internal domains
//
// Does NOT use unsupported Appium commands:
//   - mobile:clearSafariData  ✗ (not supported by Appium)
//   - mobile:clearCookies      ✗ (not supported for iOS)
//   - mobile:clearPasteboard   ✗ (not supported)
// ─────────────────────────────────────────────────────────────────────────────

const IOS_SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

/**
 * Remove Safari persistent data at the simulator filesystem level.
 * This is the most thorough cleanup — removes cookies database, cache,
 * localStorage files, IndexedDB, and Service Worker registrations.
 */
async function iosRemoveSafariSimulatorData() {
  if (process.env.NO_RESET === "true") {
    logger.info("[CacheCleanup][iOS] NO_RESET=true -- skipping Safari simulator data removal to prevent Web Inspector disconnection");
    return false;
  }
  try {
    const { execSync } = require('child_process');

    // Kill Safari first so file locks are released
    try {
      execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 5000 });
    } catch (_: any) {}

    // Wait for process to release file locks
    await new Promise(function(resolve) { setTimeout(resolve, 1000); });

    // Remove Safari data directories at simulator filesystem level
    // These are the iOS simulator paths for Safari persistent storage
    const safariDataDirs = [
      // Safari caches and website data
      '~/Library/Caches/com.apple.Safari',
      // Safari preferences and state
      '~/Library/Safari',
      // WebKit framework data (cookies, localStorage, IndexedDB)
      '~/Library/WebKit',
      // Safari-specific website data store
      '~/Library/Caches/com.apple.WebKit.WebContent',
      // Safari safe browsing data
      '~/Library/Caches/com.apple.Safari.SafeBrowsing',
    ];

    for (var i = 0; i < safariDataDirs.length; i++) {
      try {
        execSync(
          'xcrun simctl spawn booted rm -rf ' + safariDataDirs[i] + ' 2>/dev/null || true',
          { timeout: 5000, shell: true }
        );
      } catch (_: any) {}
    }

    logger.info('[CacheCleanup][iOS] Safari simulator data directories removed');

    // Kill Safari again after data removal (it may have restarted)
    try {
      execSync('xcrun simctl spawn booted launchctl kill SIGTERM system/com.apple.Safari 2>/dev/null || true', { timeout: 5000 });
    } catch (_: any) {}

    return true;
  } catch (err: any) {
    logger.warn('[CacheCleanup][iOS] Simulator data removal failed (non-fatal): ' + (err.message || 'unknown'));
    return false;
  }
}

/**
 * Clear iOS WebView state via JavaScript execution.
 * Only runs if a WebView context actually exists — never attempts on native context alone.
 */
async function iosClearWebViewViaJS(driver: any) {
  let previousContext = null;
  try {
    previousContext = await driver.getContext();
  } catch (err: any) {
    logger.warn(`[CacheCleanup] iOS: Could not get context: ${err.message}`);
    return;
  }

  const webviewContexts: any = [];
  try {
    const contexts = await driver.getContexts();
    contexts.forEach((ctx: any) => {
      if (ctx.toLowerCase().includes('webview')) {
        webviewContexts.push(ctx);
      }
    });
  } catch (err: any) {
    logger.warn(`[CacheCleanup] iOS: Could not list contexts: ${err.message}`);
  }

  if (webviewContexts.length === 0) {
    logger.info('[CacheCleanup] iOS: No WebView context found — skipping WebView JS cleanup');
    return;
  }

  for (const ctx of webviewContexts) {
    try {
      await driver.switchContext(ctx);
      // Execute the full storage cleanup including multi-domain cookies and service workers
      await driver.execute(JS_CLEAR_ALL_STORAGE);
      logger.info(`[CacheCleanup] iOS: Cleared WebView storage in context: ${ctx}`);
    } catch (err: any) {
      logger.warn(`[CacheCleanup] iOS: JS clear failed in context ${ctx}: ${err.message}`);
    }
  }

  if (previousContext) {
    try {
      await driver.switchContext(previousContext);
    } catch (err: any) {
      logger.warn(`[CacheCleanup] iOS: Could not restore context: ${err.message}`);
    }
  }
}

/**
 * Clear iOS Safari cookies via JavaScript (executed in Safari's WebView context).
 * Enhanced to clear cookies across multiple Amazon-related domains.
 */
async function iosClearSafariCookiesViaJS(driver: any) {
  let previousContext = null;
  try {
    previousContext = await driver.getContext();
    const contexts = await driver.getContexts();
    const safariContext = contexts.find((ctx: any) =>
      ctx.toLowerCase().includes('safari') || ctx.includes('WEBVIEW_safari')
    );
    if (safariContext) {
      await driver.switchContext(safariContext);

      // Clear cookies for the current domain
      await driver.execute(JS_CLEAR_COOKIES);

      // Use JS to also clear cookies for common Amazon subdomains
      await driver.execute(function() {
        var domains = [
          location.hostname,
          'www.amazon.in',
          'amazon.in',
          'payments.amazon.in',
          'sellercentral.amazon.in',
          'affiliate-program.amazon.in',
        ];
        var cookieParts = document.cookie.split(';');
        for (var d = 0; d < domains.length; d++) {
          for (var c = 0; c < cookieParts.length; c++) {
            var name = cookieParts[c].split('=')[0];
            if (name) {
              document.cookie = name.trim() + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=' + domains[d];
              document.cookie = name.trim() + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.' + domains[d];
            }
          }
        }
      });

      logger.info('[CacheCleanup] iOS: Cleared Safari cookies via JS (multi-domain)');
    }
  } catch (err: any) {
    logger.warn(`[CacheCleanup] iOS: Safari JS cookie clear failed: ${err.message}`);
  }

  if (previousContext) {
    try {
      await driver.switchContext(previousContext);
    } catch (err: any) {
      logger.warn(`[CacheCleanup] iOS: Could not restore context: ${err.message}`);
    }
  }
}

/**
 * Primary iOS cache cleanup.
 *
 * Tiered approach:
 *   1. Simulator-level Safari data directory removal (most thorough)
 *   2. WebView storage cleanup via JavaScript
 *   3. Multi-domain Safari cookie clearing
 *
 * @param {object} driver - WebDriverIO/Appium driver
 * @param {boolean} [isSafari=false] - true if running iOS Safari browser
 */
async function clearIOS(driver: any, isSafari = false) {
  // Tier 1: Simulator-level Safari data removal (most thorough)
  // This removes cookies database files, cache files, localStorage,
  // IndexedDB, and Service Worker registrations from the filesystem.
  if (isSafari) {
    await iosRemoveSafariSimulatorData();
  }

  // Tier 2: Clear WebView storage via JavaScript
  await iosClearWebViewViaJS(driver);

  // Tier 3: Clear Safari cookies via JavaScript if running in Safari mode
  if (isSafari) {
    await iosClearSafariCookiesViaJS(driver);
  }

  logger.info('[CacheCleanup] iOS: Cache cleanup completed (simulator-level + JS)');
}

/**
 * Post-scenario cleanup — clears any remaining state that might leak.
 * Runs after the scenario completes, before the next scenario begins.
 */
async function clearPostScenario(options: any = {}) {
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
    } catch (err: any) {
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
async function clearAll(options: any = {}) {
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

export { clearAll, clearWeb, clearPostScenario, clearAndroid, clearIOS, iosRemoveSafariSimulatorData, JS_CLEAR_ALL_STORAGE, JS_CLEAR_COOKIES, JS_CLEAR_LOCAL_STORAGE, JS_CLEAR_SESSION_STORAGE, JS_CLEAR_INDEXED_DB, ANDROID_AMAZON_PACKAGE, ANDROID_CHROME_PACKAGE, IOS_SAFARI_BUNDLE_ID };
export default { clearAll: clearAll, clearWeb: clearWeb, clearPostScenario: clearPostScenario, clearAndroid: clearAndroid, clearIOS: clearIOS, iosRemoveSafariSimulatorData: iosRemoveSafariSimulatorData, JS_CLEAR_ALL_STORAGE: JS_CLEAR_ALL_STORAGE, JS_CLEAR_COOKIES: JS_CLEAR_COOKIES, JS_CLEAR_LOCAL_STORAGE: JS_CLEAR_LOCAL_STORAGE, JS_CLEAR_SESSION_STORAGE: JS_CLEAR_SESSION_STORAGE, JS_CLEAR_INDEXED_DB: JS_CLEAR_INDEXED_DB, ANDROID_AMAZON_PACKAGE: ANDROID_AMAZON_PACKAGE, ANDROID_CHROME_PACKAGE: ANDROID_CHROME_PACKAGE, IOS_SAFARI_BUNDLE_ID: IOS_SAFARI_BUNDLE_ID };
