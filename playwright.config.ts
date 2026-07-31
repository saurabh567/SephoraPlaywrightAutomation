// Playwright configuration for browser defaults, artifacts, viewport, and Playwright HTML reporting.
// Uses config/executionConfig.ts as single source of truth for headless/headed mode.
//
// Test discovery:
//   - testDir: test-runners/ — the Playwright↔Cucumber bridge specs live here
//   - testMatch: any *.spec.ts under testDir
//   - testIgnore: ai/generated-features — AI-generated artifact tests use a
//     legacy 'wd' + 'chai' + mocha stack that is NOT part of this framework
//     (the framework drives mobile via webdriverio + Cucumber). They are kept
//     as AI output but excluded from Playwright discovery, mirroring the
//     tsconfig exclusion.
//
// Note: API tests (cucumber.api.js) do NOT use this config.
// API tests use Playwright APIRequestContext directly — no Browser, Context, or Page instances.
// The Cucumber config (cucumber.api.js) drives API test execution independently.
import path from 'path';
import dotenv from 'dotenv';
import type { PlaywrightTestConfig } from '@playwright/test';
import executionConfig from './config/executionConfig';

dotenv.config();

const config: PlaywrightTestConfig = {
  testDir: path.join(__dirname, 'test-runners'),
  testMatch: '**/*.spec.ts',
  testIgnore: [
    '**/ai/generated-features/**',
    '**/node_modules/**',
    '**/dist/**'
  ],

  timeout: Number(process.env.TIMEOUT || 30000),
  retries: Number(process.env.RETRIES || 0),
  use: {
    baseURL: process.env.BASE_URL || 'https://www.amazon.in',
    headless: executionConfig.isHeadless,
    trace: (process.env.TRACE || 'on') as any,
    video: (process.env.VIDEO || 'retain-on-failure') as any,
    screenshot: (process.env.SCREENSHOT || 'only-on-failure') as any,
    viewport: {
      width: Number(process.env.VIEWPORT_WIDTH || 1440),
      height: Number(process.env.VIEWPORT_HEIGHT || 900)
    }
  },
  reporter: [['html', { outputFolder: 'playwright-report' }]]
};

export default config;
