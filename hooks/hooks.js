// Cucumber hooks that manage browser, context, page, screenshots, videos, and traces.
// Also performs automatic browser cache cleanup before/after test scenarios.
//
// ══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE OPTIMIZATION — LAZY LOADING
// ══════════════════════════════════════════════════════════════════════════════
//   Web-related modules (WebDriverFactory, ScreenshotUtility, BrowserCacheCleanup)
//   are NOT loaded at module scope. They are dynamically required only when the
//   corresponding hook branch is executed (BeforeAll, Before, After).
//
//   For ANDROID_NATIVE execution, only the following are loaded eagerly:
//     - @cucumber/cucumber (framework hooks API)
//     - path, fs-extra (basic Node utilities)
//     - config/env.config (shared configuration)
//     - utils/logger (logging)
//     - mobile/lifecycle/DriverManager (shared driver access)
//     - framework/common/ExecutionMode (platform detection)
//     - framework/common/platforms (platform constants)
//     - hooks/startup-timer (performance instrumentation)
//
//   Everything else is deferred until actually needed.
//
//   Startup timer prints per-phase timing on first BeforeAll execution,
//   enabling precise measurement of each loading phase.
// ══════════════════════════════════════════════════════════════════════════════
//
// API ISOLATION GUARD — Do NOT remove.
// Three independent defense layers:
//   1. Config detection (cucumber.api.js in argv)
//   2. Env var detection (TEST_PLATFORM=API or API_ONLY=true)
//   3. Scenario tag detection (@api tag on feature/scenario)

'use strict';

// ── STARTUP TIMER (always first to measure all subsequent loads) ─────
const startupTimer = require('./startup-timer');
startupTimer.mark('hooks.js module scope start');

// ── EAGER IMPORTS (essential for all execution modes) ────────────────
const { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const fs = require('fs-extra');
const path = require('path');

// ── Shared framework modules (lightweight) ───────────────────────────
const config = require('../config/env.config');
const logger = require('../utils/logger');
const DriverManager = require('../mobile/lifecycle/DriverManager');
const {
  EXECUTION_MODES,
  getExecutionMode,
  isAndroid,
  isAndroidNative,
  isAndroidWeb,
  isIOS,
  isMobile,
  isWeb,
  isApi
} = require('../framework/common/ExecutionMode');
const { TEST_PLATFORMS } = require('../framework/common/platforms');

startupTimer.mark('Core imports complete');

let browser;
const workerId = process.env.CUCUMBER_WORKER_ID || 'main';

// ── API detection (lightweight string check) ─────────────────────────
const cucumberConfigPath = process.argv.find(a => a.includes('cucumber.api.js'))
  || process.env.CUCUMBER_CONFIG || '';
const isApiOnlyExecution = cucumberConfigPath.includes('cucumber.api.js')
  || String(process.env.TEST_PLATFORM || '').toUpperCase() === 'API'
  || process.env.API_ONLY === 'true';

function isApiScenario(scenario) {
  if (!scenario || !scenario.pickle || !scenario.pickle.tags) return false;
  return scenario.pickle.tags.some(t => {
    const tagName = typeof t === 'string' ? t : (t.name || '');
    return tagName.toLowerCase().replace(/^@/, '') === 'api';
  });
}

// ── Platform detection (single source: ExecutionMode) ────────────────
const executionMode = getExecutionMode();
const isAndroidExecution = isAndroid();
const isIOSExecution = isIOS();
const isMobileExecution = isMobile();
const isWebExecution = isWeb();

startupTimer.mark('Platform detection complete');

if (isApiOnlyExecution) {
  logger.info('[Hooks] API-only execution detected — all browser/mobile hooks are permanently skipped');
}

setDefaultTimeout(180000);

function getMobileAppId() {
  if (isApiOnlyExecution) return '';
  // Lazy require MobileSessionManager only when needed
  const MobileSessionManager = require('../framework/mobile/MobileSessionManager');
  return MobileSessionManager.getAppId(config);
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-FLIGHT TOOL VALIDATION
// ══════════════════════════════════════════════════════════════════════════

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

startupTimer.mark('Hooks helpers loaded');

// ── BeforeAll: runs once per worker ────────────────────────────────────────

BeforeAll(async function () {
  // Mark scenario start time
  startupTimer.mark('BeforeAll started');

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

  // ── LAZY LOAD: WebDriverFactory only for web execution ──
  if (isWebExecution) {
    const WebDriverFactory = require('../framework/web/WebDriverFactory');
    browser = await WebDriverFactory.launch(config);
    logger.info(`[Hooks] Browser launched: ${config.browser}, headless: ${config.headless}, worker: ${workerId}`);
  } else if (isMobileExecution) {
    if (DriverManager.hasDriver()) {
      logger.info('[Hooks] Driver already created by StartupOrchestrator — reusing.');
    } else {
      logger.info('[Hooks] No shared driver found — will create per-scenario in Before hook.');
    }
  }

  startupTimer.mark("BeforeAll complete");
  startupTimer.report();
});

// ── Before: runs before each scenario ──────────────────────────────────────

Before(async function (scenario) {
  startupTimer.mark('Before hook start');

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

  // ── WEB: Lazy load Playwright context + page ──
  if (isWebExecution) {
    const WebDriverFactory = require('../framework/web/WebDriverFactory');
    this.context = await WebDriverFactory.newContext(browser, config);
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeout);
    this.page.setDefaultNavigationTimeout(config.timeout);

    // Lazy require BrowserCacheCleanup only for web
    const BrowserCacheCleanup = require('../framework/common/BrowserCacheCleanup');
    await BrowserCacheCleanup.clearWeb({ page: this.page }).catch(function(err) {
      logger.warn('Pre-scenario web cache cleanup failed (non-fatal): ' + err.message);
    });
    return;
  }

  // ── MOBILE: Reuse existing driver from orchestrator ──
  logger.info(`[Hooks] Setting up mobile for scenario: ${scenario.pickle.name}`);

  let driver = null;

  if (DriverManager.hasDriver()) {
    driver = DriverManager.getSharedDriver();
    logger.info('[Hooks] Reusing existing driver from StartupOrchestrator');
  } else {
    // FALLBACK: Lazy require MobileSessionManager only for standalone mode
    logger.info('[Hooks] No shared driver — creating new mobile session (standalone mode)');
    try {
      const MobileSessionManager = require('../framework/mobile/MobileSessionManager');
      if (isIOSExecution) {
        driver = await MobileSessionManager.createSafariSession(config);
      } else {
        driver = await MobileSessionManager.createSession(config);
      }
    } catch (err) {
      logger.error(`[Hooks] Failed to create mobile session: ${err.message}`);
      throw err;
    }
  }

  this.driver = driver;

  // ── MOBILE: Verify application initialization ──
  // ApplicationInitializer.initialize() is called by the startup pipeline
  // (AndroidStartupPipeline / IosStartupPipeline) after driver creation.
  // In standalone mode (no pipeline), it is called here as fallback.
  if (isMobileExecution) {
    if (DriverManager.isStartupCompleted()) {
      logger.info("[Hooks] Application already initialized by startup pipeline — dashboard verified");
    } else {
      // Standalone mode: run initializer now
      logger.info("[Hooks] No startup pipeline detected — running ApplicationInitializer");
      try {
        var ApplicationInitializer = require("../framework/mobile/ApplicationInitializer");
        var initResult = await ApplicationInitializer.initialize(driver, { platform: isAndroidExecution ? "android" : "ios" });
        if (initResult.success && initResult.dashboardVerified) {
          logger.info("[Hooks] Application initialized and dashboard verified");
        } else {
          logger.error("[Hooks] Application initialization FAILED — aborting");
          throw new Error("Application initialization failed: dashboard not verified");
        }
      } catch (err) {
        logger.error("[Hooks] Application initialization error: " + err.message);
        throw err;
      }
    }
  }

  logger.info("[Hooks] Mobile session ready for " + config.testPlatform + ", scenario: " + scenario.pickle.name);
  startupTimer.mark("Before hook complete");

  logger.info(`[Hooks] Mobile session ready for ${config.testPlatform}, scenario: ${scenario.pickle.name}`);
  startupTimer.mark('Before hook complete');
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
        // Lazy require ScreenshotUtility only for failure scenarios on mobile
        const ScreenshotUtility = require('../framework/common/ScreenshotUtility');
        const screenshot = await ScreenshotUtility.capture({ driver: this.driver, filePath: screenshotPath });
        await this.attach(screenshot, 'image/png');
        logger.info(`[Hooks] Mobile screenshot captured (via driver): ${screenshotPath}`);

        try {
          // Lazy require MobileDebugUtility only on failure
          const MobileDebugUtility = require('../utils/mobileDebugUtility');
          await MobileDebugUtility.captureMobileDebugInfo(this.driver, config, scenario.pickle.name);
          logger.info('[Hooks] Mobile debug info captured');
        } catch (debugErr) {
          logger.warn('[Hooks] Mobile debug info capture failed (non-fatal): ' + debugErr.message);
        }
      } catch (screenshotErr) {
        logger.warn('[Hooks] Screenshot capture failed: ' + screenshotErr.message);
      }
    }

    // Save page source (mobile)
    if (this.driver) {
      try {
        const pageSource = await this.driver.getPageSource();
        if (pageSource) {
          const sourcePath = path.join(config.reportDir, 'screenshots', `${safeName}_source.html`);
          await fs.writeFile(sourcePath, pageSource);
          logger.info(`[Hooks] Page source saved: ${sourcePath}`);
        }
      } catch (sourceErr) {
        logger.warn('[Hooks] Page source capture failed: ' + sourceErr.message);
      }
    }
  }

  // Mobile cleanup — nothing to do on per-scenario basis
  if (isMobileExecution) {
    return;
  }

  // Web cleanup
  if (this.page && !this.page.isClosed()) {
    await this.page.close();
  }
  if (this.context) {
    if (scenario.result.status === Status.FAILED) {
      await this.context.tracing.stop({ path: path.join(config.reportDir, 'traces', `${safeName}.zip`) });
    } else {
      await this.context.tracing.stop();
    }
    await this.context.close();
  }
});

// ── AfterAll: runs once per worker ─────────────────────────────────────────

AfterAll(async function () {
  if (isApiOnlyExecution) {
    logger.info('[Hooks] API-only AfterAll: browser close skipped');
    return;
  }

  // Mobile: orchestrator handles cleanup — do NOT close driver here
  if (isMobileExecution) {
    logger.info('[Hooks] Mobile AfterAll: driver cleanup handled by orchestrator');
    return;
  }

  // Web: close browser
  if (isWebExecution && browser) {
    try {
      await browser.close();
      logger.info('[Hooks] Browser closed');
    } catch (err) {
      logger.warn('[Hooks] Browser close failed: ' + err.message);
    }
  }

  // Print startup timing report at the end of execution
  startupTimer.report();
});

// ── BeforeStep / AfterStep ──────────────────────────────────────────────────
// No BeforeStep or AfterStep hooks are currently required.
// Platform detection variables are initialized at module scope above.
