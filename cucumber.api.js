// Cucumber runtime configuration for API tests only.
// ============================================================================
// API ISOLATION: This config does NOT load hooks/hooks.js.
// API tests use Playwright APIRequestContext directly — no Browser, Context,
// or Page instances. All API step definitions are in step-definitions/api/*.js.
// ============================================================================
// SECURITY GUARANTEES:
//   1. Does NOT require 'hooks/hooks.js' — no browser launch hooks
//   2. Does NOT require 'step-definitions/**/*.js' — only API-specific steps
//   3. Feature paths are limited to 'features/api/**/*.feature' — no UI features
//   4. Uses Playwright's request.newContext() — standalone, no browser needed
// ============================================================================
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
