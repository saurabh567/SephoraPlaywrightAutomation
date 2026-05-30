require('dotenv').config();

const environments = {
  dev: { baseUrl: process.env.BASE_URL || 'https://sephora.in' },
  qa: { baseUrl: process.env.QA_URL || 'https://sephora.in' },
  stage: { baseUrl: process.env.STAGE_URL || 'https://sephora.in' }
};

const activeEnv = process.env.ENV || 'dev';

module.exports = {
  env: activeEnv,
  baseUrl: environments[activeEnv].baseUrl,
  browser: process.env.BROWSER || 'chromium',
  headless: process.env.HEADLESS !== 'false',
  timeout: Number(process.env.TIMEOUT || 60000),
  retries: Number(process.env.RETRIES || 1),
  parallel: Number(process.env.PARALLEL || 2),
  viewport: {
    width: Number(process.env.VIEWPORT_WIDTH || 1440),
    height: Number(process.env.VIEWPORT_HEIGHT || 900)
  },
  trace: process.env.TRACE || 'on',
  video: process.env.VIDEO || 'retain-on-failure'
};
