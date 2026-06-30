// Cucumber runtime configuration for API tests only.
// Does NOT load hooks/hooks.js (no browser launch).
// API tests use Playwright APIRequestContext directly — no Browser, Context, or Page instances.
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
    parallel: Number(process.env.API_PARALLEL || 4),
    timeout: 30000
  }
};
