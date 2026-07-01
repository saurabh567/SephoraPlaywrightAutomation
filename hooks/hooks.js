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

  if (isWebExecution) {
    // Create fresh Playwright context + page per scenario (no state leakage)
    this.context = await WebDriverFactory.newContext(browser, config);
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeout);
    this.page.setDefaultNavigationTimeout(config.timeout);

    // Clear any residual browser state (cookies, localStorage, IndexedDB, etc.)
    await BrowserCacheCleanup.clearWeb({ page: this.page }).catch(function(err) {
      logger.warn('Pre-scenario web cache cleanup failed (non-fatal): ' + err.message);
    });
    return;
  }

  // ===================================================================
  // MOBILE: Create brand-new isolated driver session per scenario
  // ===================================================================
  // MobileSessionManager.createSession() guarantees:
  //   - New Appium session with noReset=false (Android) / fullReset behavior
  //   - App data cleared via ADB + Appium commands + JS WebView cleanup
  //   - No cookies, storage, cache, or state from previous sessions
  // ===================================================================

  logger.info(`[Hooks] Creating new mobile session for scenario: ${scenario.pickle.name}`);

  try {
    this.driver = await MobileSessionManager.createSession(config);
  } catch (err) {
    logger.error(`[Hooks] Failed to create mobile session: ${err.message}`);
    throw err;
  }

  // Map driver to page for compatibility with page objects that use this.page
  this.page = this.driver;

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
  const tracePath = path.join(config.reportDir, 'traces', `${safeName}.zip`);

  if (scenario.result.status === Status.FAILED) {
    const screenshotPath = path.join(config.reportDir, 'screenshots', `${safeName}.png`);
    logger.error(`Scenario failed: ${scenario.pickle.name}`);

    if (this.page || this.driver) {
      try {
        const screenshot = await ScreenshotUtility.capture({ page: this.page, driver: this.driver, filePath: screenshotPath });
        await this.attach(screenshot, 'image/png');
        logger.error(`Screenshot captured: ${screenshotPath}`);
      } catch (err) {
        logger.warn(`Screenshot capture failed (session may be dead): ${err.message}`);
      }
    } else {
      logger.warn(`Screenshot skipped because no browser page or mobile driver was created: ${scenario.pickle.name}`);
    }
  } else {
    logger.info(`Scenario passed: ${scenario.pickle.name}`);
  }

  // Post-scenario cache cleanup to prevent state leakage (Web only)
  if (isWebExecution && this.page) {
    await BrowserCacheCleanup.clearPostScenario({ page: this.page, platform: 'WEB' }).catch(() => {});
  }

  // Close web context (clears all state for the next scenario)
  if (this.context) {
    await this.context.tracing.stop({ path: tracePath });
    await this.context.close();
  }

  // ===================================================================
  // MOBILE: Always dispose the driver session, even on failure
  // ===================================================================
  // MobileSessionManager.disposeSession() guarantees:
  //   - App is terminated
  //   - Appium session is deleted (with retry)
  //   - ADB pm clear runs as safety net (Android)
  //   - Safari data cleared (iOS)
  //   - All resources released
  // ===================================================================
  if (this.driver) {
    const appId = getMobileAppId();
    logger.info(`[Hooks] Disposing mobile session for scenario: ${scenario.pickle.name}`);
    await MobileSessionManager.disposeSession(this.driver, {
      platform: config.testPlatform,
      appId
    });
    this.driver = null;
    this.page = null;
  }
});

// ── AfterAll: runs once per worker ─────────────────────────────────────────

AfterAll(async function () {
  // API ISOLATION: Never close browser for API-only execution
  if (isApiOnlyExecution) {
    logger.info('[Hooks] API-only AfterAll: browser close skipped');
    return;
  }

  if (isWebExecution && browser) {
    await browser.close();
    logger.info(`Browser closed successfully for worker: ${workerId}`);
  }
  if (isIOSExecution) {
    await AppiumAgent.stopServerIfStartedByFramework();
  }
});
