// Playwright configuration for browser defaults, artifacts, viewport, and Playwright HTML reporting.
// Note: API tests (cucumber.api.js) do NOT use this config.
// API tests use Playwright APIRequestContext directly — no Browser, Context, or Page instances.
// The Cucumber config (cucumber.api.js) drives API test execution independently.
require('dotenv').config();

module.exports = {
  timeout: Number(process.env.TIMEOUT || 30000),
  retries: Number(process.env.RETRIES || 0),
  use: {
    baseURL: process.env.BASE_URL || 'https://www.amazon.in',
    headless: process.env.HEADLESS !== 'false',
    trace: process.env.TRACE || 'on',
    video: process.env.VIDEO || 'retain-on-failure',
    screenshot: process.env.SCREENSHOT || 'only-on-failure',
    viewport: {
      width: Number(process.env.VIEWPORT_WIDTH || 1440),
      height: Number(process.env.VIEWPORT_HEIGHT || 900)
    }
  },
  reporter: [['html', { outputFolder: 'playwright-report' }]]
};
