#!/usr/bin/env node
/**
 * runCucumberWithAi.js
 *
 * Thin wrapper that dispatches to the unified orchestrator for AI-powered test execution.
 * This is the entry point for `npm test` and `npm run test:ai`.
 *
 * The unified orchestrator (ai/orchestrator/unifiedOrchestrator.js) handles:
 *   - Pre-flight: AI service health checks (Ollama, Chroma, ecosystem)
 *   - Execution: platform test execution (Web/Android/iOS/API) with Appium lifecycle
 *   - AI Analysis: vector ingestion, failure analysis, locator healing, RCA, retry
 *   - Multi-Agent: smart test selection, impact analysis, visual validation, anomaly detection
 *   - Reporting: consolidated reports, dashboard, PR preparation, telemetry
 *
 * Legacy behavior preserved:
 *   - LOCATOR_HEALING=1 still triggers post-test locator analysis (via unified orchestrator)
 *   - Exit code propagation
 *   - All output directories unchanged
 */

const { orchestrate } = require('../ai/orchestrator/unifiedOrchestrator');

async function main() {
  const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();

  console.log('══════════════════════════════════════════════');
  console.log('  AI-Powered Test Execution');
  console.log(`  Platform: ${platform}`);
  console.log(`  Mode:     ${process.env.CI ? 'CI' : 'Local'}`);
  console.log('══════════════════════════════════════════════\n');

  const result = await orchestrate({
    platform,
    skipMultiAgent: process.env.CI ? false : true,  // Full multi-agent in CI, skip locally
    enableRetry: process.env.CI ? true : true,
    maxRetries: Number(process.env.RETRIES || 2),
    reportDir: process.env.REPORT_DIR || 'reports'
  });

  // Legacy LOCATOR_HEALING env var support
  if (process.env.LOCATOR_HEALING === '1') {
    console.log('\n[Post-Test] LOCATOR_HEALING enabled - locator analysis already handled by orchestrator Phase 2');
  }

  const exitCode = result.exitCode !== undefined ? result.exitCode : 0;
  process.exit(exitCode);
}

main().catch(err => {
  console.error('[runCucumberWithAi] Fatal:', err.stack || err.message);
  process.exit(2);
});
