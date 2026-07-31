#!/usr/bin/env node
import { orchestrate } from './unifiedOrchestrator';
/**
 * fullAuto.js
 *
 * Full automated execution pipeline.
 * Dispatches to the unified orchestrator for end-to-end AI-powered test automation.
 *
 * Legacy orchestrator.js is preserved at ai/orchestrator/orchestrator.js.
 * All orchestration logic now lives in ai/orchestrator/unifiedOrchestrator.js.
 */


async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  Full Auto Execution Pipeline');
  console.log('══════════════════════════════════════════════\n');

  const result = await orchestrate({
    platform: process.env.TEST_PLATFORM || 'WEB',
    enableRetry: true,
    maxRetries: Number(process.env.RETRIES || 2),
    runSmartSelector: true,
    runImpactAnalysis: true,
    runVisualValidation: true,
    runAnomalyDetection: true,
    runEcosystemCheck: true,
    runReleaseGate: true,
    runMonitoring: true,
    runPhaseScanning: true
  });

  console.log(`\n  Done. Status: ${result.overallStatus} (${result.durationMs}ms)`);

  process.exit(result.exitCode || 0);
}

main().catch(err => {
  console.error('[fullAuto] Fatal:', err.stack || err);
  process.exit(2);
});
