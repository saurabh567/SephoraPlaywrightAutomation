/**
 * debug.steps.js — Debug step definitions for mobile automation debugging.
 *
 * These steps can be inserted into any Cucumber feature file to capture
 * comprehensive diagnostic information at any point during test execution.
 *
 * Usage in .feature files:
 *
 *   Scenario: Debug cart page
 *     Given a product is added to the cart
 *     When I capture the current page state with label "after-adding-to-cart"
 *     And I log all interactive elements on the page
 *     And I proceed to checkout
 *     Then the checkout page should be loaded
 *
 * Debug files are saved under reports/mobile/debug/ and reports/mobile/screenshots/
 */

const { When } = require('@cucumber/cucumber');
const logger = require('../utils/logger');
const { TEST_PLATFORMS } = require('../framework/common/platforms');

// ═════════════════════════════════════════════════════════════════════════════
// Dependency: lazy-loaded to avoid import errors in non-mobile contexts
// ═════════════════════════════════════════════════════════════════════════════

let MobileDebugUtility = null;
function getDebugUtility() {
  if (!MobileDebugUtility) {
    MobileDebugUtility = require('../utils/mobileDebugUtility');
  }
  return MobileDebugUtility;
}

// ═════════════════════════════════════════════════════════════════════════════
// Helper: check if current execution is mobile
// ═════════════════════════════════════════════════════════════════════════════

function isMobile(world) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function getDriver(world) {
  return world.driver || world.page || null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Step: Capture full page state dump
// ═════════════════════════════════════════════════════════════════════════════

When('I capture the current page state with label {string}', async function (label) {
  const driver = getDriver(this);
  if (!driver) {
    logger.warn('[DebugSteps] No driver/page available for state capture');
    return;
  }

  if (isMobile(this)) {
    const Debug = getDebugUtility();
    await Debug.dumpPageState(driver, label || 'manual-debug');
    logger.info(`[DebugSteps] Page state captured with label: "${label}"`);
  } else {
    // Web: capture screenshot as basic diagnostics
    try {
      const screenshotPath = `reports/web/screenshots/debug-${label}-${Date.now()}.png`;
      await driver.screenshot({ path: screenshotPath });
      logger.info(`[DebugSteps] Web screenshot saved: ${screenshotPath}`);

      // Also save page source
      const fs = require('fs-extra');
      const sourcePath = `reports/web/debug/debug-${label}-${Date.now()}.html`;
      fs.ensureDirSync('reports/web/debug');
      const content = await driver.content();
      fs.writeFileSync(sourcePath, content, 'utf8');
      logger.info(`[DebugSteps] Web page source saved: ${sourcePath}`);
    } catch (err) {
      logger.warn(`[DebugSteps] Web debug capture failed: ${err.message}`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Step: Log all interactive elements
// ═════════════════════════════════════════════════════════════════════════════

When('I log all interactive elements on the page', async function () {
  const driver = getDriver(this);
  if (!driver) {
    logger.warn('[DebugSteps] No driver/page available');
    return;
  }

  if (isMobile(this)) {
    const Debug = getDebugUtility();
    await Debug.logInteractiveElements(driver, true);
    logger.info('[DebugSteps] Interactive elements logged.');
  } else {
    // Web: log element info via Playwright
    try {
      const elements = await driver.locator('a[href], button, input, [role="button"]').all();
      logger.info(`[DebugSteps] Found ${elements.length} interactive elements on page`);
      for (let i = 0; i < Math.min(elements.length, 30); i++) {
        const el = elements[i];
        const tag = await el.evaluate(el => el.tagName).catch(() => '?');
        const text = await el.textContent().catch(() => '');
        const href = await el.getAttribute('href').catch(() => '');
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          logger.info(`  [${i}] <${tag}> text="${(text || '').trim().substring(0, 50)}" href="${href || ''}"`);
        }
      }
    } catch (err) {
      logger.warn(`[DebugSteps] Web element logging failed: ${err.message}`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Step: Log current environment state
// ═════════════════════════════════════════════════════════════════════════════

When('I log the current environment state', async function () {
  const driver = getDriver(this);
  if (!driver) {
    logger.warn('[DebugSteps] No driver/page available');
    return;
  }

  if (isMobile(this)) {
    const Debug = getDebugUtility();
    await Debug.logEnvironment(driver);
  } else {
    try {
      const url = driver.url();
      const title = await driver.title();
      logger.info('[DebugSteps] === ENVIRONMENT STATE ===');
      logger.info('[DebugSteps] URL:      ' + url);
      logger.info('[DebugSteps] Title:    ' + title);
      logger.info('[DebugSteps] Platform: WEB');
      logger.info('[DebugSteps] =========================');
    } catch (err) {
      logger.warn(`[DebugSteps] Environment log failed: ${err.message}`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Step: Save page source for debugging
// ═════════════════════════════════════════════════════════════════════════════

When('I save the page source with label {string}', async function (label) {
  const driver = getDriver(this);
  if (!driver) {
    logger.warn('[DebugSteps] No driver/page available');
    return;
  }

  if (isMobile(this)) {
    const Debug = getDebugUtility();
    await Debug.savePageSource(driver, label || 'manual-source');
    await Debug.saveScreenshot(driver, label || 'manual-source');
    logger.info(`[DebugSteps] Page source and screenshot saved with label: "${label}"`);
  } else {
    try {
      const fs = require('fs-extra');
      const sourcePath = `reports/web/debug/source-${label}-${Date.now()}.html`;
      fs.ensureDirSync('reports/web/debug');
      const content = await driver.content();
      fs.writeFileSync(sourcePath, content, 'utf8');
      logger.info(`[DebugSteps] Web page source saved: ${sourcePath}`);
    } catch (err) {
      logger.warn(`[DebugSteps] Web source save failed: ${err.message}`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Step: Capture DOM structure for a specific selector
// ═════════════════════════════════════════════════════════════════════════════

When('I capture the DOM structure for selector {string}', async function (selector) {
  const driver = getDriver(this);
  if (!driver) {
    logger.warn('[DebugSteps] No driver/page available');
    return;
  }

  if (isMobile(this)) {
    const Debug = getDebugUtility();
    const debug = new Debug(driver);
    await debug.captureDOMStructure(selector);
    logger.info(`[DebugSteps] DOM structure captured for selector: "${selector}"`);
  } else {
    try {
      const elements = await driver.locator(selector).all();
      logger.info(`[DebugSteps] Found ${elements.length} elements matching "${selector}"`);
      for (let i = 0; i < Math.min(elements.length, 5); i++) {
        const html = await elements[i].evaluate(el => el.outerHTML.substring(0, 500));
        logger.info(`  [${i}] ${html}`);
      }
    } catch (err) {
      logger.warn(`[DebugSteps] DOM capture failed: ${err.message}`);
    }
  }
});
