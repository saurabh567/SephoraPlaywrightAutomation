// Cucumber runtime configuration for API tests only.
// Does NOT load hooks/hooks.js (no browser launch).
module.exports = {
  default: {
    require: [
      'step-definitions/api/**/*.js'
    ],
    paths: ['features/api/**/*.feature'],
    format: [
      'summary',
      'json:reports/api/cucumber-report.json'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    retry: 0,
    parallel: 1,
    timeout: 30000
  }
};
