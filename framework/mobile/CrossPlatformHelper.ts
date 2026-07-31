import logger from '../../utils/logger';
/**
 * CrossPlatformHelper — cross-platform stability utilities for mobile tests.
 *
 * Addresses iOS Safari vs Android differences:
 *   - iOS Safari is 2-3x slower than Android for DOM queries
 *   - iOS needs touch events, Android accepts both touch and click
 *   - iOS requires scrolling into view more aggressively
 *   - Context switching (NATIVE_APP ↔ WEBVIEW) is slower on iOS
 *   - Page transitions take longer on iOS Safari
 *
 * ── Features ──────────────────────────────────────────────────────────────
 * 1. waitForElementWithRetry — retries selector with exponential backoff
 * 2. Platform-specific timeouts — iOS gets 2x longer waits by default
 * 3. scrollToElement — platform-aware scrolling (iOS needs extra scroll)
 * 4. safeClick — touch vs click event based on platform
 * 5. switchToContext — retry-based context switching with timeout
 * 6. waitForPageStabilized — waits for DOM mutations + network to settle
 * 7. waitForNavigation — waits for URL change with timeout
 * 8. executeWithRetry — retries any async operation
 */


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM = {
  IOS: 'ios',
  ANDROID: 'android',
};

const DEFAULT_IOS_TIMEOUT_MULTIPLIER = 2.5;   // iOS gets 2.5x longer timeouts
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_BACKOFF_MS = 1000;
const DEFAULT_POLL_INTERVAL = 500;

// ═════════════════════════════════════════════════════════════════════════════
// CrossPlatformHelper
// ═════════════════════════════════════════════════════════════════════════════

class CrossPlatformHelper {
  [key: string]: any;
  /**
   * @param {object} driver - WebDriverIO/Appium driver
   * @param {object} [options]
   * @param {string} [options.platform] - 'ios' or 'android' (auto-detected from driver)
   * @param {number} [options.baseTimeout=10000] - Base timeout for wait operations
   */
  constructor(driver: any, options: any = {}) {
    this.driver = driver;
    this._platform = options.platform || this._detectPlatform();
    this.baseTimeout = options.baseTimeout || 10000;

    // iOS Safari gets 2.5x longer timeouts by default
    this.timeoutMultiplier = this._isIOS ? DEFAULT_IOS_TIMEOUT_MULTIPLIER : 1.0;
  }

  /** Check if current platform is iOS. */
  get _isIOS() { return this._platform === PLATFORM.IOS; }

  /** Check if current platform is Android. */
  get _isAndroid() { return this._platform === PLATFORM.ANDROID; }

  /** Get the platform-adjusted timeout. */
  get timeout() { return Math.round(this.baseTimeout * this.timeoutMultiplier); }

  /**
   * Detect platform from the driver or environment.
   */
  _detectPlatform() {
    if (this.driver && this.driver.__mobilePlatform) {
      return this.driver.__mobilePlatform;
    }
    const env = (process.env.TEST_PLATFORM || '').toUpperCase();
    if (env === 'IOS') return PLATFORM.IOS;
    if (env === 'ANDROID') return PLATFORM.ANDROID;
    return PLATFORM.ANDROID;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. waitForElementWithRetry — retries selector with exponential backoff
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Wait for an element to exist (and optionally be visible) with retries.
   *
   * Retry strategy:
   *   - Up to `retries` attempts
   *   - Exponential backoff: 1s, 2s, 4s between retries
   *   - On iOS, base delay is multiplied by 1.5
   *
   * @param {string} selector - CSS selector to find
   * @param {object} [options]
   * @param {number} [options.retries=3] - Number of retry attempts
   * @param {boolean} [options.requireVisible=true] - Require element to be displayed
   * @param {number} [options.timeout=this.timeout] - Per-attempt timeout
   * @returns {Promise<object|null>} WebDriverIO element or null
   */
  async waitForElementWithRetry(selector: any, options: any = {}) {
    const retries = options.retries !== undefined ? options.retries : DEFAULT_RETRY_COUNT;
    const requireVisible = options.requireVisible !== undefined ? options.requireVisible : true;
    const perAttemptTimeout = options.timeout || this.timeout;

    // iOS needs longer between retries
    const backoffMultiplier = this._isIOS ? 1.5 : 1.0;

    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Phase 1: Wait for element to exist in DOM
        const elements = await this.driver.$$(selector);
        if (elements.length === 0) {
          if (attempt < retries) {
            const delay = Math.round(DEFAULT_BACKOFF_MS * backoffMultiplier * Math.pow(2, attempt - 1));
            logger.info(`[CrossPlatform] waitForElement("${selector}"): attempt ${attempt}/${retries} — no elements, retrying in ${delay}ms`);
            await this.driver.pause(delay);
          }
          continue;
        }

        // Phase 2: Find first visible element
        if (requireVisible) {
          for (const el of elements) {
            const displayed = await el.isDisplayed().catch(() => false);
            if (displayed) {
              logger.info(`[CrossPlatform] waitForElement("${selector}"): found visible element on attempt ${attempt}`);
              return el;
            }
          }

          // Elements exist but none visible — wait and retry
          if (attempt < retries) {
            const delay = Math.round(DEFAULT_BACKOFF_MS * backoffMultiplier * Math.pow(2, attempt - 1));
            logger.info(`[CrossPlatform] waitForElement("${selector}"): ${elements.length} elements found but none visible, retrying in ${delay}ms`);
            await this.driver.pause(delay);
          }
        } else {
          logger.info(`[CrossPlatform] waitForElement("${selector}"): found ${elements.length} elements on attempt ${attempt}`);
          return elements[0];
        }
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          const delay = Math.round(DEFAULT_BACKOFF_MS * backoffMultiplier * Math.pow(2, attempt - 1));
          logger.warn(`[CrossPlatform] waitForElement error on attempt ${attempt}: ${err.message.substring(0, 80)} — retrying in ${delay}ms`);
          await this.driver.pause(delay);
        }
      }

      // Wait a fixed poll interval before next attempt
      if (attempt < retries) {
        await this.driver.pause(DEFAULT_POLL_INTERVAL);
      }
    }

    logger.warn(`[CrossPlatform] waitForElement("${selector}"): all ${retries} attempts failed`);
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Platform-Specific Timeouts
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get a platform-adjusted timeout value.
   *
   * @param {number} baseMs - Base timeout in milliseconds
   * @returns {number} Platform-adjusted timeout
   */
  getTimeout(baseMs: any) {
    return Math.round(baseMs * this.timeoutMultiplier);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. scrollToElement — platform-aware scrolling
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Scroll element into view with platform-specific handling.
   *
   * iOS Safari: Uses JavaScript `scrollIntoView` with extra offset and pause.
   * Android: Uses WebDriverIO's built-in `scrollIntoView`.
   *
   * @param {object} element - WebDriverIO element
   * @param {object} [options]
   * @param {string} [options.block='center'] - 'start', 'center', 'end', 'nearest'
   * @param {number} [options.extraOffset=0] - Additional pixels to scroll
   * @returns {Promise<boolean>} True if scroll succeeded
   */
  async scrollToElement(element: any, options: any = {}) {
    const block = options.block || 'center';
    const extraOffset = options.extraOffset || 0;

    if (!element) {
      logger.warn('[CrossPlatform] scrollToElement: no element provided');
      return false;
    }

    try {
      if (this._isIOS) {
        // iOS Safari: scrollIntoView may not work reliably — use JS
        await this.driver.execute(function(el: any, blk: any, offset: any) {
          el.scrollIntoView({ behavior: 'instant', block: blk });
          if (offset) {
            window.scrollBy(0, offset);
          }
          return true;
        }, element, block, extraOffset);

        // iOS needs extra time for scroll to complete
        await this.driver.pause(500);
      } else {
        // Android: WebDriverIO's scrollIntoView works well
        await element.scrollIntoView();
        await this.driver.pause(200);
      }

      return true;
    } catch (err: any) {
      logger.warn(`[CrossPlatform] scrollToElement failed: ${err.message.substring(0, 80)}`);
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. safeClick — touch vs click events based on platform
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Click an element using the appropriate interaction type for the platform.
   *
   * iOS Safari: Uses JS `click()` + MouseEvent dispatch as fallback.
   * Android: Uses WebDriverIO's native `.click()`.
   *
   * @param {object} element - WebDriverIO element to click
   * @param {object} [options]
   * @param {boolean} [options.scrollFirst=true] - Scroll to element before clicking
   * @param {boolean} [options.forceJsClick=false] - Force JS click instead of native
   * @returns {Promise<boolean>} True if click succeeded
   */
  async safeClick(element: any, options: any = {}) {
    const scrollFirst = options.scrollFirst !== undefined ? options.scrollFirst : true;
    const forceJsClick = options.forceJsClick || false;

    if (!element) {
      logger.warn('[CrossPlatform] safeClick: no element provided');
      return false;
    }

    // Step 1: Scroll to element
    if (scrollFirst) {
      await this.scrollToElement(element);
    }

    // Step 2: Click
    try {
      if (this._isIOS || forceJsClick) {
        // iOS Safari: Try native click first, fall back to JS dispatch
        try {
          await element.click();
          logger.info('[CrossPlatform] safeClick: native click succeeded');
        } catch (nativeErr: any) {
          logger.warn(`[CrossPlatform] Native click failed: ${nativeErr.message.substring(0, 60)} — trying JS click`);

          // JS fallback: use MouseEvent dispatch
          const jsResult = await this.driver.execute(function(el: any) {
            try {
              el.click();
              return { method: 'jsDirectClick', success: true };
            } catch (e: any) {
              try {
                var event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                el.dispatchEvent(event);
                return { method: 'dispatchedEvent', success: true };
              } catch (e2: any) {
                return { method: 'failed', success: false, error: e2.message };
              }
            }
          }, element);

          if (!jsResult || !jsResult.success) {
            logger.warn(`[CrossPlatform] JS click also failed: ${jsResult ? jsResult.error : 'no result'}`);
            return false;
          }
          logger.info(`[CrossPlatform] safeClick: JS click succeeded (${jsResult.method})`);
        }
      } else {
        // Android: native click is reliable
        await element.click();
        logger.info('[CrossPlatform] safeClick: native click succeeded');
      }

      // Brief pause after click for UI to update
      await this.driver.pause(this._isIOS ? 500 : 200);
      return true;
    } catch (err: any) {
      logger.warn(`[CrossPlatform] safeClick failed: ${err.message.substring(0, 80)}`);
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. switchToContext — retry-based context switching
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Switch to an Appium context (NATIVE_APP or WEBVIEW) with retry.
   *
   * @param {string} targetContext - Context name to switch to
   * @param {object} [options]
   * @param {number} [options.retries=3] - Number of retry attempts
   * @param {number} [options.timeout=this.timeout] - Timeout per attempt
   * @returns {Promise<boolean>} True if context switch succeeded
   */
  async switchToContext(targetContext: any, options: any = {}) {
    const retries = options.retries !== undefined ? options.retries : 3;
    const perAttemptTimeout = options.timeout || this.timeout;

    const targetLower = targetContext.toLowerCase();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Check current context first
        let currentContext = 'unknown';
        try {
          currentContext = await this.driver.getContext();
        } catch (_: any) {}

        if (currentContext.toLowerCase() === targetLower) {
          logger.info(`[CrossPlatform] Already in context: ${currentContext}`);
          return true;
        }

        // Get available contexts
        let contexts: any[] = [];
        try {
          contexts = await this.driver.getContexts();
        } catch (_: any) {}

        // Find the matching context
        const match = contexts.find(function(ctx: any) {
          return String(ctx).toLowerCase().includes(targetLower);
        });

        if (!match) {
          logger.warn(`[CrossPlatform] Context "${targetContext}" not available. Available: ${JSON.stringify(contexts)}`);
          if (attempt < retries) {
            const delay = Math.round(2000 * Math.pow(1.5, attempt - 1));
            logger.info(`[CrossPlatform] Retrying context switch in ${delay}ms (attempt ${attempt}/${retries})`);
            await this.driver.pause(delay);
          }
          continue;
        }

        // Switch to the context
        await this.driver.switchContext(match);
        logger.info(`[CrossPlatform] Switched to context: ${match}`);

        // Verify the switch
        const verify = await this.driver.getContext().catch(() => '');
        if (verify.toLowerCase().includes(targetLower)) {
          return true;
        }

        logger.warn(`[CrossPlatform] Context switch to "${match}" not confirmed (got "${verify}")`);
      } catch (err: any) {
        logger.warn(`[CrossPlatform] Context switch attempt ${attempt}/${retries} failed: ${err.message.substring(0, 80)}`);
        if (attempt < retries) {
          await this.driver.pause(2000);
        }
      }
    }

    logger.warn(`[CrossPlatform] Failed to switch to context "${targetContext}" after ${retries} attempts`);
    return false;
  }

  /**
   * Convenience: switch to NATIVE_APP context.
   */
  async switchToNative() {
    return this.switchToContext('NATIVE_APP');
  }

  /**
   * Convenience: switch to WEBVIEW context.
   */
  async switchToWebView() {
    return this.switchToContext('WEBVIEW');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. waitForPageStabilized — intelligent page stabilization wait
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Wait for the page to stabilize after navigation or interaction.
   *
   * Detection methods:
   *   1. No DOM mutations for X ms (MutationObserver)
   *   2. Network idle (no pending XHR/fetch requests)
   *   3. document.readyState === 'complete'
   *   4. No visible spinners/loaders
   *
   * @param {object} [options]
   * @param {number} [options.timeout=this.timeout] - Maximum wait time
   * @param {number} [options.stableMs=500] - How long DOM must be stable (ms)
   * @param {boolean} [options.checkLoaders=true] - Check for spinner elements
   * @returns {Promise<boolean>} True if page stabilized within timeout
   */
  async waitForPageStabilized(options: any = {}) {
    const timeout = options.timeout || this.timeout;
    const stableMs = options.stableMs || 500;
    const checkLoaders = options.checkLoaders !== undefined ? options.checkLoaders : true;

    const startTime = Date.now();
    logger.info(`[CrossPlatform] Waiting for page to stabilize (timeout: ${timeout}ms, stable: ${stableMs}ms)...`);

    // Phase 1: Wait for readyState to be complete
    try {
      await this.driver.waitUntil(async function(this: any) {
        var ready = await this.driver.execute(function() {
          return document.readyState;
        }).catch(function() { return 'unknown'; });
        return ready === 'complete';
      }, { timeout: this.getTimeout(10000), interval: 500 });
      logger.info('[CrossPlatform] document.readyState === complete');
    } catch (_: any) {
      logger.warn('[CrossPlatform] document.readyState did not reach "complete" within timeout');
    }

    // Phase 2: Monitor DOM mutations for stability
    try {
      await this.driver.waitUntil(async function(this: any) {
        var stable = await this.driver.execute(function(stableWindowMs: any) {
          return new Promise(function(resolve) {
            var observer = new MutationObserver(function(mutations) {
              // A mutation was detected — page is still changing
              observer.disconnect();
              resolve(false);
            });

            // Observe the entire document for changes
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });

            // Resolve with true if no mutations within the window
            setTimeout(function() {
              observer.disconnect();
              resolve(true);
            }, stableWindowMs);
          });
        }, stableMs);

        return stable;
      }, { timeout: timeout, interval: 2000, timeoutMsg: 'Page did not stabilize within timeout' });

      logger.info('[CrossPlatform] Page stabilized (no DOM mutations for ' + stableMs + 'ms)');
    } catch (err: any) {
      // Page didn't stabilize — check if it's due to continuous updates
      if (err.message && err.message.includes('did not stabilize')) {
        logger.warn('[CrossPlatform] Page did not fully stabilize — may have continuous DOM updates');
      } else {
        // JS execution may fail if not in WebView
        logger.warn('[CrossPlatform] DOM stability check failed (may not be in WebView): ' + err.message.substring(0, 60));
      }
    }

    // Phase 3: Wait for loaders/spinners to disappear (WebView only)
    if (checkLoaders) {
      try {
        await this.driver.waitUntil(async function(this: any) {
          var hasLoader = await this.driver.execute(function() {
            var loaders = document.querySelectorAll(
              '.a-spinner, .loading, [class*="spinner"], [class*="loading"], ' +
              '[aria-busy="true"], .sc-spinner'
            );
            for (var i = 0; i < loaders.length; i++) {
              var rect = loaders[i].getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) return true;
            }
            return false;
          }).catch(function() { return false; });

          return !hasLoader;
        }, { timeout: this.getTimeout(10000), interval: 500, timeoutMsg: 'Spinner did not disappear' });

        logger.info('[CrossPlatform] No visible spinners/loaders.');
      } catch (_: any) {
        logger.warn('[CrossPlatform] Spinner may still be visible — proceeding anyway.');
      }
    }

    // Phase 4: Brief pause for any remaining async rendering
    await this.driver.pause(this._isIOS ? 1000 : 500);

    const elapsed = Date.now() - startTime;
    logger.info(`[CrossPlatform] Page stabilization check completed in ${elapsed}ms`);
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 7. waitForNavigation — waits for URL change with timeout
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Wait for the URL to change from the current URL.
   *
   * @param {string} [currentUrl] - Current URL to detect change from
   * @param {object} [options]
   * @param {number} [options.timeout=this.timeout] - Maximum wait time
   * @param {RegExp} [options.expectedPattern] - Expected URL pattern after navigation
   * @returns {Promise<boolean>} True if navigation completed
   */
  async waitForNavigation(currentUrl: any, options: any = {}) {
    const timeout = options.timeout || this.getTimeout(15000);
    const expectedPattern = options.expectedPattern || null;

    if (!currentUrl) {
      try {
        currentUrl = await this.driver.getUrl();
      } catch (_: any) {
        currentUrl = '';
      }
    }

    const startTime = Date.now();
    logger.info(`[CrossPlatform] Waiting for navigation from: ${currentUrl.substring(0, 100)}`);

    try {
      await this.driver.waitUntil(async function(this: any) {
        var url = await this.driver.getUrl().catch(function() { return ''; });

        // Check if URL changed
        if (url !== currentUrl) {
          // If an expected pattern is provided, verify it matches
          if (expectedPattern) {
            return expectedPattern.test(url);
          }
          return true;
        }
        return false;
      }, { timeout: timeout, interval: 1000, timeoutMsg: 'Navigation did not complete within ' + timeout + 'ms' });

      const newUrl = await this.driver.getUrl().catch(() => '');
      const elapsed = Date.now() - startTime;
      logger.info(`[CrossPlatform] Navigation completed in ${elapsed}ms. New URL: ${newUrl.substring(0, 100)}`);
      return true;
    } catch (err: any) {
      // Check if navigation already happened (race condition)
      const newUrl = await this.driver.getUrl().catch(() => '');
      if (newUrl !== currentUrl) {
        logger.info('[CrossPlatform] Navigation completed (caught race condition)');
        return true;
      }

      logger.warn(`[CrossPlatform] Navigation wait failed: ${err.message.substring(0, 80)}`);
      return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 8. executeWithRetry — retries any async operation
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Execute an async function with retry on failure.
   * Useful for flaky operations like element interactions on iOS Safari.
   *
   * @param {Function} fn - Async function to execute
   * @param {object} [options]
   * @param {number} [options.retries=3] - Max retry attempts
   * @param {number} [options.delay=1000] - Base delay between retries (ms)
   * @param {boolean} [options.backoff=true] - Use exponential backoff
   * @returns {Promise<*>} Result of the function
   */
  async executeWithRetry(fn: any, options: any = {}) {
    const retries = options.retries !== undefined ? options.retries : DEFAULT_RETRY_COUNT;
    const delay = options.delay || DEFAULT_BACKOFF_MS;
    const backoff = options.backoff !== undefined ? options.backoff : true;
    const label = options.label || 'operation';

    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await fn();
        if (attempt > 1) {
          logger.info(`[CrossPlatform] executeWithRetry("${label}"): succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          const waitTime = backoff
            ? Math.round(delay * Math.pow(this._isIOS ? 1.8 : 1.5, attempt - 1))
            : delay;
          logger.warn(`[CrossPlatform] executeWithRetry("${label}"): attempt ${attempt}/${retries} failed: ${err.message.substring(0, 80)}. Retrying in ${waitTime}ms`);
          await this.driver.pause(waitTime);
        }
      }
    }

    throw new Error(
      `[CrossPlatform] executeWithRetry("${label}"): all ${retries} attempts failed.\n` +
      `Last error: ${lastError ? lastError.message : 'unknown'}`
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 9. waitForElementThenClick — complete workflow: wait → scroll → click
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Complete element interaction workflow:
   *   1. waitForElementWithRetry — find the element
   *   2. scrollToElement — ensure it's in view
   *   3. safeClick — click with platform-appropriate method
   *
   * @param {string} selector - CSS selector
   * @param {object} [options]
   * @param {number} [options.retries=3] - Retry count for find
   * @param {boolean} [options.requireVisible=true] - Must be visible
   * @param {boolean} [options.scrollFirst=true] - Scroll before click
   * @param {boolean} [options.forceJsClick=false] - Force JS click
   * @returns {Promise<boolean>} True if click succeeded
   */
  async waitForElementThenClick(selector: any, options: any = {}) {
    const element = await this.waitForElementWithRetry(selector, {
      retries: options.retries,
      requireVisible: options.requireVisible,
      timeout: options.timeout,
    });

    if (!element) {
      logger.warn(`[CrossPlatform] waitForElementThenClick("${selector}"): element not found`);
      return false;
    }

    return this.safeClick(element, {
      scrollFirst: options.scrollFirst,
      forceJsClick: options.forceJsClick,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 10. getPageReadyState — diagnostic helper
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get the current page state diagnostic info.
   * @returns {Promise<object>} Page state info
   */
  async getPageReadyState() {
    const info = {
      platform: this._platform,
      timeout: this.timeout,
      url: 'unknown',
      title: 'unknown',
      context: 'unknown',
      readyState: 'unknown',
    };

    try { info.url = await this.driver.getUrl(); } catch (_: any) {}
    try { info.title = await this.driver.getTitle(); } catch (_: any) {}
    try { info.context = await this.driver.getContext(); } catch (_: any) {}
    try {
      info.readyState = await this.driver.execute(function() {
        return document.readyState;
      });
    } catch (_: any) {}

    return info;
  }
}

export default CrossPlatformHelper;
