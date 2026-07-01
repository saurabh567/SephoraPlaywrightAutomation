/**
 * mobileDebugUtility.js
 *
 * Centralized debugging utility for mobile automation tests.
 * Provides comprehensive diagnostics on failure and on-demand state dumps.
 *
 * ── Features ──────────────────────────────────────────────────────────────
 * 1. Page source capture (HTML content written to disk)
 * 2. Screenshots automatically on failures
 * 3. Interactive elements logging (all visible a, button, input, etc.)
 * 4. URL, title, Appium context (NATIVE_APP vs WEBVIEW) logging
 * 5. Full page state dump (screenshot + source + elements + metadata)
 * 6. Platform (iOS/Android) and browser context logging
 * 7. DOM structure capture specific to selector failures
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *   // Automatic on failure (in hooks):
 *   await MobileDebugUtility.captureFailure(driver, 'step-name');
 *
 *   // Manual debugging (in step definitions):
 *   await MobileDebugUtility.dumpPageState(driver);
 *   const elements = await MobileDebugUtility.getInteractiveElements(driver);
 *
 *   // From page objects:
 *   await this.debug.captureFailure('addToCart-failed');
 *   await this.debug.logStep('clicking checkout button');
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

const DEFAULT_SCREENSHOT_DIR = 'reports/mobile/screenshots';
const DEFAULT_DEBUG_DIR = 'reports/mobile/debug';

// ─────────────────────────────────────────────────────────────────────────────
// MobileDebugUtility
// ─────────────────────────────────────────────────────────────────────────────

class MobileDebugUtility {
  /**
   * @param {object} driver - WebDriverIO/Appium driver instance
   * @param {object} [options]
   * @param {string} [options.screenshotDir] - Override screenshot directory
   * @param {string} [options.debugDir] - Override debug data directory
   */
  constructor(driver, options = {}) {
    this.driver = driver;
    this.screenshotDir = options.screenshotDir || DEFAULT_SCREENSHOT_DIR;
    this.debugDir = options.debugDir || DEFAULT_DEBUG_DIR;
    this._stepCounter = 0;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Page Source Capture (HTML)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Save the current page source as an HTML file.
   *
   * @param {string} [label='page-source'] - Label for the filename
   * @returns {Promise<string|null>} Path to saved file, or null on failure
   */
  async savePageSource(label) {
    const timestamp = Date.now();
    const safeLabel = String(label || 'page-source').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.debugDir, `${safeLabel}-${timestamp}.html`);

    try {
      fs.ensureDirSync(this.debugDir);
      const source = await this.driver.getPageSource().catch(() => '');
      if (!source || source.length === 0) {
        logger.warn(`[MobileDebug] Page source is empty for "${safeLabel}"`);
        return null;
      }
      fs.writeFileSync(filePath, source, 'utf8');
      logger.info(`[MobileDebug] Page source saved (${(source.length / 1024).toFixed(1)} KB): ${filePath}`);
      return filePath;
    } catch (err) {
      logger.warn(`[MobileDebug] Page source save failed: ${err.message}`);
      return null;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Screenshots
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Capture a screenshot.
   *
   * @param {string} [label='screenshot'] - Label for the filename
   * @returns {Promise<string|null>} Path to saved screenshot, or null on failure
   */
  async saveScreenshot(label) {
    const timestamp = Date.now();
    const safeLabel = String(label || 'screenshot').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.screenshotDir, `${safeLabel}-${timestamp}.png`);

    try {
      fs.ensureDirSync(this.screenshotDir);
      await this.driver.saveScreenshot(filePath);
      logger.info(`[MobileDebug] Screenshot saved: ${filePath}`);
      return filePath;
    } catch (err) {
      logger.warn(`[MobileDebug] Screenshot capture failed: ${err.message}`);
      return null;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Interactive Elements Logging
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get all interactive elements currently visible on the page.
   * Returns structured data with tag, id, text, href, name, value, aria-label,
   * data-testid, data-action, data-csa-c-slot-id, and visibility status.
   *
   * @param {boolean} [visibleOnly=true] - If true, only return visible elements
   * @returns {Promise<Array>} Array of element descriptors
   */
  async getInteractiveElements(visibleOnly = true) {
    try {
      const elements = await this.driver.execute(function() {
        var results = [];
        var selectors = [
          'a[href]', 'button', 'input', 'span[data-action]',
          '[data-testid]', '[data-csa-c-slot-id]', '[role="button"]',
          '[data-component-type]', '[onclick]',
        ];

        for (var s = 0; s < selectors.length; s++) {
          var els = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var rect = el.getBoundingClientRect();

            results.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              className: (el.className || '').substring(0, 80),
              text: (el.textContent || '').trim().substring(0, 100),
              href: el.getAttribute('href') || '',
              name: el.getAttribute('name') || '',
              value: el.getAttribute('value') || '',
              type: el.getAttribute('type') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              dataTestid: el.getAttribute('data-testid') || '',
              dataAction: el.getAttribute('data-action') || '',
              dataCsa: el.getAttribute('data-csa-c-slot-id') || '',
              dataComponentType: el.getAttribute('data-component-type') || '',
              visible: rect.width > 0 && rect.height > 0,
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            });
          }
        }
        return results;
      }).catch(() => []);

      if (visibleOnly) {
        return (elements || []).filter(function(e) { return e.visible; });
      }
      return elements || [];
    } catch (err) {
      logger.warn(`[MobileDebug] Interactive elements extraction failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Log all interactive elements to the console.
   *
   * @param {boolean} [visibleOnly=true] - Only log visible elements
   * @param {number} [maxItems=40] - Maximum number of elements to log
   */
  async logInteractiveElements(visibleOnly = true, maxItems = 40) {
    const elements = await this.getInteractiveElements(visibleOnly);

    if (elements.length === 0) {
      logger.warn('[MobileDebug] No interactive elements found on page');
      return;
    }

    logger.info(`[MobileDebug] Interactive elements on page (${elements.length} total, showing ${Math.min(elements.length, maxItems)}):`);

    const visibleTag = visibleOnly ? 'visible' : 'all';
    for (var i = 0; i < Math.min(elements.length, maxItems); i++) {
      var e = elements[i];
      logger.info(
        `  [${visibleTag}] <${e.tag}>` +
        (e.id ? ` id="${e.id}"` : '') +
        (e.name ? ` name="${e.name}"` : '') +
        (e.value ? ` value="${e.value.substring(0, 30)}"` : '') +
        (e.ariaLabel ? ` aria="${e.ariaLabel}"` : '') +
        (e.dataTestid ? ` data-testid="${e.dataTestid}"` : '') +
        (e.dataAction ? ` data-action="${e.dataAction}"` : '') +
        (e.dataCsa ? ` data-csa="${e.dataCsa}"` : '') +
        (e.href ? ` href="${e.href.substring(0, 80)}"` : '') +
        (e.text ? ` text="${e.text.substring(0, 50)}"` : '') +
        (e.visible ? '' : ' [HIDDEN]')
      );
    }

    if (elements.length > maxItems) {
      logger.info(`  ... and ${elements.length - maxItems} more elements`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. URL, Title, and Context Logging
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get the current environment state: URL, page title, Appium context,
   * and platform info.
   *
   * @returns {Promise<object>} Environment state object
   */
  async getEnvironmentState() {
    const url = await this.driver.getUrl().catch(() => 'unknown');
    const title = await this.driver.getTitle().catch(() => 'unknown');

    let context = 'unknown';
    try {
      context = await this.driver.getContext();
    } catch (_) {}

    let contexts = [];
    try {
      contexts = await this.driver.getContexts();
    } catch (_) {}

    let platform = 'unknown';
    if (this.driver.__mobilePlatform) {
      platform = this.driver.__mobilePlatform;
    } else {
      platform = process.env.TEST_PLATFORM || 'unknown';
    }

    return {
      timestamp: new Date().toISOString(),
      url: url,
      pageTitle: title,
      context: context,
      availableContexts: contexts,
      platform: platform,
      isNativeApp: context === 'NATIVE_APP',
      isWebView: context ? context.toLowerCase().includes('webview') : false,
    };
  }

  /**
   * Log the current environment state to the console.
   */
  async logEnvironment() {
    const state = await this.getEnvironmentState();
    logger.info('[MobileDebug] === ENVIRONMENT STATE ===');
    logger.info('[MobileDebug] URL:          ' + state.url);
    logger.info('[MobileDebug] Title:        ' + state.pageTitle);
    logger.info('[MobileDebug] Context:      ' + state.context);
    logger.info('[MobileDebug] Platform:     ' + state.platform);
    logger.info('[MobileDebug] Is WebView:   ' + state.isWebView);
    logger.info('[MobileDebug] Is Native:    ' + state.isNativeApp);
    if (state.availableContexts && state.availableContexts.length > 0) {
      logger.info('[MobileDebug] All contexts: ' + JSON.stringify(state.availableContexts));
    }
    logger.info('[MobileDebug] =========================');
    return state;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Full Page State Dump
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Dump the complete current page state to disk and console.
   * Captures: screenshot + page source + interactive elements + environment.
   *
   * @param {string} [label='state-dump'] - Label for the dump files
   * @returns {Promise<object>} Dump metadata
   */
  async dumpPageState(label) {
    const timestamp = Date.now();
    const safeLabel = String(label || 'state-dump').replace(/[^a-zA-Z0-9_-]/g, '_');

    logger.info(`[MobileDebug] === PAGE STATE DUMP: ${safeLabel} ===`);

    // 1. Environment state (logs to console + returns data)
    const envState = await this.logEnvironment();

    // 2. Screenshot
    const screenshotPath = await this.saveScreenshot(safeLabel);

    // 3. Page source (HTML)
    const sourcePath = await this.savePageSource(safeLabel);

    // 4. Interactive elements (logs to console)
    await this.logInteractiveElements(true, 50);

    // 5. Write structured JSON dump
    const dumpPath = path.join(this.debugDir, `${safeLabel}-${timestamp}.json`);
    try {
      fs.ensureDirSync(this.debugDir);
      const elements = await this.getInteractiveElements(false);
      const dumpData = {
        timestamp: new Date(timestamp).toISOString(),
        label: safeLabel,
        environment: envState,
        interactiveElementsCount: elements.length,
        interactiveElements: elements,
        files: {
          screenshot: screenshotPath || 'FAILED',
          pageSource: sourcePath || 'FAILED',
          dump: dumpPath,
        },
      };
      fs.writeFileSync(dumpPath, JSON.stringify(dumpData, null, 2), 'utf8');
      logger.info(`[MobileDebug] State dump saved: ${dumpPath}`);
    } catch (err) {
      logger.warn(`[MobileDebug] State dump JSON write failed: ${err.message}`);
    }

    logger.info(`[MobileDebug] === END DUMP: ${safeLabel} ===`);
    return { screenshotPath, sourcePath, dumpPath, envState };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. Platform and Browser Context Logging
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Log the platform and browser/WebView context info.
   * Useful to call at the start of every step for traceability.
   */
  async logPlatformContext() {
    let context = 'unknown';
    try { context = await this.driver.getContext(); } catch (_) {}

    const platform = this.driver.__mobilePlatform || process.env.TEST_PLATFORM || 'unknown';
    const url = await this.driver.getUrl().catch(() => 'unknown');
    const title = await this.driver.getTitle().catch(() => 'unknown');

    logger.info(
      `[MobileDebug] [${platform.toUpperCase()}] ` +
      `ctx=${context} ` +
      `url=${url.substring(0, 120)} ` +
      `title=${title.substring(0, 60)}`
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 7. DOM Structure Capture on Selector Failure
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Capture the DOM structure around a specific selector that failed.
   * Saves the outer HTML of the parent element and nearby elements.
   *
   * @param {string} failedSelector - The CSS/XPath selector that failed
   * @param {object} [options]
   * @param {number} [options.depth=2] - How many parent levels to traverse
   * @returns {Promise<object|null>} Captured DOM context or null
   */
  async captureDOMStructure(failedSelector, options = {}) {
    const depth = options.depth || 2;

    try {
      const domContext = await this.driver.execute(function(selector, maxDepth) {
        var result = {
          selector: selector,
          matchedElements: [],
          parentStructure: null,
        };

        // Try to find elements matching the selector
        try {
          var elements = document.querySelectorAll(selector);
          result.matchedElementsCount = elements.length;
          for (var i = 0; i < Math.min(elements.length, 5); i++) {
            var el = elements[i];
            var rect = el.getBoundingClientRect();
            result.matchedElements.push({
              tag: el.tagName,
              id: el.id,
              className: (el.className || '').substring(0, 100),
              visible: rect.width > 0 && rect.height > 0,
              outerHTML: el.outerHTML.substring(0, 500),
            });
          }
        } catch(e) {
          result.queryError = e.message;
        }

        // Capture parent structure for context
        try {
          // Find elements that are close in DOM to what the selector targets
          // Look for forms, sections, divs with cart-related classes
          var parents = document.querySelectorAll(
            'form, section, [class*="cart"], [class*="checkout"], [class*="buy"], ' +
            '[class*="proceed"], [data-component-type], [data-testid]'
          );
          result.parentStructure = [];
          for (var i = 0; i < Math.min(parents.length, 15); i++) {
            var p = parents[i];
            result.parentStructure.push({
              tag: p.tagName,
              id: p.id,
              className: (p.className || '').substring(0, 80),
              outerHTML: p.outerHTML.substring(0, 400),
              childCount: p.children ? p.children.length : 0,
            });
          }
        } catch(e) {
          result.parentError = e.message;
        }

        return result;
      }, failedSelector, depth);

      // Write the DOM structure to a file
      const timestamp = Date.now();
      const safeName = String(failedSelector).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
      const filePath = path.join(this.debugDir, `dom-structure-${safeName}-${timestamp}.json`);

      fs.ensureDirSync(this.debugDir);
      fs.writeFileSync(filePath, JSON.stringify(domContext, null, 2), 'utf8');
      logger.info(`[MobileDebug] DOM structure for "${failedSelector}" saved: ${filePath}`);

      if (domContext && domContext.matchedElementsCount > 0) {
        logger.info(`[MobileDebug] Found ${domContext.matchedElementsCount} elements matching "${failedSelector}"`);
        for (var i = 0; i < domContext.matchedElements.length; i++) {
          var m = domContext.matchedElements[i];
          logger.info(`  [${i}] <${m.tag}> id="${m.id}" visible=${m.visible}`);
        }
      } else {
        logger.warn(`[MobileDebug] No elements matched "${failedSelector}" — capturing page context`);
      }

      return domContext;
    } catch (err) {
      logger.warn(`[MobileDebug] DOM structure capture failed: ${err.message}`);
      return null;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 8. Full Failure Capture (runs all diagnostics)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Capture comprehensive diagnostics on a failure.
   * This is the main method to call when an action fails.
   *
   * Runs:
   *   - Screenshot
   *   - Page source (HTML)
   *   - Environment state (URL, title, context, platform)
   *   - Interactive elements
   *   - DOM structure for specified selectors
   *   - Structured JSON dump
   *
   * @param {string} actionName - Name of the failed action (e.g. 'addToCart', 'proceedToCheckout')
   * @param {object} [options]
   * @param {string[]} [options.failedSelectors] - Specific selectors that failed
   * @param {Error} [options.error] - The error that caused the failure
   * @param {boolean} [options.logElements=true] - Whether to log interactive elements
   * @returns {Promise<object>} Diagnostics metadata
   */
  async captureFailure(actionName, options = {}) {
    const { failedSelectors = [], error = null, logElements = true } = options;
    const timestamp = Date.now();
    const safeName = String(actionName).replace(/[^a-zA-Z0-9_-]/g, '_');

    logger.error(`[MobileDebug] === FAILURE CAPTURE: ${actionName} ===`);
    if (error) {
      logger.error(`[MobileDebug] Error: ${error.message}`);
    }
    if (failedSelectors.length > 0) {
      logger.error(`[MobileDebug] Failed selectors: ${failedSelectors.join(', ')}`);
    }

    // 1. Environment state
    const envState = await this.logEnvironment();

    // 2. Screenshot
    const screenshotPath = await this.saveScreenshot(`failure-${safeName}`);

    // 3. Page source
    const sourcePath = await this.savePageSource(`failure-${safeName}`);

    // 4. Interactive elements
    if (logElements) {
      await this.logInteractiveElements(true, 50);
    }

    // 5. DOM structure for failed selectors
    const domCaptures = [];
    if (failedSelectors.length > 0) {
      for (var i = 0; i < failedSelectors.length; i++) {
        var dom = await this.captureDOMStructure(failedSelectors[i]);
        domCaptures.push(dom);
      }
    }

    // 6. All contexts
    let contexts = [];
    try { contexts = await this.driver.getContexts(); } catch (_) {}

    // 7. Structured JSON dump
    const dumpPath = path.join(this.debugDir, `failure-${safeName}-${timestamp}.json`);
    try {
      fs.ensureDirSync(this.debugDir);
      const allElements = await this.getInteractiveElements(false);
      var dumpData = {
        timestamp: new Date(timestamp).toISOString(),
        action: actionName,
        error: error ? { message: error.message, stack: error.stack } : null,
        failedSelectors: failedSelectors,
        environment: envState,
        availableContexts: contexts,
        totalInteractiveElements: allElements.length,
        interactiveElements: allElements,
        domCaptures: domCaptures,
        files: {
          screenshot: screenshotPath || 'FAILED',
          pageSource: sourcePath || 'FAILED',
        },
      };
      fs.writeFileSync(dumpPath, JSON.stringify(dumpData, null, 2), 'utf8');
      logger.info(`[MobileDebug] Failure diagnostics saved: ${dumpPath}`);
    } catch (err) {
      logger.warn(`[MobileDebug] Failure dump JSON write failed: ${err.message}`);
    }

    logger.error(`[MobileDebug] === END FAILURE CAPTURE: ${actionName} ===`);
    return { screenshotPath, sourcePath, dumpPath, envState };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 9. Step Logging (trace each step)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Log the start of an action step with environment context.
   * Useful to call at the start of every page object method.
   *
   * @param {string} actionLabel - Human-readable action name
   * @param {object} [opts]
   * @param {string} [opts.locator] - CSS selector being attempted
   * @param {number} [opts.elementCount] - Number of elements found
   * @returns {number} Start time (for computing elapsed time)
   */
  async logStep(actionLabel, opts = {}) {
    this._stepCounter++;
    const startTime = Date.now();
    const stepNum = this._stepCounter;

    const url = await this.driver.getUrl().catch(() => 'unknown');
    const title = await this.driver.getTitle().catch(() => 'unknown');

    let context = 'unknown';
    try { context = await this.driver.getContext(); } catch (_) {}

    const platform = this.driver.__mobilePlatform || process.env.TEST_PLATFORM || 'unknown';

    var parts = [
      `[STEP ${stepNum}] ${actionLabel}`,
      `platform=${platform}`,
      `ctx=${context}`,
      `url=${url.substring(0, 100)}`,
      `title=${title.substring(0, 50)}`,
    ];
    if (opts.locator) parts.push(`locator=${opts.locator}`);
    if (opts.elementCount !== undefined) parts.push(`count=${opts.elementCount}`);

    logger.info('[MobileDebug] ' + parts.join(' | '));
    return startTime;
  }

  /**
   * Log the end of an action step with elapsed time.
   *
   * @param {string} actionLabel - Human-readable action name
   * @param {number} startTime - Start time from logStep()
   * @param {boolean} [success=true] - Whether the step succeeded
   */
  logStepEnd(actionLabel, startTime, success) {
    if (success === undefined) success = true;
    const elapsed = Date.now() - startTime;
    var status = success ? 'OK' : 'FAIL';
    logger.info(`[MobileDebug] [STEP END] ${actionLabel}: ${status} (${elapsed}ms)`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Static Convenience Methods
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Static: Capture full failure diagnostics given a driver.
   * Used by hooks/index.js to capture automatic diagnostics on failure.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {string} scenarioName - Name of the failed scenario
   * @param {Error} [error] - The error that caused the failure
   * @param {string[]} [failedSelectors] - Selectors that failed
   * @returns {Promise<object>} Diagnostics metadata
   */
  static async captureFailure(driver, scenarioName, error, failedSelectors) {
    if (!driver) {
      logger.warn('[MobileDebug] No driver available for failure capture');
      return null;
    }
    var debug = new MobileDebugUtility(driver);
    return debug.captureFailure(scenarioName, { error, failedSelectors });
  }

  /**
   * Static: Dump current page state.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {string} [label='state-dump'] - Dump label
   * @returns {Promise<object>} Dump metadata
   */
  static async dumpPageState(driver, label) {
    if (!driver) {
      logger.warn('[MobileDebug] No driver available for state dump');
      return null;
    }
    var debug = new MobileDebugUtility(driver);
    return debug.dumpPageState(label);
  }

  /**
   * Static: Log interactive elements on the page.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {boolean} [visibleOnly=true] - Only show visible elements
   */
  static async logInteractiveElements(driver, visibleOnly) {
    if (!driver) {
      logger.warn('[MobileDebug] No driver available');
      return;
    }
    if (visibleOnly === undefined) visibleOnly = true;
    var debug = new MobileDebugUtility(driver);
    await debug.logInteractiveElements(visibleOnly);
  }

  /**
   * Static: Log the current environment state.
   *
   * @param {object} driver - WebDriverIO driver
   * @returns {Promise<object>} Environment state
   */
  static async logEnvironment(driver) {
    if (!driver) {
      logger.warn('[MobileDebug] No driver available');
      return null;
    }
    var debug = new MobileDebugUtility(driver);
    return debug.logEnvironment();
  }

  /**
   * Static: Save a screenshot.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {string} [label='screenshot'] - Screenshot label
   * @returns {Promise<string|null>} Path to saved screenshot
   */
  static async saveScreenshot(driver, label) {
    if (!driver) return null;
    var debug = new MobileDebugUtility(driver);
    return debug.saveScreenshot(label || 'screenshot');
  }

  /**
   * Static: Save page source.
   *
   * @param {object} driver - WebDriverIO driver
   * @param {string} [label='page-source'] - Source label
   * @returns {Promise<string|null>} Path to saved source
   */
  static async savePageSource(driver, label) {
    if (!driver) return null;
    var debug = new MobileDebugUtility(driver);
    return debug.savePageSource(label || 'page-source');
  }
}

module.exports = MobileDebugUtility;
