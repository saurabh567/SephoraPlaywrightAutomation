#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
import { orchestrate } from '../ai/orchestrator/enterpriseExecutionPipeline';
import { main as generateEnterpriseDashboard } from './generateEnterpriseDashboard';

/**
 * runAllPlatformsOrchestrator.js
 *
 * ENTERPRISE ORCHESTRATOR for `npm run test:all:ai`.
 *
 * Routes all execution through the Enterprise Execution Pipeline
 * (ai/orchestrator/enterpriseExecutionPipeline.js) which handles:
 *
 *   1. Platform scheduling (sequential by default, configurable to parallel)
 *   2. Platform independence (one failure never blocks others)
 *   3. Execution order: API → WEB → ANDROID → IOS → PERFORMANCE → AI Analysis → Dashboard
 *   4. Consolidated reporting and dashboard generation
 *   5. Platform availability checks (skip unavailable platforms with logged reason)
 *
 * Each platform is executed independently:
 *   - If Android Emulator is unavailable → log reason, continue with API/IOS/Performance
 *   - If iOS Simulator is unavailable → log reason, continue
 *   - NEVER abort the complete execution because one platform failed
 *
 * Execution strategies (configurable via EXECUTION_STRATEGY env var):
 *   - 'sequential' (default): run platforms one at a time
 *   - 'parallel': run platforms simultaneously (future)
 *
 * Usage:
 *   node utils/runAllPlatformsOrchestrator.js
 *   npm run test:all:ai
 *   EXECUTION_STRATEGY=parallel npm run test:all:ai
 */



const ROOT = process.cwd();
const DASHBOARD_DIR = path.join(ROOT, 'reports', 'dashboard');

async function main() {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        AI EXECUTIVE COMMAND CENTER                         ║');
  console.log('║        Enterprise Multi-Platform Orchestrator              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Started: ${timestamp}`);
  console.log(`  Command: npm run test:all:ai`);
  console.log(`  Strategy: ${process.env.EXECUTION_STRATEGY || 'sequential'}`);
  console.log('');

  // ── Step 1: Clean reports (light cleanup, don't delete cross-platform data) ──

  try {
    const cleanReports = require('./cleanReports');
    await cleanReports({ platform: 'all', orchestrated: true });
    console.log('  [✓] Reports directory prepared');
  } catch (err: any) {
    console.warn('  [⚠] Cleanup warning (non-fatal):', err.message);
  }

  // ── Step 2: Execute Enterprise Pipeline ──────────────────────────────────

  console.log('─'.repeat(60));
  console.log('  EXECUTING ENTERPRISE PIPELINE');
  console.log('  Platforms: API → WEB → ANDROID → IOS → PERFORMANCE');
  console.log('  Platform Independence: Each platform runs independently.');
  console.log('  A single platform failure NEVER aborts the entire execution.');
  console.log('─'.repeat(60));

  const pipelineResult = await orchestrate({
    // Options from CLI args or env vars
    platform: 'ALL',
    skipMissingPlatforms: process.env.SKIP_MISSING_PLATFORMS !== 'false'
  });

  // ── Step 3: Generate Enterprise Dashboard ────────────────────────────────

  console.log('');
  console.log('─'.repeat(60));
  console.log('  GENERATING ENTERPRISE DASHBOARD');
  console.log('─'.repeat(60));

  fs.ensureDirSync(DASHBOARD_DIR);

  let dashboardResult;
  try {
    dashboardResult = generateEnterpriseDashboard();
    console.log(`  [✓] Enterprise Dashboard: ${dashboardResult.htmlPath}`);
  } catch (err: any) {
    console.warn('  [⚠] Dashboard generation failed:', err.message);
    dashboardResult = { htmlPath: path.join(DASHBOARD_DIR, 'enterprise-dashboard.html') };
  }

  // ── Step 4: Print Executive Summary ──────────────────────────────────────

  const allResults = pipelineResult.allResults || [];
  const completed = allResults.filter((r: any) => r.status === 'completed').length;
  const failed = allResults.filter((r: any) => r.status === 'failed').length;
  const skipped = allResults.filter((r: any) => r.status === 'skipped').length;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        EXECUTIVE COMMAND CENTER — SUMMARY                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  ${'Platform'.padEnd(22)} ${'Status'.padEnd(12)} ${'Duration'.padEnd(12)} Exit`);
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(5)}`);

  for (const r of allResults) {
    const icon = r.status === 'completed' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
    const statusStr = r.status === 'completed' ? 'PASSED' : r.status === 'skipped' ? 'SKIPPED' : 'FAILED';
    console.log(`  ${icon} ${r.platform.padEnd(20)} ${statusStr.padEnd(12)} ${(r.durationFormatted || '').padEnd(12)} ${r.exitCode !== null ? r.exitCode : '-'}`);
  }

  console.log('');
  console.log(`  📊 ${completed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  📄 Enterprise Dashboard: ${dashboardResult.htmlPath || 'N/A'}`);
  console.log('');

  // Determine exit code: non-zero only if dashboard failed
  const dashboardFailed = failed > 0 && allResults.find((r: any) => r.platform === 'DASHBOARD')?.status === 'failed';
  const exitCode = dashboardFailed ? 1 : 0;
  process.exit(exitCode);
}

main().catch(err => {
  console.error('\n❌ Executive Command Center fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
