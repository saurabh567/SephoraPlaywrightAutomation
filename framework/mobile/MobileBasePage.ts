import { TEST_PLATFORMS } from '../common/platforms';
import MobileDebugUtility from '../../utils/mobileDebugUtility';
import CrossPlatformHelper from './CrossPlatformHelper';
import logger from '../../utils/logger';
/**
 * MobileBasePage — unified platform-aware base page for mobile automation.
 *
 * Supports iOS Safari WebView and Android native/WebView with platform-specific
 * selectors, fallback chains, integrated debugging, and cross-platform stability.
 *
 * ── Cross-Platform Stability Features ────────────────────────────────────
 * - Platform-aware timeout scaling (iOS gets 2.5x longer waits)
 * - Retry with exponential backoff for flaky selectors
 * - Scroll-to-element before interaction (iOS needs this)
 * - Touch vs click event selection based on platform
 * - Context switching (NATIVE_APP ↔ WEBVIEW) with retry
 * - Page stabilization waits (DOM mutations, network idle, spinner detection)
 * - Navigation wait with URL change detection
 * - executeWithRetry for any async operation
 *
 * ── Platform Detection ───────────────────────────────────────────────────
 * The platform ('ios' or 'android') is set on the driver object by
 * MobileSessionManager.createSession(). All page objects read it from
 * driver.__mobilePlatform.
 *
 * ── Selector Resolution ─────────────────────────────────────────────────
 * Each page object defines a `selectors` property with platform-specific maps.
 */


class MobileBasePage {
  [key: string]: any;
  /**
   * @param {object} driver - WebDriverIO browser object
   * @param {object} [selectorMap] - Optional selector map with ios/android keys
   */
  constructor(driver: any, selectorMap: any = {}) {
    this.driver = driver;
    this._platform = this._detectPlatform();
    this._selectorMap = selectorMap || { ios: {} as Record<string, any>, android: {} as Record<string, any>, shared: {} as Record<string, any> };
    this.timeout = 15000;

    // ── Cross-Platform stability helper ─────────────────────────────
    this.cp = new CrossPlatformHelper(driver, { platform: this._platform, baseTimeout: this.timeout });

    // ── Integrated debug utility ─────────────────────────────────────
    this.debug = new MobileDebugUtility(driver);

    // ── Screenshot directory for diagnostics ──────────────────────────
    this.debugScreenshotDir = 'reports/mobile/screenshots';
    this.debugSourceDir = 'reports/mobile/debug';
  }

  /** Platform detection. */
  _detectPlatform() {
    if (this.driver && this.driver.__mobilePlatform) return this.driver.__mobilePlatform;
    const env = (process.env.TEST_PLATFORM || '').toUpperCase();
    if (env === TEST_PLATFORMS.IOS) return 'ios';
    if (env === TEST_PLATFORMS.ANDROID) return 'android';
    try {
      const ConfigReader = require('../common/ConfigReader');
      const platform = ConfigReader.get('testPlatform');
      if (platform === TEST_PLATFORMS.IOS) return 'ios';
      if (platform === TEST_PLATFORMS.ANDROID) return 'android';
    } catch (_: any) {}
    return 'android';
  }
  get isIOS() { return this._platform === 'ios'; }
  get isAndroid() { return this._platform === 'android'; }
  get platform() { return this._platform; }

  /** Platform-adjusted timeout. */
  get iosTimeout() { return this.cp.getTimeout(this.timeout); }

  // ═══════════════════════════════════════════════════════════════════════
  // Selector Resolution
  // ═══════════════════════════════════════════════════════════════════════

  resolveSelector(key: any) {
    if (typeof key !== 'string') return key;
    const pm = this._selectorMap[this._platform];
    const sm = this._selectorMap.shared;
    if (pm && pm[key]) return this._convertAccessibilityId(pm[key]);
    if (sm && sm[key]) return this._convertAccessibilityId(sm[key]);
    return this._convertAccessibilityId(key);
  }

  _convertAccessibilityId(locator: any) {
    if (typeof locator !== 'string') return locator;
    if (this.isIOS && locator.startsWith('~')) return 'name:' + locator.substring(1);
    return locator;
  }

  getSelectors(key: any, fallbacks: any[] = []) {
    const primary = this.resolveSelector(key);
    const results = [primary];
    if (this.isIOS && primary.startsWith('name:')) results.push(key);
    else if (this.isAndroid && primary.startsWith('~')) results.push(key);
    const shared = this._selectorMap.shared && this._selectorMap.shared[key];
    if (shared && shared !== primary) results.push(shared);
    for (const fb of fallbacks) results.push(fb);
    return [...new Set(results)];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cross-Platform Element Finding (with retry + stability waits)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Find the first visible element using CrossPlatformHelper's retry mechanism.
   * Falls back to direct driver.$$ for non-retry paths.
   */
  async findVisibleElement(selectors: any, options: any = {}) {
    const { requireVisible = true, scrollIntoView = false } = options;
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    // Try each selector with CrossPlatformHelper's retry mechanism
    for (const selector of selectorList) {
      const el = await this.cp.waitForElementWithRetry(selector, {
        retries: 2,
        requireVisible,
        timeout: this.cp.getTimeout(8000),
      });
      if (el) {
        if (scrollIntoView) {
          await this.cp.scrollToElement(el);
        }
        return el;
      }
    }
    return null;
  }

  /**
   * Find and click an element using the full stability pipeline:
   *   1. Retry-based element finding (exponential backoff)
   *   2. Scroll into view (platform-specific)
   *   3. Safe click (touch vs click based on platform)
   *   4. Page stabilization wait after click
   *   5. JS execution fallback
   *   6. Diagnostic capture on failure
   */
  async findAndClick(key: any, fallbacks: any[] = [], options: any = {}) {
    const { waitAfterClick = 3000 } = options;
    const allErrors: any[] = [];
    const selectors = this.getSelectors(key, fallbacks);

    logger.info(`[MobileBasePage] findAndClick("${key}"): trying ${selectors.length} selectors (platform: ${this._platform})`);

    for (const selector of selectors) {
      try {
        // Use CrossPlatformHelper's complete workflow: wait → scroll → click
        const clicked = await this.cp.waitForElementThenClick(selector, {
          retries: this.isIOS ? 3 : 2,
          requireVisible: true,
          scrollFirst: true,
        });

        if (clicked) {
          logger.info(`[MobileBasePage] Clicked via selector: "${selector}"`);
          // Wait for page to stabilize after click
          await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(5000), checkLoaders: false });
          await this.driver.pause(waitAfterClick);
          return true;
        }
      } catch (err: any) {
        allErrors.push(`CSS "${selector}": ${err.message.substring(0, 80)}`);
      }
    }

    // JS execution fallback
    logger.info(`[MobileBasePage] findAndClick("${key}"): trying JS execution fallback`);
    const jsClicked = await this._tryJsClick(key, allErrors);
    if (jsClicked) return true;

    await this._captureDiagnostics(key, selectors, allErrors);
    throw new Error(
      `[MobileBasePage] Could not find element for "${key}".\n` +
      `Platform: ${this._platform}\n` +
      `Selectors attempted: ${selectors.join(', ')}\n` +
      `Errors: ${allErrors.join('; ')}`
    );
  }

  /**
   * JavaScript execution fallback for WebView environments.
   */
  async _tryJsClick(key: any, allErrors: any) {
    try {
      const result = await this.driver.execute(function(selectorKey: any) {
        var searchTerms = selectorKey.replace(/[#.]/g, '').replace(/[-_]/g, ' ');
        var terms = searchTerms.toLowerCase().split(/\s+/);
        var candidates = document.querySelectorAll(
          'a, button, input[type="submit"], input[type="button"], ' +
          'span[data-action], [role="button"], [data-testid]'
        );
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          var text = (el.textContent || '').trim().toLowerCase();
          var aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          var value = (el.getAttribute('value') || '').trim().toLowerCase();
          var dt = (el.getAttribute('data-testid') || '').trim().toLowerCase();
          var da = (el.getAttribute('data-action') || '').trim().toLowerCase();
          for (var t = 0; t < terms.length; t++) {
            if (terms[t].length < 2) continue;
            if (text.indexOf(terms[t]) !== -1 || aria.indexOf(terms[t]) !== -1 ||
                value.indexOf(terms[t]) !== -1 || dt.indexOf(terms[t]) !== -1 ||
                da.indexOf(terms[t]) !== -1) {
              var rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                try { (el as HTMLElement).click(); return { method: 'nativeClick', foundBy: terms[t] }; }
                catch (e: any) {
                  try {
                    var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                    el.dispatchEvent(evt);
                    return { method: 'dispatchedEvent', foundBy: terms[t] };
                  } catch (e2: any) { return { method: 'failed', error: e2.message }; }
                }
              }
            }
          }
        }
        return { method: 'noMatch', found: false };
      }, key);

      if (result && result.method !== 'noMatch' && result.method !== 'failed') {
        logger.info(`[MobileBasePage] JS click succeeded: method=${result.method}, foundBy="${result.foundBy}"`);
        await this.cp.waitForPageStabilized({ timeout: this.cp.getTimeout(3000), checkLoaders: false });
        await this.driver.pause(2000);
        return true;
      }
      if (result && result.method === 'noMatch') {
        allErrors.push('JS fallback: no matching element found');
      }
    } catch (err: any) {
      allErrors.push('JS fallback: ' + err.message.substring(0, 80));
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cross-Platform Convenience Methods
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the CrossPlatformHelper instance for advanced operations.
   */
  get crossPlatform() { return this.cp; }

  /**
   * Wait for page to stabilize after navigation/interaction.
   * Uses CrossPlatformHelper's intelligent stabilization detection.
   */
  async waitForStabilized(options: any) {
    return this.cp.waitForPageStabilized(options);
  }

  /**
   * Wait for navigation to complete (URL change).
   */
  async waitForNav(currentUrl: any, options: any) {
    return this.cp.waitForNavigation(currentUrl, options);
  }

  /**
   * Switch to NATIVE_APP context with retry.
   */
  async switchToNative() {
    return this.cp.switchToNative();
  }

  /**
   * Switch to WEBVIEW context with retry.
   */
  async switchToWebView() {
    return this.cp.switchToWebView();
  }

  /**
   * Execute a function with retry on failure.
   */
  async retry(fn: any, options: any) {
    return this.cp.executeWithRetry(fn, options);
  }

  /**
   * Wait for an element to exist with retry and exponential backoff.
   */
  async waitForElement(selector: any, options: any) {
    return this.cp.waitForElementWithRetry(selector, options);
  }

  /**
   * Safe click with platform-appropriate method (touch vs click).
   */
  async safeClick(element: any, options: any) {
    return this.cp.safeClick(element, options);
  }

  /**
   * Scroll element into view with platform-specific handling.
   */
  async scrollTo(element: any, options: any) {
    return this.cp.scrollToElement(element, options);
  }

  /**
   * Get platform-adjusted timeout value.
   */
  getPlatformTimeout(baseMs: any) {
    return this.cp.getTimeout(baseMs);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Diagnostics
  // ═══════════════════════════════════════════════════════════════════════

  async _captureDiagnostics(key: any, selectors: any, allErrors: any) {
    try {
      await this.debug.captureFailure('selector-failure', {
        failedSelectors: selectors,
        error: new Error('Selector failure: ' + key + ' — ' + allErrors.join('; ')),
        logElements: true,
      });
    } catch (err: any) {
      logger.warn(`[MobileBasePage] Diagnostic capture failed: ${err.message}`);
    }
  }

  async logStep(actionLabel: any, opts: any) { return this.debug.logStep(actionLabel, opts); }
  logStepEnd(actionLabel: any, startTime: any, success: any) { this.debug.logStepEnd(actionLabel, startTime, success); }
  async dumpPageState(label: any) { return this.debug.dumpPageState(label); }

  // ═══════════════════════════════════════════════════════════════════════
  // Legacy Convenience Methods
  // ═══════════════════════════════════════════════════════════════════════

  async waitForSourceText(textOrPattern: any, timeout: any) {
    const t = timeout || this.timeout;
    const matcher = textOrPattern instanceof RegExp
      ? (source: any) => textOrPattern.test(source)
      : (source: any) => source.toLowerCase().includes(String(textOrPattern).toLowerCase());
    await this.driver.waitUntil(
      async () => matcher(await this.driver.getPageSource()),
      { timeout: t, timeoutMsg: 'Timed out waiting for text: ' + textOrPattern }
    );
  }

  async isDisplayed(key: any, fallbacks: any[] = []) {
    const selectors = this.getSelectors(key, fallbacks);
    for (const s of selectors) {
      try {
        const el = await this.driver.$(s);
        if (await el.isDisplayed().catch(() => false)) return true;
      } catch (_: any) {}
    }
    return false;
  }

  async pause(ms: any) { await this.driver.pause(ms); }
  async getPageSource() { return this.driver.getPageSource(); }
  async getUrl() { return this.driver.getUrl().catch(() => ''); }
  async url(target: any) { await this.driver.url(target); }
  async execute(fn: any, ...args: any[]) { return this.driver.execute(fn, ...args); }

  async isSessionHealthy() {
    try { await this.driver.getStatus(); return true; } catch { return false; }
  }
}

export default MobileBasePage;
