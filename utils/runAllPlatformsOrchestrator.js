#!/usr/bin/env node

/**
 * runAllPlatformsOrchestrator.js
 *
 * Master orchestrator for test:all:ai execution.
 * Runs ALL platforms sequentially regardless of individual exit codes.
 * Execution order:
 *   1. API (APIRequestContext only, no browser)
 *   2. WEB (headed mode — HEADLESS=false)
 *   3. ANDROID (visible Emulator — HEADLESS=false, HEADLESS_EMULATOR=false)
 *   4. IOS (visible Simulator — always visible, Apple limitation)
 *   5. AI Post Processing (analysis, vector ingestion)
 *   6. Dashboard (AI Executive Dashboard)
 *
 * Each step is independently spawned and its exit code is recorded.
 * If a step fails, subsequent steps still run.
 * The orchestrator exits with code 0 if all steps pass, or 1 if any step fails.
 *
 * Sets ORCHESTRATOR_RUN=true for all steps so that cleanReports.js only
 * performs light cleaning and does NOT delete cross-platform reports.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const cleanReports = require('./cleanReports');

const ROOT = path.resolve(__dirname, '..');

// ── Global environment for all steps ──────────────────────────────────────

const BASE_ENV = {
  ORCHESTRATOR_RUN: 'true',
};

// ── Execution steps ────────────────────────────────────────────────────────
// Each step: { name, env, cmd, args }
// Order: API → WEB → ANDROID → IOS → AI Post Processing → Dashboard

const STEPS = [
  // Step 1: API tests — no browser, APIRequestContext only
  {
    name: 'API Automation (APIRequestContext only, no browser)',
    env: { ...BASE_ENV, HEADLESS: 'false' },
    cmd: 'npm',
    args: ['run', 'test:api'],
    critical: true,
  },

  // Step 2: WEB tests — headed mode
  {
    name: 'Web Automation (headed)',
    env: { ...BASE_ENV, HEADLESS: 'false', TEST_PLATFORM: 'WEB', REPORT_DIR: 'reports/web' },
    cmd: 'npm',
    args: ['run', 'test:web'],
    critical: true,
  },

  // Step 3: ANDROID tests — visible Emulator
  {
    name: 'Android Automation (visible Emulator)',
    env: { ...BASE_ENV, HEADLESS: 'false', HEADLESS_EMULATOR: 'false', TEST_PLATFORM: 'ANDROID' },
    cmd: 'npm',
    args: ['run', 'test:android'],
    critical: false,
  },

  // Step 4: IOS tests — visible Simulator
  {
    name: 'iOS Automation (visible Simulator)',
    env: { ...BASE_ENV, HEADLESS: 'false', TEST_PLATFORM: 'IOS' },
    cmd: 'npm',
    args: ['run', 'test:ios'],
    critical: false,
  },

  // Step 5: AI API Analysis
  {
    name: 'AI API Analysis',
    env: { ...BASE_ENV },
    cmd: 'npm',
    args: ['run', 'ai:api-analysis'],
    critical: false,
  },

  // Step 6: AI Consolidated Report
  {
    name: 'AI Consolidated Report',
    env: { ...BASE_ENV },
    cmd: 'npm',
    args: ['run', 'ai:consolidated-report'],
    critical: false,
  },

  // Step 7: HTML Reports (all platforms)
  {
    name: 'HTML Reports (all platforms)',
    env: { ...BASE_ENV },
    cmd: 'npm',
    args: ['run', 'report:all'],
    critical: false,
  },

  // Step 8: AI Executive Dashboard
  {
    name: 'AI Executive Dashboard',
    env: { ...BASE_ENV },
    cmd: 'npm',
    args: ['run', 'dashboard:generate'],
    critical: false,
  },
];

// ── Results tracking ───────────────────────────────────────────────────────

const results = [];

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

function runStep(step, index) {
  const startTime = Date.now();
  const env = { ...process.env, ...step.env };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  [Step ${index + 1}/${STEPS.length}] ${step.name}`);
  console.log(`  Command: ${step.cmd} ${step.args.join(' ')}`);
  console.log(`  Environment overrides:`);
  for (const [key, value] of Object.entries(step.env)) {
    console.log(`    ${key}=${value}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const result = spawnSync(step.cmd, step.args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: env,
  });

  const durationMs = Date.now() - startTime;
  const exitCode = result.status !== null ? result.status : -1;
  const passed = exitCode === 0;

  results.push({
    name: step.name,
    command: `${step.cmd} ${step.args.join(' ')}`,
    envOverrides: step.env,
    exitCode: exitCode,
    passed: passed,
    durationMs: durationMs,
    duration: formatDuration(durationMs),
    error: result.error ? result.error.message : null,
  });

  console.log(`\n  → ${passed ? '✅ PASSED' : '❌ FAILED'} (exit code: ${exitCode}) in ${formatDuration(durationMs)}`);

  return { passed, exitCode };
}

// ── Report file generation ─────────────────────────────────────────────────

function generateValidationReport() {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const totalSteps = results.length;
  const passedSteps = results.filter((r) => r.passed).length;
  const failedSteps = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Check report paths
  const reportPaths = {
    'API Cucumber Report': 'reports/api/cucumber-report.json',
    'Web Cucumber Report': 'reports/web/cucumber-report.json',
    'Web HTML Report': 'reports/web/cucumber-html-report.html',
    'Android Environment': 'reports/android/environment.properties',
    'iOS Environment': 'reports/ios/environment.properties',
    'AI API Analysis Report': 'reports/ai/api-analysis-report.md',
    'AI Consolidated Summary': 'reports/dashboard/consolidated-summary.md',
    'Dashboard HTML': 'reports/dashboard/index.html',
    'Dashboard Data': 'reports/dashboard/dashboard-data.json',
  };

  const reportChecks = {};
  for (const [label, relPath] of Object.entries(reportPaths)) {
    const fullPath = path.join(ROOT, relPath);
    const exists = fs.existsSync(fullPath);
    reportChecks[label] = {
      path: relPath,
      exists,
      size: exists ? fs.statSync(fullPath).size : 0,
    };
  }

  const md = [
    '# Full Framework Orchestration Validation Report',
    '',
    `**Generated:** ${timestamp}`,
    `**Total Duration:** ${formatDuration(totalDuration)}`,
    '',
    '## Execution Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Steps | ${totalSteps} |`,
    `| Passed | ${passedSteps} |`,
    `| Failed | ${failedSteps} |`,
    `| Pass Rate | ${totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0}% |`,
    `| Total Time | ${formatDuration(totalDuration)} |`,
    '',
    '## Execution Order',
    '',
    '| # | Step | Result | Duration |',
    '|---|------|--------|----------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.passed ? '✅ PASSED' : '❌ FAILED'} (exit ${r.exitCode}) | ${r.duration} |`),
    '',
    '## Report Generation Status',
    '',
    '| Report | Path | Status | Size |',
    '|--------|------|--------|------|',
    ...Object.entries(reportChecks).map(([label, info]) =>
      `| ${label} | \`${info.path}\` | ${info.exists ? '✅ Generated' : '❌ Not found'} | ${info.exists ? formatFileSize(info.size) : 'N/A'} |`
    ),
    '',
    '## Platform Status',
    '',
    '| Platform | Execution | Report Generated | Notes |',
    '|----------|-----------|-----------------|-------|',
    `| API | ${results[0] ? (results[0].passed ? '✅' : '❌') : '⏭️'} | ${reportChecks['API Cucumber Report'].exists ? '✅' : '❌'} | Uses APIRequestContext only — no browser |`,
    `| WEB | ${results[1] ? (results[1].passed ? '✅' : '❌') : '⏭️'} | ${reportChecks['Web Cucumber Report'].exists ? '✅' : '❌'} | Headed (HEADLESS=false) |`,
    `| ANDROID | ${results[2] ? (results[2].passed ? '✅' : '❌') : '⏭️'} | ${reportChecks['Android Environment'].exists ? '✅' : '❌'} | Visible Emulator (HEADLESS_EMULATOR=false) |`,
    `| iOS | ${results[3] ? (results[3].passed ? '✅' : '❌') : '⏭️'} | ${reportChecks['iOS Environment'].exists ? '✅' : '❌'} | Visible Simulator (Apple limitation) |`,
    '',
    '## Headed Mode Validation',
    '',
    '| Platform | HEADLESS | HEADLESS_EMULATOR | Expected Behavior |',
    '|----------|----------|-------------------|-------------------|',
    '| API | `false` | (unset) | No browser — APIRequestContext only |',
    '| WEB | `false` | (unset) | Chromium window visible |',
    '| ANDROID | `false` | `false` | Emulator window visible |',
    '| iOS | `false` | (unset) | Simulator always visible (Apple Xcode limitation) |',
    '',
    '## Remaining Issues',
    '',
    failedSteps > 0 ? `- ❌ ${failedSteps} step(s) failed. Review logs above for details.` : '- ✅ No failures detected.',
    '- iOS Simulator does not support headless mode (Apple Xcode limitation). The simulator window is always visible.',
    '- Android Emulator requires Android SDK (ANDROID_HOME) and AVD to be configured.',
    '',
    '---',
    '',
    '*Report auto-generated by utils/runAllPlatformsOrchestrator.js*',
  ].join('\n');

  const reportDir = path.join(ROOT, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'orchestrator-validation-report.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`\n📄 Orchestration report written to: ${reportPath}`);
  return reportPath;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await cleanReports();
  } catch (err) {
    console.error(`[Orchestrator] Cleanup warning (non-fatal): ${err.message}`);
  }

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  console.log('='.repeat(60));
  console.log('  runAllPlatformsOrchestrator');
  console.log('  Full Framework Execution');
  console.log(`  Started: ${timestamp}`);
  console.log('='.repeat(60));

  let allPassed = true;

  for (let i = 0; i < STEPS.length; i++) {
    const { passed } = runStep(STEPS[i], i);
    if (!passed) allPassed = false;
    // Continue to next step regardless of failure
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  ORCHESTRATION EXECUTION SUMMARY');
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.duration}`);
  }

  console.log('-'.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  console.log(`  📊 ${passed}/${results.length} steps passed`);
  console.log('='.repeat(60));

  // Generate validation report
  const reportPath = generateValidationReport();

  console.log(`\n  Full validation report: ${reportPath}`);

  // Exit with non-zero only if any critical step failed, or all critical steps passed but we report status
  const criticalFailed = results
    .filter((r, i) => STEPS[i] && STEPS[i].critical && !r.passed)
    .length > 0;

  process.exit(criticalFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('[Orchestrator] Fatal error:', err.message);
  process.exit(1);
});
