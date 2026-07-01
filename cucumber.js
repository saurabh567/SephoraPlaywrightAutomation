// Cucumber runtime configuration for features, step definitions, hooks, reports, retries, parallel runs, and timeouts.
// ============================================================================
// API ISOLATION NOTE:
// This config loads hooks/hooks.js which contains browser-launch logic.
// For API-only execution, use cucumber.api.js instead (does NOT load hooks).
// If this config is accidentally used with @api-tagged features, hooks/hooks.js
// contains a three-layer defense that prevents any browser interaction:
//   1. Config detection (cucumber.api.js in argv)
//   2. Env var detection (TEST_PLATFORM=API or API_ONLY=true)
//   3. Scenario tag detection (@api)
// ============================================================================
const path = require('path');

const testPlatform = (process.env.TEST_PLATFORM || 'web').toLowerCase();

// Default REPORT_DIR per platform
const REPORT_DIR = process.env.REPORT_DIR || (() => {
  switch (testPlatform) {
    case 'web': return 'reports/web';
    case 'android': return 'reports/android';
    case 'ios': return 'reports/ios';
    default: return 'reports';
  }
})();

module.exports = {
  default: {
    require: [
      'hooks/hooks.js',
      'step-definitions/**/*.js'
    ],
    paths: ['features/**/*.feature'],
    format: [
      'summary',
      `json:${REPORT_DIR}/cucumber-report.json`,
      `html:${REPORT_DIR}/cucumber-html-report.html`
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    retry: Number(process.env.RETRIES || 0),
    parallel: Number(process.env.PARALLEL || 1),
    timeout: Number(process.env.TIMEOUT || 60000) + 10000
  }
};
