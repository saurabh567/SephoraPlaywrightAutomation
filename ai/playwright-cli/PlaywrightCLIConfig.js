/**
 * PlaywrightCLIConfig.js
 *
 * Enterprise configuration profiles for Playwright CLI execution.
 * Defines execution modes, browser strategies, resource profiles,
 * and environment overrides consumed by PlaywrightCLILauncher.
 *
 * Architecture:
 *   - Profiles map to execution contexts (CI, local, debug, perf)
 *   - Each profile defines CLI flags, env vars, and resource constraints
 *   - DecisionEngine selects the profile based on context analysis
 *   - Profiles are additive — base profile + mode-specific overrides
 *
 * Usage:
 *   const cliConfig = require('./PlaywrightCLIConfig');
 *   const profile = cliConfig.resolveProfile('ci');
 *   // profile = { browsers, workers, timeout, headed, ... }
 */

const path = require('path');
const ROOT = process.cwd();

// ─── Base Profile ──────────────────────────────────────────────────────────

const BASE_PROFILE = {
  // Core Playwright CLI flags
  command: 'npx playwright test',
  config: path.join(ROOT, 'playwright.config.cli.js'),
  passWithNoTests: false,
  updateSnapshots: false,
  workers: undefined,          // Let Playwright decide
  timeout: 60000,
  retries: 0,
  repeatEach: 1,
  maxFailures: 0,              // 0 = no limit
  forbidOnly: true,
  fullyParallel: false,
  ignoreSnapshots: false,
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',

  // Browser config
  browsers: ['chromium'],
  headed: false,
  browserChannel: undefined,   // 'chrome', 'msedge', etc.

  // Project filter
  project: undefined,          // Run specific project(s)

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'reports/playwright-cli/results.json' }]
  ],

  // Environment overrides applied before CLI execution
  envOverrides: {},

  // Resource constraints
  resourceProfile: 'standard', // standard | high-memory | low-memory

  // AI integration
  injectAIAnalysis: true,      // Attach AI analysis callbacks
  emitEvents: true,            // Emit EventBus events
};

// ─── Mode Profiles ─────────────────────────────────────────────────────────

const MODE_PROFILES = {

  // ── CI Profile ───────────────────────────────────────────────────────────
  ci: {
    base: BASE_PROFILE,
    overrides: {
      workers: 4,
      retries: 2,
      timeout: 120000,
      fullyParallel: true,
      forbidOnly: true,
      browsers: ['chromium', 'firefox', 'webkit'],
      reporter: [
        ['github'],
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'reports/playwright-cli/results.json' }],
        ['junit', { outputFile: 'reports/playwright-cli/junit.xml' }]
      ],
      resourceProfile: 'high-memory',
      envOverrides: {
        CI: 'true',
        NODE_OPTIONS: '--max-old-space-size=4096'
      }
    },
    metadata: {
      name: 'CI',
      description: 'Full CI pipeline — all browsers, parallel, retries',
      riskLevel: 'high'
    }
  },

  // ── CI Critical Profile ─────────────────────────────────────────────────
  'ci-critical': {
    base: BASE_PROFILE,
    overrides: {
      workers: 2,
      retries: 3,
      timeout: 180000,
      fullyParallel: false,
      forbidOnly: true,
      browsers: ['chromium'],
      trace: 'on',
      video: 'on',
      screenshot: 'on',
      reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'reports/playwright-cli/results.json' }],
        ['junit', { outputFile: 'reports/playwright-cli/junit.xml' }]
      ],
      resourceProfile: 'high-memory',
      envOverrides: {
        CI: 'true',
        CRITICAL_RUN: 'true',
        NODE_OPTIONS: '--max-old-space-size=8192'
      }
    },
    metadata: {
      name: 'CI Critical',
      description: 'Critical CI path — deep analysis, max retries, full artifacts',
      riskLevel: 'critical'
    }
  },

  // ── Local Profile ───────────────────────────────────────────────────────
  local: {
    base: BASE_PROFILE,
    overrides: {
      workers: undefined,
      retries: 0,
      timeout: 60000,
      headed: true,
      browsers: ['chromium'],
      trace: 'on',
      video: 'off',
      screenshot: 'on',
      reporter: [
        ['line'],
        ['html', { outputFolder: 'playwright-report' }]
      ],
      resourceProfile: 'standard',
      envOverrides: {
        HEADLESS: 'false'
      }
    },
    metadata: {
      name: 'Local',
      description: 'Local development — headed mode, single browser',
      riskLevel: 'low'
    }
  },

  // ── Debug Profile ────────────────────────────────────────────────────────
  debug: {
    base: BASE_PROFILE,
    overrides: {
      workers: 1,
      retries: 0,
      timeout: 300000,
      headed: true,
      browsers: ['chromium'],
      trace: 'on',
      video: 'on',
      screenshot: 'on',
      reporter: [
        ['line'],
        ['html', { outputFolder: 'playwright-report' }]
      ],
      resourceProfile: 'standard',
      envOverrides: {
        HEADLESS: 'false',
        DEBUG: 'pw:api',
        PWDEBUG: '1'
      }
    },
    metadata: {
      name: 'Debug',
      description: 'Debug mode — slow timeout, PWDEBUG, full artifacts',
      riskLevel: 'low'
    }
  },

  // ── Smoke Profile ────────────────────────────────────────────────────────
  smoke: {
    base: BASE_PROFILE,
    overrides: {
      workers: 2,
      retries: 1,
      timeout: 30000,
      headed: false,
      browsers: ['chromium'],
      reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report' }]
      ],
      resourceProfile: 'standard',
      envOverrides: {
        TAGS: '@smoke'
      }
    },
    metadata: {
      name: 'Smoke',
      description: 'Quick smoke — single browser, fast',
      riskLevel: 'medium'
    }
  },

  // ── Regression Profile ───────────────────────────────────────────────────
  regression: {
    base: BASE_PROFILE,
    overrides: {
      workers: 4,
      retries: 1,
      timeout: 120000,
      fullyParallel: true,
      browsers: ['chromium', 'firefox', 'webkit'],
      reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'reports/playwright-cli/results.json' }]
      ],
      resourceProfile: 'high-memory',
      envOverrides: {
        TAGS: '@regression'
      }
    },
    metadata: {
      name: 'Regression',
      description: 'Full regression — all browsers, parallel',
      riskLevel: 'high'
    }
  },

  // ── Performance Profile ──────────────────────────────────────────────────
  performance: {
    base: BASE_PROFILE,
    overrides: {
      workers: 1,
      retries: 0,
      timeout: 300000,
      headed: false,
      browsers: ['chromium'],
      trace: 'off',
      video: 'off',
      screenshot: 'off',
      reporter: [
        ['json', { outputFile: 'reports/playwright-cli/perf-results.json' }]
      ],
      resourceProfile: 'low-memory',
      envOverrides: {
        PERF_MODE: 'true',
        NODE_OPTIONS: '--max-old-space-size=2048'
      }
    },
    metadata: {
      name: 'Performance',
      description: 'Performance measurement — minimal overhead',
      riskLevel: 'medium'
    }
  },

  // ─── Mobile Android Profile ──────────────────────────────────────────────
  'mobile-android': {
    base: BASE_PROFILE,
    overrides: {
      workers: 1,
      retries: 1,
      timeout: 180000,
      headed: true,
      browsers: ['chromium'],
      project: 'android',
      reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'reports/playwright-cli/android-results.json' }]
      ],
      resourceProfile: 'high-memory',
      envOverrides: {
        TEST_PLATFORM: 'ANDROID',
        HEADLESS: 'false',
        APPIUM_AUTO_LAUNCH: 'false'
      }
    },
    metadata: {
      name: 'Mobile Android',
      description: 'Android execution via Playwright CLI',
      riskLevel: 'high'
    }
  },

  // ─── Mobile iOS Profile ──────────────────────────────────────────────────
  'mobile-ios': {
    base: BASE_PROFILE,
    overrides: {
      workers: 1,
      retries: 1,
      timeout: 180000,
      headed: true,
      browsers: ['chromium'],
      project: 'ios',
      reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'reports/playwright-cli/ios-results.json' }]
      ],
      resourceProfile: 'high-memory',
      envOverrides: {
        TEST_PLATFORM: 'IOS',
        HEADLESS: 'false',
        APPIUM_AUTO_LAUNCH: 'false'
      }
    },
    metadata: {
      name: 'Mobile iOS',
      description: 'iOS execution via Playwright CLI',
      riskLevel: 'high'
    }
  },

  // ─── API Profile ─────────────────────────────────────────────────────────
  api: {
    base: BASE_PROFILE,
    overrides: {
      workers: 2,
      retries: 1,
      timeout: 60000,
      headed: false,
      browsers: ['chromium'],
      project: 'api',
      reporter: [
        ['list'],
        ['json', { outputFile: 'reports/playwright-cli/api-results.json' }]
      ],
      resourceProfile: 'standard',
      envOverrides: {
        TEST_PLATFORM: 'API',
        API_ONLY: 'true'
      }
    },
    metadata: {
      name: 'API',
      description: 'API tests via Playwright CLI',
      riskLevel: 'medium'
    }
  }
};

// ─── Config Resolver ───────────────────────────────────────────────────────

class PlaywrightCLIConfig {
  /**
   * Resolve a full config profile by merging base with mode overrides.
   * @param {string} profileName - Name of the profile (ci, local, debug, etc.)
   * @param {Object} [customOverrides] - Additional overrides at call site
   * @returns {Object} Resolved config profile
   */
  resolveProfile(profileName, customOverrides = {}) {
    const modeProfile = MODE_PROFILES[profileName];
    if (!modeProfile) {
      console.warn(`[PlaywrightCLIConfig] Unknown profile "${profileName}", falling back to local`);
      return this.resolveProfile('local', customOverrides);
    }

    // Deep merge: base → mode overrides → call-site overrides
    const resolved = JSON.parse(JSON.stringify(modeProfile.base));
    const overrides = modeProfile.overrides || {};

    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'envOverrides') {
        resolved.envOverrides = { ...resolved.envOverrides, ...value };
      } else if (key === 'reporter') {
        resolved.reporter = value; // Full replacement
      } else if (key === 'browsers') {
        resolved.browsers = [...value];
      } else {
        resolved[key] = value;
      }
    }

    // Apply call-site overrides
    for (const [key, value] of Object.entries(customOverrides)) {
      if (key === 'envOverrides') {
        resolved.envOverrides = { ...resolved.envOverrides, ...value };
      } else if (key === 'reporter') {
        resolved.reporter = value;
      } else if (key === 'browsers') {
        resolved.browsers = [...value];
      } else {
        resolved[key] = value;
      }
    }

    // Attach metadata
    resolved.profileName = profileName;
    resolved.metadata = modeProfile.metadata || {};

    return resolved;
  }

  /**
   * Select a profile based on DecisionEngine context.
   * @param {Object} context - DecisionEngine context { isCI, hasFailures, risk, platform, ... }
   * @returns {string} Profile name
   */
  selectProfileFromContext(context = {}) {
    const platform = (context.platform || 'WEB').toUpperCase();
    const isCI = context.isCI === true || process.env.CI === 'true';
    const riskLevel = context.risk ? (context.risk.level || 'low') : 'low';
    const hasFailures = context.hasFailures === true;

    // Platform-specific routing
    if (platform === 'ANDROID') return 'mobile-android';
    if (platform === 'IOS') return 'mobile-ios';
    if (platform === 'API') return 'api';

    // CI routing
    if (isCI) {
      if (riskLevel === 'critical' || hasFailures) return 'ci-critical';
      return 'ci';
    }

    // Debug mode
    if (process.env.DEBUG || process.env.PWDEBUG) return 'debug';

    // Tag-based routing
    const tags = context.tags || process.env.TAGS || '';
    if (tags.includes('@smoke')) return 'smoke';
    if (tags.includes('@regression')) return 'regression';

    // Performance mode
    if (process.env.PERF_MODE === 'true') return 'performance';

    // Default local
    return 'local';
  }

  /**
   * Get all available profile names.
   * @returns {string[]}
   */
  getProfiles() {
    return Object.keys(MODE_PROFILES);
  }

  /**
   * Get metadata for a profile.
   * @param {string} profileName
   * @returns {Object|null}
   */
  getProfileMetadata(profileName) {
    const profile = MODE_PROFILES[profileName];
    return profile ? profile.metadata || null : null;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new PlaywrightCLIConfig();

module.exports = instance;
module.exports.PlaywrightCLIConfig = PlaywrightCLIConfig;
module.exports.MODE_PROFILES = MODE_PROFILES;
module.exports.BASE_PROFILE = BASE_PROFILE;
