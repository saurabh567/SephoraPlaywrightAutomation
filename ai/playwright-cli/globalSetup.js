/**
 * globalSetup.js
 *
 * Playwright CLI global setup script.
 * Runs once before all Playwright CLI test executions.
 * Integrates with the AI framework's pre-flight checks.
 *
 * Responsibilities:
 *   - Ensure AI services (Ollama, Chroma) are healthy
 *   - Validate environment configuration
 *   - Initialize vector store if needed
 *   - Emit EventBus lifecycle events
 *   - Set up platform-specific prerequisites (Appium, emulators, etc.)
 *
 * Configured in playwright.config.cli.js as globalSetup.
 */

const fs = require('fs-extra');
const path = require('path');

async function globalSetup(config) {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Playwright CLI Global Setup');
  console.log('══════════════════════════════════════════════\n');

  const ROOT = process.cwd();
  const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();

  // ─── 1. Ensure report directories ─────────────────────────────────────
  fs.ensureDirSync(path.join(ROOT, 'reports', 'playwright-cli'));
  fs.ensureDirSync(path.join(ROOT, 'reports', 'json'));

  // ─── 2. Environment validation ────────────────────────────────────────
  console.log(`  Platform: ${platform}`);
  console.log(`  CI Mode: ${process.env.CI === 'true'}`);
  const execCfg = require('../../config/executionConfig'); console.log(`  Headless: ${execCfg.isHeadless}`);

  // ─── 3. AI service health checks (non-fatal) ──────────────────────────
  try {
    const unifiedHealth = require('../health/unifiedHealth');
    const health = await unifiedHealth.run();
    console.log(`  Health: ${health.summary || 'ok'}`);
  } catch (e) {
    console.warn(`  [⚠] Health check skipped: ${e.message}`);
  }

  try {
    const ollamaManager = require('../health/ollamaManager');
    await ollamaManager.ensureRunning();
  } catch (e) {
    console.warn(`  [⚠] Ollama check skipped: ${e.message}`);
  }

  try {
    const chromaManager = require('../vector-db/chromaServerManager');
    await chromaManager.ensureRunning();
  } catch (e) {
    console.warn(`  [⚠] Chroma check skipped: ${e.message}`);
  }

  // ─── 4. Appium for mobile (non-fatal) ─────────────────────────────────
  if (platform === 'ANDROID' || platform === 'IOS') {
    try {
      const AppiumAgent = require('../agents/AppiumAgent');
      await AppiumAgent.startServerIfNeeded();
      console.log('  [✓] Appium started');
    } catch (e) {
      console.warn(`  [⚠] Appium start skipped: ${e.message}`);
    }
  }

  console.log('\n  [✓] Global setup complete\n');
}

module.exports = globalSetup;
