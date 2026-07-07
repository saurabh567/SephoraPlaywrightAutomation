/**
 * playwright.config.cli.js
 *
 * Extended Playwright configuration for CLI-driven execution.
 * Used when tests are executed via `npx playwright test` through
 * the PlaywrightCLIAgent / PlaywrightCLILauncher.
 *
 * This config integrates with the existing framework:
 *   - Uses existing page objects, hooks, and utilities
 *   - Retains Cucumber BDD compatibility via test runner spec
 *   - Supports all platforms: WEB, ANDROID, IOS, API
 *   - Works alongside the existing playwright.config.js (not replacing it)
 *
 * The AI DecisionEngine selects this config when routing through
 * the Playwright CLI execution path.
 *
 * Usage:
 *   npx playwright test --config playwright.config.cli.js
 *
 * Or via AI orchestrator:
 *   node ai/orchestrator/unifiedOrchestrator.js --playwright-cli
 */

const path = require('path');
require('dotenv').config();

const ROOT = __dirname;
const PLATFORM = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
const IS_CI = process.env.CI === 'true';
const IS_HEADED = process.env.HEADLESS !== 'false' ? false : true;

// ─── Web Projects ──────────────────────────────────────────────────────────

const webProjects = [
  {
    name: 'Web - Chromium',
    use: {
      browserName: 'chromium',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: Number(process.env.VIEWPORT_WIDTH || 1440), height: Number(process.env.VIEWPORT_HEIGHT || 900) },
      acceptDownloads: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true
    },
    grep: /@web/
  },
  {
    name: 'Web - Firefox',
    use: {
      browserName: 'firefox',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: Number(process.env.VIEWPORT_WIDTH || 1440), height: Number(process.env.VIEWPORT_HEIGHT || 900) },
      acceptDownloads: true,
      ignoreHTTPSErrors: true
    },
    grep: /@web/
  },
  {
    name: 'Web - WebKit',
    use: {
      browserName: 'webkit',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: Number(process.env.VIEWPORT_WIDTH || 1440), height: Number(process.env.VIEWPORT_HEIGHT || 900) },
      acceptDownloads: true
    },
    grep: /@web/
  }
];

// ─── Mobile Android Projects ───────────────────────────────────────────────

const androidProjects = [
  {
    name: 'Android - Chromium',
    use: {
      browserName: 'chromium',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: 412, height: 915 },  // Pixel 5
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      acceptDownloads: false,
      hasTouch: true,
      isMobile: true
    },
    grep: /@android/
  }
];

// ─── Mobile iOS Projects ───────────────────────────────────────────────────

const iosProjects = [
  {
    name: 'iOS - WebKit',
    use: {
      browserName: 'webkit',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: 390, height: 844 },  // iPhone 14
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      acceptDownloads: false,
      hasTouch: true,
      isMobile: true
    },
    grep: /@ios/
  }
];

// ─── API Projects ──────────────────────────────────────────────────────────

const apiProjects = [
  {
    name: 'API Tests',
    use: {
      browserName: 'chromium',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      launchOptions: { headless: true }
    },
    grep: /@api/
  }
];

// ─── Select projects based on platform ─────────────────────────────────────

function selectProjects() {
  switch (PLATFORM) {
    case 'ANDROID':
      return androidProjects;
    case 'IOS':
      return iosProjects;
    case 'API':
      return apiProjects;
    case 'WEB':
    default:
      // In CI, run all web browsers; locally just chromium
      if (IS_CI) return webProjects;
      return [webProjects[0]]; // Chromium only for local
  }
}

// ─── Config Export ─────────────────────────────────────────────────────────

module.exports = {
  // Test directory — points to the CLI runner spec that bridges to Cucumber
  testDir: path.join(ROOT, 'test-runners'),
  testMatch: '**/playwright-cli-runner.spec.js',

  // Fully parallel in CI
  fullyParallel: IS_CI,
  forbidOnly: IS_CI,

  // Retries from environment or CI default
  retries: IS_CI ? Number(process.env.RETRIES || 2) : Number(process.env.RETRIES || 0),

  // Workers
  workers: IS_CI ? Number(process.env.PARALLEL || 4) : Number(process.env.PARALLEL || 1),

  // Timeout
  timeout: Number(process.env.TIMEOUT || 60000),

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'reports/playwright-cli/results.json' }]
  ],

  // Use defaults
  use: {
    headless: !IS_HEADED,
    trace: process.env.TRACE || 'retain-on-failure',
    video: process.env.VIDEO || 'retain-on-failure',
    screenshot: process.env.SCREENSHOT || 'only-on-failure',
    actionTimeout: Number(process.env.ACTION_TIMEOUT || 15000),
    navigationTimeout: Number(process.env.NAVIGATION_TIMEOUT || 30000)
  },

  // Projects based on platform
  projects: selectProjects(),

  // Global setup
  globalSetup: path.join(ROOT, 'ai', 'playwright-cli', 'globalSetup.js'),

  // Global teardown
  globalTeardown: path.join(ROOT, 'ai', 'playwright-cli', 'globalTeardown.js'),

  // Output folder for test artifacts
  outputDir: 'test-results',

  // Preserve existing playwright.config.js settings
  ...(require('./playwright.config'))
};
