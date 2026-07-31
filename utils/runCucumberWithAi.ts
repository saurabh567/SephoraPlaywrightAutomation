#!/usr/bin/env node
import executionConfig from '../config/executionConfig';
/**
 * runCucumberWithAi.js
 *
 * ENTERPRISE ENTRY POINT for `npm test` and `npm run test:ai`.
 *
 * This script is the primary entry point for AI-powered test execution.
 * It dispatches to the Enterprise Execution Pipeline
 * (ai/orchestrator/enterpriseExecutionPipeline.js) which handles
 * multi-platform scheduling in the REQUIRED execution hierarchy:
 *
 *   Phase 1: API
 *   Phase 2: PERFORMANCE (JMeter)
 *   Phase 3: WEB
 *   Phase 4: MOBILE (ANDROID + iOS in PARALLEL)
 *   Phase 5: AI Analysis & Reporting
 *   Phase 6: Consolidated Dashboard
 *
 * Each platform runs independently — one failure never blocks others.
 * Android and iOS execute in parallel (both start simultaneously).
 *
 * The unified orchestrator (unifiedOrchestrator.js) is invoked only
 * for single-platform runs when TEST_PLATFORM is explicitly set.
 *
 * Supports --headed flag: pass `--headed` as a CLI argument to run browsers in headed mode.
 *   npm run test:ai -- --headed
 *   HEADLESS=false npm run test:ai
 *
 * Usage:
 *   HEADLESS=false npm run test:ai    # Run all platforms (MASTER COMMAND)
 *   npm run test:ai -- --headed       # Run all platforms in headed mode
 *   TEST_PLATFORM=WEB npm run test:ai # Run only WEB (legacy single-platform)
 *
 * AI Agent Monitoring:
 *   Automatically initializes the AI Agent Monitor before execution
 *   and generates comprehensive reports after execution completes.
 *   Reports: reports/ai/ai-agent-execution-summary.{html,json,md,csv,pdf}
 */

// ─── Parse CLI arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--headed')) {
  process.env.HEADLESS = 'false';
  console.log('[runCucumberWithAi] --headed detected: running in HEADED mode');
}


// ─── AI Agent Monitor Integration ─────────────────────────────────────────
let aiMonitor: any = null;

async function initializeMonitor() {
  try {
    const { AiAgentMonitorIntegration } = require('./runAiAgentMonitor');
    aiMonitor = new AiAgentMonitorIntegration();
    const ok = await aiMonitor.initialize();
    if (ok) aiMonitor.start();
    return ok;
  } catch (err: any) {
    console.log('[runCucumberWithAi] AI Agent Monitor unavailable (non-blocking):', err.message);
    return false;
  }
}

async function finalizeMonitor() {
  if (!aiMonitor) return;
  try {
    await aiMonitor.stop();
    console.log('[runCucumberWithAi] AI Agent reports generated in reports/ai/');
  } catch (err: any) {
    console.log('[runCucumberWithAi] AI Agent Monitor finalize warning:', err.message);
  }
}

async function main() {
  // ── Initialize AI Agent Monitor ────────────────────────────────────────
  const monitorEnabled = !process.env.AI_MONITOR_DISABLE;
  if (monitorEnabled) {
    await initializeMonitor();
  }

  const explicitPlatform = process.env.TEST_PLATFORM
    ? process.env.TEST_PLATFORM.toUpperCase()
    : null;

  let exitCode = 0;

  try {
    // ── Single-platform mode (legacy): if TEST_PLATFORM is explicitly set ───
    if (explicitPlatform) {
      console.log(`[runCucumberWithAi] TEST_PLATFORM=${explicitPlatform} — single-platform mode`);

      const { orchestrate } = require('../ai/orchestrator/unifiedOrchestrator');

      executionConfig.printBanner({ platform: explicitPlatform });

      const result = await orchestrate({
        platform: explicitPlatform,
        skipMultiAgent: process.env.CI ? false : true,
        enableRetry: process.env.CI ? true : true,
        maxRetries: Number(process.env.RETRIES || 2),
        reportDir: process.env.REPORT_DIR || 'reports'
      });

      exitCode = result.exitCode !== undefined ? result.exitCode : 0;
    } else {
      // ── Multi-platform mode (default): run ALL platforms via Enterprise Pipeline ─
      console.log('[runCucumberWithAi] No TEST_PLATFORM set — running ALL platforms via Enterprise Pipeline');
      console.log('[runCucumberWithAi] Execution order: API → PERFORMANCE → WEB → MOBILE (ANDROID || IOS)');

      const { orchestrate } = require('../ai/orchestrator/enterpriseExecutionPipeline');

      executionConfig.printBanner({ platform: 'ALL' });

      const result = await orchestrate({
        skipMissingPlatforms: true
      });

      // ── Print Platform Execution Summary ──────────────────────────────────
      console.log('\n══════════════════════════════════════════════');
      console.log('  Platform Execution Summary');
      console.log('══════════════════════════════════════════════\n');

      const allResults = result.allResults || [];
      const platformNames = ['API', 'PERFORMANCE', 'WEB', 'ANDROID', 'IOS'];

      for (const name of platformNames) {
        const platformResult = allResults.find((r: any) => r.platform === name);
        if (!platformResult) {
          console.log(`  ${'•'.padEnd(5)} ${name.padEnd(14)} NOT EXECUTED`);
          continue;
        }

        const icon = platformResult.status === 'completed' ? '✔' :
                     platformResult.status === 'skipped' ? '⏭' :
                     platformResult.status === 'failed' ? '✘' : '•';
        const statusStr = platformResult.status === 'completed' ? 'PASS' :
                          platformResult.status === 'skipped' ? 'SKIP' :
                          platformResult.status === 'failed' ? 'FAIL' : '?';
        const dur = platformResult.durationFormatted || '-';
        const exitC = platformResult.exitCode !== null ? platformResult.exitCode : '-';
        const reason = platformResult.skippedReason || '';

        console.log(`  ${icon} ${name.padEnd(14)} ${statusStr.padEnd(6)} ${dur.padEnd(12)} exit=${exitC.toString().padEnd(4)} ${reason}`);
      }

      // Print report paths
      console.log('');
      console.log('  Reports:');
      for (const name of platformNames) {
        const platformResult = allResults.find((r: any) => r.platform === name);
        if (platformResult && platformResult.reportPaths) {
          for (const [label, info] of (Object.entries(platformResult.reportPaths) as [string, any][])) {
            if (info.exists) {
              console.log(`    ${name}/${label}: ${info.path}`);
            }
          }
        }
      }

      // Print dashboard path
      const dashboardResult = allResults.find((r: any) => r.platform === 'DASHBOARD');
      if (dashboardResult && dashboardResult.reportPaths) {
        for (const [label, info] of (Object.entries(dashboardResult.reportPaths) as [string, any][])) {
          if (info.exists) {
            console.log(`    Dashboard: ${info.path}`);
          }
        }
      }

      // Fallback: show enterprise dashboard if generated
      const dashboardDir = require('path').join(process.cwd(), 'reports', 'dashboard');
      const dashboardHtml = require('path').join(dashboardDir, 'enterprise-dashboard.html');
      if (require('fs').existsSync(dashboardHtml)) {
        console.log(`    Enterprise Dashboard: reports/dashboard/enterprise-dashboard.html`);
      }

      exitCode = result.exitCode !== undefined ? result.exitCode : 0;
    }
  } finally {
    // ── Finalize AI Agent Monitor — ALWAYS runs, even on error ────────────
    if (monitorEnabled) {
      await finalizeMonitor();
    }
  }

  process.exit(exitCode);
}

main().catch(async err => {
  console.error('[runCucumberWithAi] Fatal:', err.stack || err.message);
  // Attempt to finalize monitor even on fatal error
  if (aiMonitor) {
    try { await aiMonitor.stop(); } catch (_: any) {}
  }
  process.exit(2);
});
