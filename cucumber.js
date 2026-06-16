// Cucumber runtime configuration for features, step definitions, hooks, reports, retries, parallel runs, and timeouts.
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

// Default ALLURE_RESULTS_DIR per platform
const ALLURE_RESULTS_DIR = process.env.ALLURE_RESULTS_DIR || (() => {
  switch (testPlatform) {
    case 'web': return 'reports/allure/web/allure-results';
    case 'android': return 'reports/allure/android/allure-results';
    case 'ios': return 'reports/allure/ios/allure-results';
    default: return 'reports/allure/web/allure-results';
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
      `html:${REPORT_DIR}/cucumber-html-report.html`,
      [
        'allure-cucumberjs/reporter',
        JSON.stringify({ resultsDir: ALLURE_RESULTS_DIR })
      ]
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    retry: Number(process.env.RETRIES || 0),
    parallel: Number(process.env.PARALLEL || 1),
    timeout: Number(process.env.TIMEOUT || 60000) + 10000
  }
};
