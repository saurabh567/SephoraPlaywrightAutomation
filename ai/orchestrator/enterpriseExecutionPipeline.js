/**
 * enterpriseExecutionPipeline.js
 *
 * ENTERPRISE EXECUTION PIPELINE (REDESIGNED)
 * Master AI Orchestrator for multi-platform test execution.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXECUTION HIERARCHY (MANDATORY ORDER)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Phase 1:  API Automation          (sequential, always first)
 *   Phase 2:  PERFORMANCE (JMeter)    (sequential, after API)
 *   Phase 3:  WEB Automation          (sequential, after Performance)
 *   Phase 4:  MOBILE AUTOMATION       (ANDROID + IOS in PARALLEL)
 *               ├── Android Pipeline     │
 *               └── iOS Pipeline         │  ← both start simultaneously
 *   Phase 5:  AI Analysis & Reports    (sequential)
 *   Phase 6:  Consolidated Dashboard  (final)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PLATFORM INDEPENDENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   - Each platform runs independently.
 *   - One platform failure NEVER blocks subsequent platforms.
 *   - If Android Emulator unavailable: log reason, continue.
 *   - If iOS Simulator unavailable: log reason, continue.
 *   - Never abort entire execution due to single platform failure.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │              EnterpriseExecutionPipeline                    │
 *   │                                                             │
 *   │  Phase 1: API (sequential)                                  │
 *   │       ↓                                                     │
 *   │  Phase 2: PERFORMANCE (sequential)                          │
 *   │       ↓                                                     │
 *   │  Phase 3: WEB (sequential)                                  │
 *   │       ↓                                                     │
 *   │  Phase 4: MOBILE (PARALLEL)                                 │
 *   │       ├── ANDROID Pipeline ──┤                               │
 *   │       └── iOS Pipeline ──────┤                               │
 *   │       ↓ (both complete)                                      │
 *   │  Phase 5: AI Analysis & Reporting (sequential)               │
 *   │       ↓                                                     │
 *   │  Phase 6: Consolidated Dashboard                             │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node ai/orchestrator/enterpriseExecutionPipeline.js
 *   EXECUTION_STRATEGY=parallel node ai/orchestrator/enterpriseExecutionPipeline.js
 *   npm run test:all:ai  (redirected via package.json)
 */

const child_process = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { main: generateEnterpriseDashboard } = require('../../utils/generateEnterpriseDashboard');

// ─── Constants ─────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const DASHBOARD_DIR = path.join(ROOT, 'reports', 'dashboard');
const REPORTS_AI_DIR = path.join(ROOT, 'reports', 'ai');
const TIMESTAMP = new Date().toISOString();
const EXECUTION_STRATEGY = (process.env.EXECUTION_STRATEGY || 'sequential').toLowerCase();

// Platform timeout: 20 minutes per platform, 30 minutes for mobile (longer lifecycle)
const PLATFORM_TIMEOUT = 1200000;    // 20 min
const MOBILE_TIMEOUT = 1800000;     // 30 min (emulator/simulator boot overhead)

// ─── Platform Result Tracking ─────────────────────────────────────────────

class PlatformResult {
  constructor(platformName) {
    this.platform = platformName;
    this.status = 'scheduled'; // scheduled | executing | completed | failed | skipped | cancelled | blocked
    this.exitCode = null;
    this.durationMs = 0;
    this.durationFormatted = '0ms';
    this.startedAt = null;
    this.completedAt = null;
    this.skippedReason = null;
    this.errorMessage = null;
    this.command = null;
    this.reportPaths = {};
  }
}

// ─── Platform Definitions ─────────────────────────────────────────────────
// NOTE: PLATFORMS array defines the sequential phases.
// ANDROID and IOS are moved out of here into MOBILE_PLATFORMS
// for parallel execution in Phase 4.

const SEQUENTIAL_PLATFORMS = [
  {
    name: 'API',
    displayName: 'API Automation',
    script: 'test:api',
    env: { TEST_PLATFORM: 'API' },
    critical: false,
    checkCommand: () => true, // API always available
    description: 'APIRequestContext only, no browser'
  },
  {
    name: 'PERFORMANCE',
    displayName: 'Performance (JMeter)',
    script: 'perf:jmeter',
    env: {},
    critical: false,
    checkCommand: () => {
      try {
        const result = child_process.spawnSync('which', ['java'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
        return result.status === 0;
      } catch { return false; }
    },
    description: 'Apache JMeter performance tests'
  },
  {
    name: 'WEB',
    displayName: 'Web Automation',
    script: 'test:web',
    env: { TEST_PLATFORM: 'WEB', REPORT_DIR: 'reports/web' },
    critical: false,
    checkCommand: () => {
      const pwBin = path.join(ROOT, 'node_modules', '.bin', 'playwright');
      return fs.existsSync(pwBin);
    },
    description: 'Playwright Chromium browser'
  }
];

const MOBILE_PLATFORMS = [
  {
    name: 'ANDROID',
    displayName: 'Android Automation',
    script: 'test:android',
    env: { TEST_PLATFORM: 'ANDROID' },
    critical: false,
    checkCommand: () => {
      try {
        const result = child_process.spawnSync('which', ['adb'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
        return result.status === 0;
      } catch { return false; }
    },
    description: 'Android Emulator via Appium'
  },
  {
    name: 'IOS',
    displayName: 'iOS Automation',
    script: 'test:ios',
    env: { TEST_PLATFORM: 'IOS' },
    critical: false,
    checkCommand: () => {
      try {
        const result = child_process.spawnSync('which', ['xcrun'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
        return result.status === 0;
      } catch { return false; }
    },
    description: 'iOS Simulator via Appium'
  }
];

// ─── AI Analysis and Reporting Platforms ──────────────────────────────────

const REPORTING_PLATFORMS = [
  {
    name: 'AI_API_ANALYSIS',
    displayName: 'AI API Analysis',
    script: 'ai:api-analysis',
    env: {},
    critical: false,
    checkCommand: () => true
  },
  {
    name: 'AI_CONSOLIDATED_REPORT',
    displayName: 'AI Consolidated Report',
    script: 'ai:consolidated-report',
    env: {},
    critical: false,
    checkCommand: () => true
  },
  {
    name: 'REPORT_ALL',
    displayName: 'HTML Reports (all platforms)',
    script: 'report:all',
    env: {},
    critical: false,
    checkCommand: () => true
  },
  {
    name: 'DASHBOARD',
    displayName: 'AI Executive Dashboard',
    script: 'dashboard:generate',
    env: {},
    critical: true,
    checkCommand: () => true
  }
];

// Keep backward compatibility: PLATFORMS exported for external consumers
const PLATFORMS = [
  ...SEQUENTIAL_PLATFORMS,
  ...MOBILE_PLATFORMS,
  ...REPORTING_PLATFORMS
];

// ─── Helper Functions ─────────────────────────────────────────────────────

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

function nowISO() {
  return new Date().toISOString();
}

// ─── Platform Executor (single platform) ──────────────────────────────────

function executePlatform(platformDef, results, timeoutMs) {
  const result = new PlatformResult(platformDef.name);
  result.startedAt = nowISO();
  result.command = `npm run ${platformDef.script}`;

  const effectiveTimeout = timeoutMs || PLATFORM_TIMEOUT;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  [${platformDef.name}] ${platformDef.displayName}`);
  console.log(`  Command: npm run ${platformDef.script}`);
  console.log(`  Description: ${platformDef.description}`);
  console.log(`  Env: ${JSON.stringify(platformDef.env)}`);
  console.log(`${'='.repeat(60)}\n`);

  // Check platform availability
  if (!platformDef.checkCommand()) {
    result.status = 'skipped';
    result.skippedReason = `Platform prerequisites not met for ${platformDef.name}`;
    result.completedAt = nowISO();
    console.log(`  ⏭️  SKIPPED: ${result.skippedReason}`);
    results.push(result);
    return result;
  }

  result.status = 'executing';

  const startTime = Date.now();
  const env = { ...process.env, ...platformDef.env };

  const spawnResult = child_process.spawnSync('npm', ['run', platformDef.script], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: env,
    timeout: effectiveTimeout
  });

  const durationMs = Date.now() - startTime;
  result.durationMs = durationMs;
  result.durationFormatted = formatDuration(durationMs);
  result.exitCode = spawnResult.status !== null ? spawnResult.status : -1;
  result.completedAt = nowISO();

  if (result.exitCode === 0) {
    result.status = 'completed';
    console.log(`\n  ✅ [${platformDef.name}] PASSED (${result.durationFormatted})`);
  } else {
    result.status = 'failed';
    result.errorMessage = spawnResult.error ? spawnResult.error.message : `Exit code ${result.exitCode}`;
    console.log(`\n  ❌ [${platformDef.name}] FAILED (exit ${result.exitCode}, ${result.durationFormatted})`);
    if (spawnResult.error) {
      console.log(`     Error: ${spawnResult.error.message}`);
    }
  }

  // Collect report paths
  result.reportPaths = collectReportPaths(platformDef.name);

  results.push(result);
  return result;
}

// ─── Parallel Platform Executor (for Android + iOS) ───────────────────────

function executePlatformsParallel(platformDefs, results) {
  const startTime = Date.now();
  const nameList = platformDefs.map(p => p.name).join(' + ');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  [MOBILE PHASE] ${nameList} — PARALLEL EXECUTION`);
  console.log(`  Both platforms start simultaneously. Pipeline waits for ALL to complete.`);
  console.log(`${'='.repeat(60)}\n`);

  // Spawn both platforms as child processes
  const children = platformDefs.map((platformDef) => {
    const result = new PlatformResult(platformDef.name);
    result.startedAt = nowISO();
    result.command = `npm run ${platformDef.script}`;

    console.log(`  ┌── [${platformDef.name}] Preparing...`);

    if (!platformDef.checkCommand()) {
      result.status = 'skipped';
      result.skippedReason = `Platform prerequisites not met for ${platformDef.name}`;
      result.completedAt = nowISO();
      console.log(`  └── ⏭️  SKIPPED: ${platformDef.name} — ${result.skippedReason}`);
      return { platformDef, result, process: null };
    }

    result.status = 'executing';
    const env = { ...process.env, ...platformDef.env };

    console.log(`  ├── [${platformDef.name}] Launching...`);

    const proc = child_process.spawn('npm', ['run', platformDef.script], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
      env: env
    });

    return { platformDef, result, process: proc };
  });

  // Track all active processes and wait for them to complete
  const activeEntries = children.filter(c => c.process !== null);
  const completedResults = [];

  function waitForProcess(entry) {
    return new Promise((resolve) => {
      const { platformDef, result, process: proc } = entry;
      const procStartTime = Date.now();

      const timeout = setTimeout(() => {
        console.log(`\n  ⚠️  [${platformDef.name}] TIMEOUT reached — killing process`);
        try { proc.kill('SIGTERM'); } catch (_) {}
        try { proc.kill('SIGKILL'); } catch (_) {}

        result.durationMs = Date.now() - procStartTime;
        result.durationFormatted = formatDuration(result.durationMs);
        result.exitCode = -1;
        result.status = 'failed';
        result.errorMessage = 'Timed out after ' + formatDuration(MOBILE_TIMEOUT);
        result.completedAt = nowISO();
        result.reportPaths = collectReportPaths(platformDef.name);
        completedResults.push(result);
        resolve(result);
      }, MOBILE_TIMEOUT);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - procStartTime;
        result.durationMs = durationMs;
        result.durationFormatted = formatDuration(durationMs);
        result.exitCode = code !== null ? code : -1;
        result.completedAt = nowISO();

        if (code === 0) {
          result.status = 'completed';
          console.log(`\n  └── ✅ [${platformDef.name}] PASSED (${result.durationFormatted})`);
        } else {
          result.status = 'failed';
          result.errorMessage = `Exit code ${code}`;
          console.log(`\n  └── ❌ [${platformDef.name}] FAILED (exit ${code}, ${result.durationFormatted})`);
        }

        result.reportPaths = collectReportPaths(platformDef.name);
        completedResults.push(result);
        resolve(result);
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - procStartTime;
        result.durationMs = durationMs;
        result.durationFormatted = formatDuration(durationMs);
        result.exitCode = -1;
        result.status = 'failed';
        result.errorMessage = err.message;
        result.completedAt = nowISO();
        result.reportPaths = collectReportPaths(platformDef.name);
        completedResults.push(result);
        console.log(`\n  └── ❌ [${platformDef.name}] ERROR: ${err.message}`);
        resolve(result);
      });
    });
  }

  // Wait for ALL parallel processes to complete
  const promises = activeEntries.map(entry => waitForProcess(entry));

  // Also include skipped results
  const skippedEntries = children.filter(c => c.process === null);
  for (const entry of skippedEntries) {
    completedResults.push(entry.result);
    results.push(entry.result);
  }

  // This is a synchronous wait — the spawnSync-based pipeline needs this
  // Since executePlatformsParallel is called from the main sync loop,
  // we need to block until all parallel processes complete.
  // We use a polling approach for compatibility with the synchronous pipeline.
  return new Promise((resolve) => {
    Promise.all(promises).then(() => {
      // Push parallel results into the shared results array
      for (const r of completedResults) {
        // Only push if not already pushed (skipped were already pushed)
        if (!results.includes(r)) {
          results.push(r);
        }
      }

      const mobileDuration = Date.now() - startTime;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  [MOBILE PHASE] Both platforms completed`);
      const androidResult = completedResults.find(r => r.platform === 'ANDROID');
      const iosResult = completedResults.find(r => r.platform === 'IOS');
      console.log(`  ANDROID: ${androidResult ? androidResult.status.toUpperCase() : 'NOT EXECUTED'} (${androidResult ? androidResult.durationFormatted : '-'})`);
      console.log(`  iOS:     ${iosResult ? iosResult.status.toUpperCase() : 'NOT EXECUTED'} (${iosResult ? iosResult.durationFormatted : '-'})`);
      console.log(`  Total Mobile Phase: ${formatDuration(mobileDuration)}`);
      console.log(`${'='.repeat(60)}\n`);
      resolve();
    });
  });
}

// ─── Report Path Collector ────────────────────────────────────────────────

function collectReportPaths(platform) {
  const paths = {};
  const reportMap = {
    'API': [
      ['JSON', 'reports/api/api-summary.json'],
      ['Cucumber', 'reports/api/cucumber-report.json']
    ],
    'WEB': [
      ['JSON', 'reports/web/cucumber-report.json'],
      ['HTML', 'reports/web/cucumber-html-report.html']
    ],
    'ANDROID': [
      ['JSON', 'reports/android/cucumber-report.json'],
      ['Environment', 'reports/android/environment.properties']
    ],
    'IOS': [
      ['JSON', 'reports/ios/cucumber-report.json'],
      ['Environment', 'reports/ios/environment.properties']
    ],
    'PERFORMANCE': [
      ['JMeter Summary', 'reports/jmeter/summary/jmeter-summary.json'],
      ['JMeter HTML', 'reports/jmeter/html/index.html']
    ],
    'AI_API_ANALYSIS': [
      ['AI API Analysis', 'reports/ai/api-analysis-report.md']
    ],
    'AI_CONSOLIDATED_REPORT': [
      ['AI Consolidated', 'reports/dashboard/consolidated-summary.md']
    ],
    'REPORT_ALL': [
      ['All Platforms HTML', 'reports/dashboard/consolidated-report.html']
    ],
    'DASHBOARD': [
      ['Enterprise Dashboard', 'reports/dashboard/enterprise-dashboard.html'],
      ['Dashboard Data', 'reports/dashboard/enterprise-dashboard-data.json'],
      ['Pipeline Report', 'reports/dashboard/enterprise-pipeline-report.md']
    ]
  };

  const entries = reportMap[platform] || [];
  for (const [label, relPath] of entries) {
    const fullPath = path.join(ROOT, relPath);
    paths[label] = {
      path: relPath,
      exists: fs.existsSync(fullPath),
      size: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0
    };
  }
  return paths;
}

// ─── Dashboard Data Generator ─────────────────────────────────────────────

function generateDashboardData(allResults) {
  const totalPlatforms = allResults.length;
  const completed = allResults.filter(r => r.status === 'completed').length;
  const failed = allResults.filter(r => r.status === 'failed').length;
  const skipped = allResults.filter(r => r.status === 'skipped').length;
  const totalDuration = allResults.reduce((sum, r) => sum + r.durationMs, 0);

  const allPlatformNames = [
    ...SEQUENTIAL_PLATFORMS.map(p => p.name),
    ...MOBILE_PLATFORMS.map(p => p.name),
    ...REPORTING_PLATFORMS.map(p => p.name)
  ];

  const data = {
    generatedAt: TIMESTAMP,
    executionStrategy: EXECUTION_STRATEGY,
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      cpus: os.cpus().length,
      memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`
    },
    summary: {
      totalPlatforms,
      completed,
      failed,
      skipped,
      passRate: totalPlatforms > 0 ? Math.round((completed / totalPlatforms) * 100) : 0,
      totalDurationMs: totalDuration,
      totalDurationFormatted: formatDuration(totalDuration)
    },
    platforms: allResults.map(r => ({
      name: r.platform,
      status: r.status,
      exitCode: r.exitCode,
      durationMs: r.durationMs,
      duration: r.durationFormatted,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      skippedReason: r.skippedReason,
      errorMessage: r.errorMessage,
      command: r.command,
      reportPaths: r.reportPaths
    })),
    executionOrder: [
      'PHASE 1: API',
      'PHASE 2: PERFORMANCE',
      'PHASE 3: WEB',
      'PHASE 4: MOBILE (ANDROID + iOS in PARALLEL)',
      'PHASE 5: AI ANALYSIS & REPORTING',
      'PHASE 6: CONSOLIDATED DASHBOARD'
    ],
    executionLog: allResults.map(r => ({
      timestamp: r.completedAt || r.startedAt,
      platform: r.platform,
      status: r.status,
      duration: r.durationFormatted,
      message: r.skippedReason || r.errorMessage || 'OK'
    }))
  };

  return data;
}

// ─── Pipeline Execution Status Report ─────────────────────────────────────

function generatePipelineReport(allResults) {
  const data = generateDashboardData(allResults);
  const mdLines = [];

  mdLines.push('# Enterprise Execution Pipeline Report');
  mdLines.push('');
  mdLines.push(`**Generated:** ${TIMESTAMP}`);
  mdLines.push(`**Strategy:** ${EXECUTION_STRATEGY}`);
  mdLines.push(`**Machine:** ${data.machine.hostname} (${data.machine.platform}, ${data.machine.cpus} CPUs)`);
  mdLines.push('');
  mdLines.push('## Execution Summary');
  mdLines.push('');
  mdLines.push('| Metric | Value |');
  mdLines.push('|--------|-------|');
  mdLines.push(`| Total Platforms | ${data.summary.totalPlatforms} |`);
  mdLines.push(`| Completed | ${data.summary.completed} |`);
  mdLines.push(`| Failed | ${data.summary.failed} |`);
  mdLines.push(`| Skipped | ${data.summary.skipped} |`);
  mdLines.push(`| Pass Rate | ${data.summary.passRate}% |`);
  mdLines.push(`| Total Duration | ${data.summary.totalDurationFormatted} |`);
  mdLines.push('');
  mdLines.push('## Execution Hierarchy');
  mdLines.push('');
  mdLines.push('```');
  mdLines.push('Phase 1: API');
  mdLines.push('Phase 2: PERFORMANCE (JMeter)');
  mdLines.push('Phase 3: WEB');
  mdLines.push('Phase 4: MOBILE (ANDROID + iOS in PARALLEL)');
  mdLines.push('Phase 5: AI Analysis & Reporting');
  mdLines.push('Phase 6: Consolidated Dashboard');
  mdLines.push('```');
  mdLines.push('');
  mdLines.push('## Platform Results');
  mdLines.push('');
  mdLines.push('| Platform | Status | Duration | Exit Code | Reason |');
  mdLines.push('|----------|--------|----------|-----------|--------|');

  for (const p of data.platforms) {
    const statusIcon = p.status === 'completed' ? '✅' : p.status === 'skipped' ? '⏭️' : '❌';
    const reason = p.skippedReason || p.errorMessage || '-';
    mdLines.push(`| ${statusIcon} ${p.name} | ${p.status} | ${p.duration} | ${p.exitCode !== null ? p.exitCode : '-'} | ${reason} |`);
  }

  mdLines.push('');
  mdLines.push('## Report Generation Status');
  mdLines.push('');
  mdLines.push('| Platform | Report | Status | Size |');
  mdLines.push('|----------|--------|--------|------|');

  for (const p of data.platforms) {
    for (const [label, info] of Object.entries(p.reportPaths)) {
      const icon = info.exists ? '✅' : '❌';
      const sizeStr = info.exists ? (info.size > 1024 ? `${(info.size / 1024).toFixed(1)} KB` : `${info.size} B`) : 'N/A';
      mdLines.push(`| ${p.name} | ${label} | ${icon} ${info.exists ? 'Generated' : 'Not found'} | ${sizeStr} |`);
    }
  }

  mdLines.push('');
  mdLines.push('## Execution Timeline');
  mdLines.push('');
  mdLines.push('| # | Phase | Platform | Status | Duration |');
  mdLines.push('|---|-------|----------|--------|----------|');

  // Map platforms to phases
  const phaseMap = {
    'API': '1',
    'PERFORMANCE': '2',
    'WEB': '3',
    'ANDROID': '4 (PARALLEL)',
    'IOS': '4 (PARALLEL)',
    'AI_API_ANALYSIS': '5',
    'AI_CONSOLIDATED_REPORT': '5',
    'REPORT_ALL': '5',
    'DASHBOARD': '6'
  };

  data.executionLog.forEach((entry, i) => {
    const icon = entry.status === 'completed' ? '✅' : entry.status === 'skipped' ? '⏭️' : '❌';
    const phase = phaseMap[entry.platform] || '-';
    mdLines.push(`| ${i + 1} | ${phase} | ${icon} ${entry.platform} | ${entry.status} | ${entry.duration} |`);
  });

  mdLines.push('');
  mdLines.push('## Platform Independence Verification');
  mdLines.push('');
  mdLines.push('Each platform executes independently. One failure never blocks others.');
  mdLines.push('');
  mdLines.push('| Condition | API | PERFORMANCE | WEB | ANDROID | IOS |');
  mdLines.push('|-----------|-----|-------------|-----|---------|-----|');

  const platformResults = {};
  for (const p of data.platforms) {
    platformResults[p.name] = p.status;
  }

  const platforms = ['API', 'PERFORMANCE', 'WEB', 'ANDROID', 'IOS'];
  for (let i = 0; i < platforms.length; i++) {
    const others = platforms.filter((_, j) => j !== i);
    const row = others.map(name => platformResults[name] || 'not_scheduled');
    mdLines.push(`| If ${platforms[i]} fails → | ${row.join(' | ')} |`);
  }

  mdLines.push('');
  mdLines.push('## Notes');
  mdLines.push('');
  mdLines.push('- Each platform executes independently.');
  mdLines.push('- If a platform is unavailable, it is skipped with a logged reason.');
  mdLines.push('- Platform failures never abort the entire pipeline.');
  mdLines.push(`- Execution strategy: **${EXECUTION_STRATEGY}**.`);
  mdLines.push('- Android and iOS execute in PARALLEL during Phase 4.');
  mdLines.push(`- Platform execution order: API → PERFORMANCE → WEB → MOBILE (ANDROID || IOS) → AI Analysis → Dashboard`);
  mdLines.push('');
  mdLines.push('---');
  mdLines.push('*Generated by enterpriseExecutionPipeline.js*');

  return mdLines.join('\n');
}

// ─── Main Pipeline Orchestrator ───────────────────────────────────────────

async function orchestrate(options = {}) {
  // ── AI Agent Monitor: Emit execution lifecycle events ──
  let eventBus = null;
  try { eventBus = require("../core/EventBus"); } catch (_) {}
  if (eventBus) {
    eventBus.emit("ExecutionStarted", {
      executionId: process.env.EXECUTION_ID || Date.now().toString(36),
      platform: "ALL",
      strategy: EXECUTION_STRATEGY,
      timestamp: TIMESTAMP
    });
  }

  const startTime = Date.now();
  const allResults = [];

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        ENTERPRISE EXECUTION PIPELINE                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Started: ${TIMESTAMP}`);
  console.log(`  Strategy: ${EXECUTION_STRATEGY}`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │  EXECUTION HIERARCHY                                    │');
  console.log('  │  Phase 1: API (sequential)                             │');
  console.log('  │  Phase 2: PERFORMANCE - JMeter (sequential)            │');
  console.log('  │  Phase 3: WEB - Playwright (sequential)                │');
  console.log('  │  Phase 4: MOBILE - ANDROID + iOS (PARALLEL)            │');
  console.log('  │  Phase 5: AI Analysis & Reporting                      │');
  console.log('  │  Phase 6: Consolidated Dashboard                       │');
  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  Platform Independence: Each platform runs independently.');
  console.log('  A single platform failure NEVER aborts the entire execution.');
  console.log('');

  // ── Phase 1: Sequential Platforms (API, PERFORMANCE, WEB) ─────────────

  console.log('═'.repeat(60));
  console.log('  PHASE 1-3: SEQUENTIAL PLATFORM EXECUTION');
  console.log('═'.repeat(60));

  for (const platformDef of SEQUENTIAL_PLATFORMS) {
    executePlatform(platformDef, allResults, PLATFORM_TIMEOUT);
  }

  // ── Phase 4: Mobile Platforms (ANDROID + IOS in PARALLEL) ─────────────

  console.log('═'.repeat(60));
  console.log('  PHASE 4: MOBILE AUTOMATION (ANDROID + iOS IN PARALLEL)');
  console.log('═'.repeat(60));

  await executePlatformsParallel(MOBILE_PLATFORMS, allResults);

  // ── Phase 5: AI Analysis & Reporting ──────────────────────────────────

  console.log('═'.repeat(60));
  console.log('  PHASE 5: AI ANALYSIS & REPORTING');
  console.log('═'.repeat(60));

  for (const reportDef of REPORTING_PLATFORMS) {
    executePlatform(reportDef, allResults, PLATFORM_TIMEOUT);
  }

  // ── Phase 6: Pipeline Report & Dashboard Data ─────────────────────────

  console.log('═'.repeat(60));
  console.log('  PHASE 6: PIPELINE REPORT & CONSOLIDATED DASHBOARD');
  console.log('═'.repeat(60));

  const pipelineReport = generatePipelineReport(allResults);
  fs.ensureDirSync(DASHBOARD_DIR);
  const reportPath = path.join(DASHBOARD_DIR, 'enterprise-pipeline-report.md');
  fs.writeFileSync(reportPath, pipelineReport, 'utf8');
  console.log(`  ✅ Pipeline report: ${reportPath}`);

  const dashboardData = generateDashboardData(allResults);
  const dataPath = path.join(DASHBOARD_DIR, 'enterprise-dashboard-data.json');
  fs.writeJsonSync(dataPath, dashboardData, { spaces: 2 });
  console.log(`  ✅ Dashboard data: ${dataPath}`);

  // ── Generate Enterprise Dashboard HTML ────────────────────────────────

  try {
    const dashResult = generateEnterpriseDashboard();
    if (dashResult && dashResult.htmlPath) {
      console.log(`  ✅ Enterprise Dashboard: ${dashResult.htmlPath}`);

      const dashPlatform = allResults.find(r => r.platform === 'DASHBOARD');
      if (dashPlatform) {
        const dashHtmlPath = path.join(DASHBOARD_DIR, 'enterprise-dashboard.html');
        dashPlatform.reportPaths['Enterprise Dashboard'] = {
          path: 'reports/dashboard/enterprise-dashboard.html',
          exists: fs.existsSync(dashHtmlPath),
          size: fs.existsSync(dashHtmlPath) ? fs.statSync(dashHtmlPath).size : 0
        };
      }
    }
  } catch (e) {
    console.warn(`  [⚠] Enterprise dashboard generation failed: ${e.message}`);
  }

  // ── Print Executive Summary ──────────────────────────────────────────

  const totalDurationMs = Date.now() - startTime;
  const completed = allResults.filter(r => r.status === 'completed').length;
  const failed = allResults.filter(r => r.status === 'failed').length;
  const skipped = allResults.filter(r => r.status === 'skipped').length;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        ENTERPRISE EXECUTION SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Total Duration: ${formatDuration(totalDurationMs)}`);
  console.log('');
  console.log(`  ${'Phase'.padEnd(10)} ${'Platform'.padEnd(20)} ${'Status'.padEnd(15)} ${'Duration'.padEnd(12)} Exit`);
  console.log(`  ${'-'.repeat(10)} ${'-'.repeat(20)} ${'-'.repeat(15)} ${'-'.repeat(12)} ${'-'.repeat(5)}`);

  const phaseMap = {
    'API': '1',
    'PERFORMANCE': '2',
    'WEB': '3',
    'ANDROID': '4',
    'IOS': '4',
    'AI_API_ANALYSIS': '5',
    'AI_CONSOLIDATED_REPORT': '5',
    'REPORT_ALL': '5',
    'DASHBOARD': '6'
  };

  for (const r of allResults) {
    const icon = r.status === 'completed' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
    const statusStr = r.status === 'completed' ? 'PASSED' : r.status === 'skipped' ? 'SKIPPED' : 'FAILED';
    const phase = phaseMap[r.platform] || '-';
    console.log(`  ${phase.padEnd(10)} ${icon} ${r.platform.padEnd(17)} ${statusStr.padEnd(15)} ${r.durationFormatted.padEnd(12)} ${r.exitCode !== null ? r.exitCode : '-'}`);
  // ── AI Agent Monitor: Emit completion lifecycle events ──
  if (eventBus) {
    eventBus.emit("ExecutionCompleted", {
      allResults,
      totalDuration: totalDurationMs,
      durationFormatted: formatDuration(totalDurationMs),
      completed,
      failed,
      skipped
    });
  }

  }

  console.log('');
  console.log(`  📊 Results: ${completed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  📄 Pipeline Report: ${reportPath}`);
  console.log(`  📊 Dashboard Data: ${dataPath}`);
  console.log('');

  // Determine exit code: non-zero only if DASHBOARD (critical step) failed
  const dashboardResult = allResults.find(r => r.platform === 'DASHBOARD');
  const criticalFailed = dashboardResult && dashboardResult.status === 'failed';

  return {
    allResults,
    dashboardData,
    reportPath,
    dataPath,
    exitCode: criticalFailed ? 1 : 0
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  if (args.includes('--strategy')) {
    const idx = args.indexOf('--strategy');
    if (idx >= 0 && idx < args.length - 1) {
      process.env.EXECUTION_STRATEGY = args[idx + 1];
    }
  }

  const result = await orchestrate(options);
  process.exit(result.exitCode);
}

// Export for programmatic use
module.exports = { orchestrate, PLATFORMS, SEQUENTIAL_PLATFORMS, MOBILE_PLATFORMS, REPORTING_PLATFORMS };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Pipeline fatal error:', err.message);
    process.exit(1);
  });
}
