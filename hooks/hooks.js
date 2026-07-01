// Cucumber hooks that manage browser, context, page, screenshots, videos, and traces.
// Also performs automatic browser cache cleanup before/after test scenarios.
//
// IMPORTANT: API-only execution (via cucumber.api.js) does NOT load this file.
// However, if this file IS loaded alongside API tests (e.g., via cucumber.js with @api tags),
// the guards below prevent any browser launch or browser-related operations.
//
// Mobile BrowserContext Isolation:
//   Each test case gets a brand-new Appium driver session via MobileSessionManager.
//   Sessions are always disposed in After hook — even on failure.
//   No browser state is ever shared between test cases.
//
// Mobile Language Popup Handling:
//   The Amazon app shows a language selection popup IMMEDIATELY after launch on mobile.
//   This popup appears BEFORE any Cucumber step can execute.
//   Therefore, popup handling is done DIRECTLY in this Before hook — NOT in step definitions.
//   After createSession() returns, Android-specific popup handling runs immediately.
//   This ensures the app is ready for interaction when the first step executes.
//
// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM ISOLATION — CRITICAL
// ══════════════════════════════════════════════════════════════════════════════
//   Web execution:  this.page   = Playwright page object (has .locator(), .screenshot())
//   iOS execution:  this.driver = Appium/WebDriverIO driver (has .$(), .saveScreenshot())
//   Android exec.:  this.driver = Appium/WebDriverIO driver (has .$(), .saveScreenshot())
//
//   For backward compatibility with step definitions that reference this.page,
//   this.page is also set to the driver for mobile execution.  However, the
//   page objects in pages/ (AmazonHomePage, etc.) detect non-Playwright objects
//   and delegate to MobileAmazon* implementations automatically.
//
//   Screenshots: The After hook ALWAYS passes driver to ScreenshotUtility first
//   for mobile, avoiding "page.screenshot is not a function".
// ══════════════════════════════════════════════════════════════════════════════
//
// ============================================================================
// API ISOLATION GUARD — Do NOT remove.
// Three independent defense layers:
//   1. Config detection (cucumber.api.js in argv)
//   2. Env var detection (TEST_PLATFORM=API or API_ONLY=true)
//   3. Scenario tag detection (@api tag on feature/scenario)
// ============================================================================
const { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/env.config');
const logger = require('../utils/logger');
const WebDriverFactory = require('../framework/web/WebDriverFactory');
const ScreenshotUtility = require('../framework/common/ScreenshotUtility');
const BrowserCacheCleanup = require('../framework/common/BrowserCacheCleanup');
const MobileSessionManager = require('../framework/mobile/MobileSessionManager');
const { handleFirstLaunchIfNeeded } = require('../framework/mobile/AmazonFirstLaunchHandler');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const AppiumAgent = require('../ai/agents/AppiumAgent');

let browser;
const workerId = process.env.CUCUMBER_WORKER_ID || 'main';

// ---------------------------------------------------------------------------
// Layer 1 & 2: Detect API-only execution via config path or env var
// ---------------------------------------------------------------------------
const cucumberConfigPath = process.argv.find(a => a.includes('cucumber.api.js'))
  || process.env.CUCUMBER_CONFIG || '';
const isApiOnlyExecution = cucumberConfigPath.includes('cucumber.api.js')
  || String(process.env.TEST_PLATFORM || '').toUpperCase() === 'API'
  || process.env.API_ONLY === 'true';

// ---------------------------------------------------------------------------
// Layer 3: Per-scenario tag detection (checked in Before hook)
// ---------------------------------------------------------------------------
function isApiScenario(scenario) {
  if (!scenario || !scenario.pickle || !scenario.pickle.tags) return false;
  return scenario.pickle.tags.some(t => {
    const tagName = typeof t === 'string' ? t : (t.name || '');
    return tagName.toLowerCase().replace(/^@/, '') === 'api';
  });
}

const isWebExecution = !isApiOnlyExecution && config.testPlatform === TEST_PLATFORMS.WEB;
const isAndroidExecution = !isApiOnlyExecution && config.testPlatform === TEST_PLATFORMS.ANDROID;
const isIOSExecution = !isApiOnlyExecution && config.testPlatform === TEST_PLATFORMS.IOS;
const isMobileExecution = !isApiOnlyExecution && (isAndroidExecution || isIOSExecution);

if (isApiOnlyExecution) {
  logger.info('[Hooks] API-only execution detected — all browser/mobile hooks are permanently skipped');
}

setDefaultTimeout(config.timeout + 10000);

function getMobileAppId() {
  if (isApiOnlyExecution) return '';
  return MobileSessionManager.getAppId(config);
}

// ── BeforeAll: runs once per worker ────────────────────────────────────────

BeforeAll(async function () {
  // API ISOLATION: Never launch browser or perform UI hooks for API-only execution
  if (isApiOnlyExecution) {
    fs.ensureDirSync(path.join(config.reportDir, 'screenshots'));
    fs.ensureDirSync(path.join(config.reportDir, 'videos', `worker-${workerId}`));
    fs.ensureDirSync(path.join(config.reportDir, 'traces'));
    logger.info('[Hooks] API-only BeforeAll: browser launch skipped');
    return;
  }

  fs.ensureDirSync(path.join(config.reportDir, 'screenshots'));
  fs.ensureDirSync(path.join(config.reportDir, 'videos', `worker-${workerId}`));
  fs.ensureDirSync(path.join(config.reportDir, 'traces'));

  if (isWebExecution) {
    // Launch browser once per worker; context+page are created per-scenario in Before
    browser = await WebDriverFactory.launch(config);
    logger.info(`Browser launched: ${config.browser}, headless: ${config.headless}, worker: ${workerId}`);
  } else if (isMobileExecution) {
    if (isIOSExecution) {
      await AppiumAgent.startServerIfNeeded();
    }
    logger.info(`Mobile platform: ${config.testPlatform}. Driver created per-scenario.`);

    if (isAndroidExecution) {
      // Pre-clear app data via ADB before any test runs (supplemental safety net)
      try {
        const { execSync } = require('child_process');
        execSync(`adb shell pm clear ${BrowserCacheCleanup.ANDROID_AMAZON_PACKAGE} 2>/dev/null || true`, { timeout: 10000 });
        execSync(`adb shell pm clear ${BrowserCacheCleanup.ANDROID_CHROME_PACKAGE} 2>/dev/null || true`, { timeout: 10000 });
        logger.info('[Hooks] Android pre-session app data cleared via ADB');
      } catch (err) {
        logger.warn(`[Hooks] Android pre-session ADB cleanup failed: ${err.message}`);
      }
    }
  }
});

// ── Before: runs before each scenario ──────────────────────────────────────

Before(async function (scenario) {
  // -------------------------------------------------------------------
  // API ISOLATION: Layer 1/2 — config/env based
  // -------------------------------------------------------------------
  if (isApiOnlyExecution) {
    this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
    this.artifactName = `${this.scenarioName}_worker_${workerId}`;
    logger.info(`[API-only] Scenario started: ${scenario.pickle.name}`);
    this.platform = 'API';
    this.context = null;
    this.page = null;
    this.driver = null;
    return;
  }

  // -------------------------------------------------------------------
  // API ISOLATION: Layer 3 — scenario tag based (defense-in-depth)
  // -------------------------------------------------------------------
  if (isApiScenario(scenario)) {
    this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
    this.artifactName = `${this.scenarioName}_worker_${workerId}`;
    logger.info(`[Hooks] @api tag detected — skipping browser for scenario: ${scenario.pickle.name}`);
    this.platform = 'API';
    this.context = null;
    this.page = null;
    this.driver = null;
    return;
  }

  this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
  this.artifactName = `${this.scenarioName}_worker_${workerId}`;
  logger.info(`Scenario started: ${scenario.pickle.name}`);
  this.platform = config.testPlatform;

  // ===================================================================
  // WEB: Create fresh Playwright context + page per scenario
  // ===================================================================
  if (isWebExecution) {
    this.context = await WebDriverFactory.newContext(browser, config);
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeout);
    this.page.setDefaultNavigationTimeout(config.timeout);

    await BrowserCacheCleanup.clearWeb({ page: this.page }).catch(function(err) {
      logger.warn('Pre-scenario web cache cleanup failed (non-fatal): ' + err.message);
    });
    return;
  }

  // ===================================================================
  // MOBILE: Create brand-new isolated driver session per scenario
  // ===================================================================
  logger.info(`[Hooks] Creating new mobile session for scenario: ${scenario.pickle.name}`);

  let driver;
  try {
    if (isIOSExecution && String(config.mobile.browserName || '').toLowerCase() === 'safari') {
      // ══════════════════════════════════════════════════════════════════
      // iOS Safari: Use createSafariSession which provides a clean,
      // linear lifecycle:
      //   1. Terminate Safari
      //   2. Create fresh Safari session
      //   3. Switch WEBVIEW
      //   4. Navigate to BASE_URL
      //   5. Wait for visible homepage elements
      //   6. Return ready driver
      //
      // No URL contamination detection.
      // No about:blank.
      // No recursive recreation.
      // No retry loops.
      // ══════════════════════════════════════════════════════════════════
      driver = await MobileSessionManager.createSafariSession(config);
    } else {
      // Standard session creation for Android or iOS native app
      driver = await MobileSessionManager.createSession(config);
    }
  } catch (err) {
    logger.error(`[Hooks] Failed to create mobile session: ${err.message}`);
    throw err;
  }

  // ══════════════════════════════════════════════════════════════════
  // MOBILE: Set both this.driver AND this.page
  //
  // this.driver — canonical reference for mobile step definitions
  // this.page   — set to same driver for backward compatibility with
  //               step definitions that reference this.page.  The page
  //               objects in pages/ (AmazonHomePage, etc.) detect that
  //               a non-Playwright object was passed and delegate to
  //               MobileAmazon* implementations.
  //
  // Screenshots ALWAYS prefer this.driver over this.page (see After hook)
  // to avoid "page.screenshot is not a function" errors.
  // ══════════════════════════════════════════════════════════════════
  this.driver = driver;
  this.page = driver;

  // ===================================================================
  // MOBILE: Handle language popup BEFORE any step executes (Android)
  // ===================================================================
  if (isAndroidExecution) {
    try {
      await handleFirstLaunchIfNeeded(driver);
      logger.info('[MobileSessionManager] Android ready.');
    } catch (err) {
      logger.error(`[Hooks] Android first-launch popup handling failed: ${err.message}`);
      throw err;
    }
  }

  if (isIOSExecution) {
    logger.info(`[Hooks] iOS session ready for scenario: ${scenario.pickle.name}`);
  }

  logger.info(`[Hooks] New mobile session created for ${config.testPlatform}, scenario: ${scenario.pickle.name}`);
});

// ── After: runs after each scenario ────────────────────────────────────────

After(async function (scenario) {
  // API ISOLATION: Skip all browser/page context cleanup for API-only execution
  const isApi = isApiOnlyExecution || isApiScenario(scenario);
  if (isApi) {
    if (scenario.result.status === Status.FAILED) {
      logger.error(`[API-only] Scenario failed: ${scenario.pickle.name}`);
    } else {
      logger.info(`[API-only] Scenario passed: ${scenario.pickle.name}`);
    }
    return;
  }

  const safeName = this.artifactName;

  if (scenario.result.status === Status.FAILED) {
    const screenshotPath = path.join(config.reportDir, 'screenshots', `${safeName}.png`);
    logger.error(`Scenario failed: ${scenario.pickle.name}`);

    // ══════════════════════════════════════════════════════════════════
    // Screenshot capture: ALWAYS prefer driver over page.
    // For mobile, this.driver is an Appium driver with saveScreenshot().
    // For web, this.page is a Playwright page with screenshot().
    //
    // NEVER call page.screenshot() on an Appium driver.
    // ══════════════════════════════════════════════════════════════════
    if (this.driver) {
      try {
        const screenshot = await ScreenshotUtility.capture({ driver: this.driver, filePath: screenshotPath });
        await this.attach(screenshot, 'image/png');
        logger.info(`[Hooks] Mobile screenshot captured (via driver): ${screenshotPath}`);
      } catch (err) {
        logger.warn(`[Hooks] Mobile screenshot via driver failed: ${err.message}`);
        // Fallback: try with page (legacy)
        try {
          if (this.page && typeof this.page.screenshot === 'function') {
            const screenshot = await ScreenshotUtility.capture({ page: this.page, filePath: screenshotPath });
            await this.attach(screenshot, 'image/png');
            logger.info(`[Hooks] Mobile screenshot captured (via page): ${screenshotPath}`);
          }
        } catch (e2) {
          logger.warn(`[Hooks] All screenshot attempts failed: ${e2.message}`);
        }
      }
    } else if (this.page && typeof this.page.screenshot === 'function') {
      try {
        const screenshot = await ScreenshotUtility.capture({ page: this.page, filePath: screenshotPath });
        await this.attach(screenshot, 'image/png');
        logger.info(`[Hooks] Web screenshot captured: ${screenshotPath}`);
      } catch (err) {
        logger.warn(`[Hooks] Web screenshot capture failed: ${err.message}`);
      }
    } else {
      logger.warn(`[Hooks] Screenshot skipped — no usable page/driver available: ${scenario.pickle.name}`);
    }
  } else {
    logger.info(`Scenario passed: ${scenario.pickle.name}`);
  }

  // Post-scenario cache cleanup to prevent state leakage (Web only)
  if (isWebExecution && this.page && typeof this.page.locator === 'function') {
    try {
      await BrowserCacheCleanup.clearPostScenario({ page: this.page, platform: 'WEB' });
    } catch (err) {
      logger.warn(`[Hooks] Post-scenario cleanup warning: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE: Dispose the driver session (always, even on failure)
  //
  // Cleanup is simple:
  //   - delete WebDriver session
  //   - terminate Safari (iOS)
  //   - remove app (iOS)
  //   - no recursive recovery
  //   - no URL verification
  //   - no about:blank verification
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobileExecution && this.driver) {
    try {
      await MobileSessionManager.disposeSession(this.driver, {
        platform: config.testPlatform,
        appId: getMobileAppId()
      });
      logger.info('[Hooks] Mobile session disposed successfully');
    } catch (err) {
      logger.warn(`[Hooks] Mobile session dispose failed: ${err.message}`);
    }
    this.driver = null;
    this.page = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEB: Close context and page
  // ══════════════════════════════════════════════════════════════════════════
  if (isWebExecution) {
    // Close context (which also closes the page inside it)
    if (this.context) {
      try {
        await this.context.close();
        logger.info(`[Hooks] Browser context closed for: ${scenario.pickle.name}`);
      } catch (err) {
        logger.warn(`[Hooks] Context close failed: ${err.message}`);
      }
      this.context = null;
      this.page = null;
    }
  }
});

// ── AfterAll: runs once per worker ─────────────────────────────────────────

AfterAll(async function () {
  if (isApiOnlyExecution) {
    logger.info('[Hooks] API-only AfterAll: browser close skipped');
    return;
  }

  if (isWebExecution && browser) {
    try {
      await browser.close();
      logger.info('[Hooks] Browser closed successfully.');
    } catch (err) {
      logger.warn(`[Hooks] Browser close failed: ${err.message}`);
    }
    browser = null;
  }
});
