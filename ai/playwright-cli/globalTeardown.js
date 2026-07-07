/**
 * globalTeardown.js
 *
 * Playwright CLI global teardown script.
 * Runs once after all Playwright CLI test executions.
 *
 * Automatically ingests all Playwright results and artifacts
 * via PlaywrightResultIngestion — no manual steps needed.
 *
 * Configured in playwright.config.cli.js as globalTeardown.
 */

const fs = require('fs-extra');
const path = require('path');

async function globalTeardown(config) {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Playwright CLI Global Teardown');
  console.log('══════════════════════════════════════════════\n');

  const ROOT = process.cwd();
  const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();

  // ─── 1. Run PlaywrightResultIngestion ──────────────────────────────
  try {
    const ingester = require('./PlaywrightResultIngestion');
    const artifacts = await ingester.ingest({
      skipVectorIngest: false,
      skipEventPublish: false
    });
    console.log(`  [✓] ${artifacts.totalArtifacts} artifact(s) ingested`);
  } catch (e) {
    console.warn(`  [⚠] Result ingestion failed: ${e.message}`);
  }

  // ─── 2. Stop Appium if started ─────────────────────────────────────
  if (platform === 'ANDROID' || platform === 'IOS') {
    try {
      const AppiumAgent = require('../agents/AppiumAgent');
      await AppiumAgent.stopServerIfStartedByFramework();
      console.log('  [✓] Appium stopped');
    } catch (e) {
      console.warn(`  [⚠] Appium stop skipped: ${e.message}`);
    }
  }

  console.log('\n  [✓] Global teardown complete\n');
}

module.exports = globalTeardown;
