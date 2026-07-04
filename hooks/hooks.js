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
const MobileDebugUtility = require('../utils/mobileDebugUtility');
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

setDefaultTimeout(180000);

function getMobileAppId() {
  if (isApiOnlyExecution) return '';
  return MobileSessionManager.getAppId(config);
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-FLIGHT TOOL VALIDATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Validate that required tools are available before starting mobile tests.
 * Runs once per worker in BeforeAll. Provides clear error messages if a
 * required tool is missing.
 */
async function validateMobilePrerequisites() {
  const { execSync } = require('child_process');

  if (isAndroidExecution) {
    logger.info('[Hooks] Validating Android prerequisites...');
    try {
      const adbResult = execSync('adb get-state 2>/dev/null || echo "no-device"', { encoding: 'utf8', timeout: 5000 }).trim();
      if (adbResult === 'no-device' || adbResult.length === 0) {
        logger.warn('[Hooks] ADB not available — Android device/emulator may not be connected');
      } else {
        logger.info('[Hooks] ADB available, device state: ' + adbResult);
      }
    } catch (err) {
      logger.warn('[Hooks] ADB check failed: ' + err.message);
    }
  }

  if (isIOSExecution) {
    logger.info('[Hooks] Validating iOS prerequisites...');
    try {
      const xcrunResult = execSync('xcrun --version 2>/dev/null || echo "not-found"', { encoding: 'utf8', timeout: 5000 }).trim();
      if (xcrunResult === 'not-found') {
        logger.warn('[Hooks] xcrun not available — Xcode command line tools may not be installed');
      } else {
        logger.info('[Hooks] xcrun available: ' + xcrunResult);
      }
    } catch (err) {
      logger.warn('[Hooks] xcrun check failed: ' + err.message);
    }

    try {
      const simResult = execSync('xcrun simctl list booted 2>/dev/null | grep -i booted || echo "no-booted"', { encoding: 'utf8', timeout: 5000 }).trim();
      if (simResult === 'no-booted') {
        logger.warn('[Hooks] No booted iOS simulator found — tests may fail');
      } else {
        logger.info('[Hooks] Booted simulator found');
      }
    } catch (err) {
      logger.warn('[Hooks] Simulator check failed: ' + err.message);
    }
  }

  try {
    const http = require('http');
    const appiumUrl = new URL(config.appium.serverUrl);
    const healthy = await new Promise((resolve) => {
      const req = http.get(appiumUrl.origin + '/status', { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            resolve(body.value && body.value.ready !== false);
          } catch { resolve(false); }
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    });
    if (healthy) {
      logger.info('[Hooks] Appium server is healthy at ' + config.appium.serverUrl);
    } else {
      logger.info('[Hooks] Appium server not yet reachable at ' + config.appium.serverUrl + ' — will be started on demand');
    }
  } catch (err) {
    logger.info('[Hooks] Appium health check skipped: ' + err.message);
  }
}

// ── BeforeAll: runs once per worker ────────────────────────────────────────

BeforeAll(async function () {
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

  if (isMobileExecution && Number(process.env.PARALLEL || 1) > 1) {
    logger.warn('[Hooks] WARNING: Parallel mobile execution (PARALLEL=' + process.env.PARALLEL + ') may cause ADB/xcrun conflicts. Consider PARALLEL=1 for mobile tests.');
  }

  if (isMobileExecution) {
    await validateMobilePrerequisites();
  }

  if (isWebExecution) {
    browser = await WebDriverFactory.launch(config);
    logger.info(`Browser launched: ${config.browser}, headless: ${config.headless}, worker: ${workerId}`);
  } else if (isMobileExecution) {
    await AppiumAgent.startServerIfNeeded();
    logger.info(`Mobile platform: ${config.testPlatform}. Driver created per-scenario.`);

    if (isAndroidExecution) {
      if (process.env.APPIUM_AUTO_LAUNCH !== 'false') {
        try {
          const { execSync } = require('child_process');
          logger.info('[Hooks] Skipping Amazon pm clear - would cause app crash');
          execSync(`adb shell pm clear ${BrowserCacheCleanup.ANDROID_CHROME_PACKAGE} 2>/dev/null || true`, { timeout: 10000 });
          logger.info('[Hooks] Android pre-session app data cleared via ADB');
        } catch (err) {
          logger.warn(`[Hooks] Android pre-session ADB cleanup failed: ${err.message}`);
        }
      } else {
        logger.info('[Hooks] Skipping ADB pm clear — lifecycle already launched the app');
      }
    }
  }
});

// ── Before: runs before each scenario ──────────────────────────────────────

Before(async function (scenario) {
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

  // WEB
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

  // MOBILE
  logger.info(`[Hooks] Creating new mobile session for scenario: ${scenario.pickle.name}`);

  let driver;
  try {
    if (isIOSExecution && String(config.mobile.browserName || '').toLowerCase() === 'safari') {
      driver = await MobileSessionManager.createSafariSession(config);
    } else {
      driver = await MobileSessionManager.createSession(config);
    }
  } catch (err) {
    logger.error(`[Hooks] Failed to create mobile session: ${err.message}`);
    throw err;
  }

  this.driver = driver;
  this.page = driver;

  // Android: language popup handling + home page verification
  if (isAndroidExecution) {
    try {
      await handleFirstLaunchIfNeeded(driver);
      logger.info('[MobileSessionManager] Android ready.');
      try {
        const url = await driver.getUrl().catch(() => '');
        const source = await driver.getPageSource().catch(() => '');
        if (!url.includes('amazon.in') && !/search|amazon|cart|nav/i.test(source)) {
          logger.warn('[Hooks] Android did not land on Amazon Home Page. URL: ' + url);
        } else {
          logger.info('[Hooks] Android verified on Amazon Home Page');
        }
      } catch (verifyErr) {
        logger.warn('[Hooks] Android Home Page verification failed: ' + verifyErr.message);
      }
    } catch (err) {
      logger.error(`[Hooks] Android first-launch popup handling failed: ${err.message}`);
      throw err;
    }
  }

  // iOS: auth overlay dismissal + home page verification
  // NOTE: Cache cleanup is now handled INSIDE createSafariSession, BEFORE navigation.
  if (isIOSExecution) {
    try {
      const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
      const dismissHelper = new AmazonIOSSafariPage(driver);
      const dismissed = await dismissHelper.dismissAuthOverlay();
      if (dismissed) {
        logger.info('[Hooks] Auth overlay dismissed after iOS session creation');
      } else {
        logger.info('[Hooks] No auth overlay present after iOS session creation');
      }
    } catch (authErr) {
      logger.warn('[Hooks] Auth overlay dismissal failed (non-fatal): ' + authErr.message);
    }

    try {
      const url = await driver.getUrl().catch(() => '');
      const isHomePage = url.includes('amazon.in') && (
        url === 'https://www.amazon.in/' ||
        url === 'https://www.amazon.in' ||
        url === 'https://amazon.in/'
      );
      if (!isHomePage) {
        logger.warn('[Hooks] iOS Safari URL is not Home Page: ' + url);
      } else {
        logger.info('[Hooks] iOS Safari verified on Amazon Home Page');
      }
    } catch (verifyErr) {
      logger.warn('[Hooks] iOS Home Page verification failed: ' + verifyErr.message);
    }

    logger.info(`[Hooks] iOS session ready for scenario: ${scenario.pickle.name}`);
  }

  logger.info(`[Hooks] New mobile session created for ${config.testPlatform}, scenario: ${scenario.pickle.name}`);
});

// ── After: runs after each scenario ────────────────────────────────────────

After(async function (scenario) {
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

    if (this.driver) {
      try {
        const screenshot = await ScreenshotUtility.capture({ driver: this.driver, filePath: screenshotPath });
        await this.attach(screenshot, 'image/png');
        logger.info(`[Hooks] Mobile screenshot captured (via driver): ${screenshotPath}`);

        try {
          const debugUtil = new MobileDebugUtility(this.driver);
          await debugUtil.captureFailure('scenario-failure', {
            scenario: scenario.pickle.name,
            error: scenario.result.exception
          });
        } catch (debugErr) {
          logger.warn(`[Hooks] MobileDebug diagnostic capture failed: ${debugErr.message}`);
        }
      } catch (err) {
        logger.warn(`[Hooks] Mobile screenshot via driver failed: ${err.message}`);
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

  // Post-scenario web cleanup
  if (isWebExecution && this.page && typeof this.page.locator === 'function') {
    try {
      await BrowserCacheCleanup.clearPostScenario({ page: this.page, platform: 'WEB' });
    } catch (err) {
      logger.warn(`[Hooks] Post-scenario cleanup warning: ${err.message}`);
    }
  }

  // MOBILE: Dispose session
  if (isMobileExecution && this.driver) {
    try {
      await MobileSessionManager.disposeSession(this.driver, {
        platform: config.testPlatform,
        appId: getMobileAppId()
      });
      logger.info('[Hooks] Mobile session disposed successfully');

      try {
        await MobileSessionManager.cleanupBetweenScenarios(config.testPlatform);
        logger.info('[Hooks] Between-scenario cleanup completed');
      } catch (cleanupErr) {
        logger.warn('[Hooks] Between-scenario cleanup failed: ' + cleanupErr.message);
      }
    } catch (err) {
      logger.warn(`[Hooks] Mobile session dispose failed: ${err.message}`);
    }
    this.driver = null;
    this.page = null;
  }

  // WEB: Close context
  if (isWebExecution && this.context) {
    try {
      await this.context.close();
      logger.info(`[Hooks] Browser context closed for: ${scenario.pickle.name}`);
    } catch (err) {
      logger.warn(`[Hooks] Context close failed: ${err.message}`);
    }
    this.context = null;
    this.page = null;
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
