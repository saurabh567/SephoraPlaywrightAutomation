/**
 * playwright.config.cli.js
 *
 * Extended Playwright configuration for CLI-driven execution.
 * Uses config/executionConfig.js as single source of truth for headless/headed mode.
 *
 * Usage:
 *   npx playwright test --config playwright.config.cli.js
 *   HEADLESS=false npx playwright test --config playwright.config.cli.js
 *
 * Or via AI orchestrator:
 *   node ai/orchestrator/unifiedOrchestrator.js --playwright-cli
 */

const path = require('path');
require('dotenv').config();

const ROOT = __dirname;
const PLATFORM = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
const IS_CI = process.env.CI === 'true';

// Single source of truth for execution mode
const executionConfig = require('./config/executionConfig');
const IS_HEADED = executionConfig.isHeaded;

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
      ignoreHTTPSErrors: true,
      headless: executionConfig.isHeadless
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
      ignoreHTTPSErrors: true,
      headless: executionConfig.isHeadless
    },
    grep: /@web/
  },
  {
    name: 'Web - WebKit',
    use: {
      browserName: 'webkit',
      baseURL: process.env.BASE_URL || 'https://www.amazon.in',
      viewport: { width: Number(process.env.VIEWPORT_WIDTH || 1440), height: Number(process.env.VIEWPORT_HEIGHT || 900) },
      acceptDownloads: true,
      headless: executionConfig.isHeadless
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
      viewport: { width: 412, height: 915 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      acceptDownloads: false,
      hasTouch: true,
      isMobile: true,
      headless: false // Mobile always runs headed
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
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      acceptDownloads: false,
      hasTouch: true,
      isMobile: true,
      headless: false // Mobile always runs headed
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
      launchOptions: { headless: executionConfig.isHeadless }
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
      if (IS_CI) return webProjects;
      return [webProjects[0]];
  }
}

// ─── Config Export ─────────────────────────────────────────────────────────

module.exports = {
  testDir: path.join(ROOT, 'test-runners'),
  testMatch: '**/playwright-cli-runner.spec.js',

  fullyParallel: IS_CI,
  forbidOnly: IS_CI,

  retries: IS_CI ? Number(process.env.RETRIES || 2) : Number(process.env.RETRIES || 0),

  workers: IS_CI ? Number(process.env.PARALLEL || 4) : Number(process.env.PARALLEL || 1),

  timeout: Number(process.env.TIMEOUT || 60000),

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'reports/playwright-cli/results.json' }]
  ],

  // Use defaults — trace, video, screenshot are config-only (NOT CLI args)
  use: {
    headless: executionConfig.isHeadless,
    trace: process.env.TRACE || 'retain-on-failure',
    video: process.env.VIDEO || 'retain-on-failure',
    screenshot: process.env.SCREENSHOT || 'only-on-failure',
    actionTimeout: Number(process.env.ACTION_TIMEOUT || 15000),
    navigationTimeout: Number(process.env.NAVIGATION_TIMEOUT || 30000)
  },

  projects: selectProjects(),

  globalSetup: path.join(ROOT, 'ai', 'playwright-cli', 'globalSetup.js'),

  globalTeardown: path.join(ROOT, 'ai', 'playwright-cli', 'globalTeardown.js'),

  outputDir: 'test-results',

  ...(require('./playwright.config'))
};
