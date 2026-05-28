require('dotenv').config();

module.exports = {
  timeout: Number(process.env.TIMEOUT || 30000),
  retries: Number(process.env.RETRIES || 0),
  use: {
    baseURL: process.env.BASE_URL || 'https://sephora.in',
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
