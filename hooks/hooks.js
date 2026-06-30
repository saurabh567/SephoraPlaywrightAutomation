// Cucumber hooks that manage browser, context, page, screenshots, videos, and traces.
// Also performs automatic browser cache cleanup before/after test scenarios.
const { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/env.config');
const logger = require('../utils/logger');
const WebDriverFactory = require('../framework/web/WebDriverFactory');
const MobileDriverFactory = require('../framework/mobile/MobileDriverFactory');
const ScreenshotUtility = require('../framework/common/ScreenshotUtility');
const BrowserCacheCleanup = require('../framework/common/BrowserCacheCleanup');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const AppiumAgent = require('../ai/agents/AppiumAgent');

let browser;
const workerId = process.env.CUCUMBER_WORKER_ID || 'main';
const isWebExecution = config.testPlatform === TEST_PLATFORMS.WEB;
const isAndroidExecution = config.testPlatform === TEST_PLATFORMS.ANDROID;
const isIOSExecution = config.testPlatform === TEST_PLATFORMS.IOS;
const isMobileExecution = isAndroidExecution || isIOSExecution;

setDefaultTimeout(config.timeout + 10000);

function getMobileAppId() {
  if (config.testPlatform === TEST_PLATFORMS.ANDROID) {
    return config.mobile.appPackage;
  }
  if (config.testPlatform === TEST_PLATFORMS.IOS) {
    if (config.mobile.browserName.toLowerCase() === 'safari') {
      return process.env.IOS_SAFARI_BUNDLE_ID || 'com.apple.mobilesafari';
    }
    return config.mobile.bundleId;
  }
  return '';
}

async function closeMobileApp(driver) {
  const appId = getMobileAppId();
  if (!driver || !appId) return;
  try {
    await driver.terminateApp(appId);
    logger.info(`Mobile app closed successfully: ${appId}`);
  } catch (error) {
    logger.warn(`Mobile app close skipped or failed for ${appId}: ${error.message}`);
  }
}

async function createMobileDriverWithRetry(config, retries = 2, delayMs = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await MobileDriverFactory.createDriver(config);
    } catch (err) {
      lastError = err;
      const msg = String(err.message || '');
      const isRetryable =
        msg.includes('session is either terminated') ||
        msg.includes('No targets') ||
        msg.includes('could not be matched') ||
        msg.includes('instrumentation process cannot be initialized') ||
        msg.includes('instrumentation process crashed') ||
        msg.includes('An unknown server-side error');
      if (attempt <= retries && isRetryable) {
        logger.warn(`[mobile] Mobile driver creation attempt ${attempt} failed: ${msg.substring(0, 120)}. Retrying in ${delayMs / 1000}s ...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ── BeforeAll: runs once per worker ────────────────────────────────────────

BeforeAll(async function () {
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
      // ADB cache clear once per worker (supplemented per-scenario in Before)
      try {
        const { execSync } = require('child_process');
        execSync(`adb shell pm clear ${BrowserCacheCleanup.ANDROID_AMAZON_PACKAGE} 2>/dev/null || true`, { timeout: 10000 });
        execSync(`adb shell pm clear ${BrowserCacheCleanup.ANDROID_CHROME_PACKAGE} 2>/dev/null || true`, { timeout: 10000 });
        logger.info('[CacheCleanup] Android pre-session app data cleared via ADB');
      } catch (err) {
        logger.warn(`[CacheCleanup] Android pre-session ADB cleanup failed: ${err.message}`);
      }
    }
  }
});

// ── Before: runs before each scenario ──────────────────────────────────────

Before(async function (scenario) {
  this.scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_');
  this.artifactName = `${this.scenarioName}_worker_${workerId}`;
  logger.info(`Scenario started: ${scenario.pickle.name}`);
  this.platform = config.testPlatform;

  if (isWebExecution) {
    // Create fresh context + page per scenario (no state leakage)
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

  // Mobile: create fresh driver per scenario
  if (isIOSExecution) {
    this.driver = await createMobileDriverWithRetry(config);
  } else {
    // Android: use retry logic to handle transient instrumentation errors
    this.driver = await createMobileDriverWithRetry(config);
  }
  this.page = this.driver;

  // Per-scenario mobile cache cleanup (ADB, Appium commands, JS WebView)
  if (this.driver) {
    const isSafari = isIOSExecution && config.mobile.browserName &&
      config.mobile.browserName.toLowerCase() === 'safari';
    try {
      await BrowserCacheCleanup.clearAll({
        driver: this.driver,
        platform: config.testPlatform,
        isSafari,
        skipAdb: false  // Run ADB pm clear per scenario for thorough cleanup
      });
      logger.info(`[CacheCleanup] Pre-scenario cache cleared for ${config.testPlatform}`);
    } catch (err) {
      logger.warn(`[CacheCleanup] Pre-scenario cleanup failed (non-fatal): ${err.message}`);
    }
  }
});

// ── After: runs after each scenario ────────────────────────────────────────

After(async function (scenario) {
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

  // Post-scenario cache cleanup to prevent state leakage
  if (isWebExecution && this.page) {
    await BrowserCacheCleanup.clearPostScenario({ page: this.page, platform: 'WEB' }).catch(() => {});
  }

  // Close web context (clears all state for the next scenario)
  if (this.context) {
    await this.context.tracing.stop({ path: tracePath });
    await this.context.close();
  }

  // Close mobile driver session
  if (this.driver) {
    await closeMobileApp(this.driver);
    try {
      await this.driver.deleteSession();
    } catch (err) {
      logger.warn(`Session delete failed (may already be dead): ${err.message}`);
    }
  }
});

// ── AfterAll: runs once per worker ─────────────────────────────────────────

AfterAll(async function () {
  if (isWebExecution && browser) {
    await browser.close();
    logger.info(`Browser closed successfully for worker: ${workerId}`);
  }
  if (isIOSExecution) {
    await AppiumAgent.stopServerIfStartedByFramework();
  }
});
