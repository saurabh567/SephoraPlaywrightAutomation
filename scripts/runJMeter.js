#!/usr/bin/env node

/**
 * JMeter Runner Script
 * =====================
 * Runs JMeter in Non-GUI (CLI) mode by default, generates JTL + HTML report,
 * checks thresholds, and exits with non-zero code on failure.
 *
 * ENTERPRISE POLICY:
 *   - NEVER launches JMeter GUI automatically (uses `jmeter -n`).
 *   - GUI mode ONLY when --gui flag is explicitly passed.
 *   - Fast Demo Mode defaults: USERS=1, RAMP_UP=1, DURATION=10, LOOP_COUNT=1
 *   - Completely headless — no desktop windows, no Swing components.
 *   - Automatic report generation: JTL, HTML Dashboard, Summary JSON, AI Analysis.
 *
 * Usage:
 *   node scripts/runJMeter.js                         (non-GUI, fast demo mode)
 *   node scripts/runJMeter.js --gui                    (GUI mode — explicit opt-in)
 *   node scripts/runJMeter.js --plan <path> --users N --duration N
 *
 * Environment variables (override config):
 *   JMETER_BINARY, BASE_URL, JMETER_USERS, JMETER_RAMPUP,
 *   JMETER_DURATION, JMETER_SEARCH_TERM, THRESHOLD_ERROR_PCT,
 *   THRESHOLD_RESPONSE_TIME, REPORT_DIR, JMETER_LOOP_COUNT
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// --- Configuration ---
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'performance', 'jmeter', 'config', 'jmeter.properties');
const DEFAULT_PLAN = path.join(ROOT, 'performance', 'jmeter', 'plans', 'amazon-load-test.jmx');
const JTL_DIR = path.join(ROOT, 'reports', 'jmeter', 'jtl');
const HTML_DIR = path.join(ROOT, 'reports', 'jmeter', 'html');
const SUMMARY_DIR = path.join(ROOT, 'reports', 'jmeter', 'summary');
const SUMMARY_MD_PATH = path.join(SUMMARY_DIR, 'jmeter-summary.md');
const SUMMARY_JSON_PATH = path.join(SUMMARY_DIR, 'jmeter-summary.json');

// Fast Demo Mode defaults
const DEFAULT_USERS = '1';
const DEFAULT_RAMPUP = '1';
const DEFAULT_DURATION = '10';
const DEFAULT_LOOP_COUNT = '1';

// --- Parse CLI args ---
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}
function hasFlag(flag) {
  return args.includes(flag);
}

// --- Load config from .properties file ---
function loadProperties(filePath) {
  const props = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      props[key.trim()] = rest.join('=').trim();
    }
  }
  return props;
}

const config = loadProperties(CONFIG_PATH);

// --- Resolve JMeter binary ---
function findJmeter() {
  if (process.env.JMETER_BINARY) return process.env.JMETER_BINARY;
  if (config['jmeter.binary']) return path.resolve(ROOT, config['jmeter.binary']);

  try {
    const result = execSync('which jmeter 2>/dev/null || echo ""', { encoding: 'utf-8', shell: '/bin/sh' });
    if (result.trim()) return result.trim();
  } catch (_) { /* ignore */ }

  if (process.env.JMETER_HOME) {
    const candidate = path.join(process.env.JMETER_HOME, 'bin', 'jmeter');
    if (fs.existsSync(candidate)) return candidate;
  }

  const commonPaths = [
    '/usr/local/bin/jmeter',
    '/opt/homebrew/bin/jmeter',
    '/usr/bin/jmeter',
    '/opt/jmeter/bin/jmeter',
    path.join(process.env.HOME || '', 'jmeter', 'bin', 'jmeter'),
    path.join(process.env.HOME || '', 'apache-jmeter-5.6.3', 'bin', 'jmeter'),
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// --- Resolve test plan ---
function resolveTestPlan() {
  const planArg = getArg('--plan', process.env.JMETER_PLAN);
  if (planArg && fs.existsSync(planArg)) return path.resolve(planArg);
  if (planArg && fs.existsSync(path.resolve(ROOT, planArg))) return path.resolve(ROOT, planArg);
  if (fs.existsSync(DEFAULT_PLAN)) return DEFAULT_PLAN;
  const plansDir = path.join(ROOT, 'performance', 'jmeter', 'plans');
  if (fs.existsSync(plansDir)) {
    const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.jmx'));
    if (files.length > 0) return path.join(plansDir, files[0]);
  }
  return null;
}

// --- Ensure directories exist ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- Build JMeter NON-GUI command ---
function buildCommand(jmeterBin, planPath, jtlPath) {
  const users = process.env.JMETER_USERS || getArg('--users', config['jmeter.users'] || DEFAULT_USERS);
  const rampup = process.env.JMETER_RAMPUP || getArg('--rampup', config['jmeter.rampup'] || DEFAULT_RAMPUP);
  const duration = process.env.JMETER_DURATION || getArg('--duration', config['jmeter.duration'] || DEFAULT_DURATION);
  const loopCount = process.env.JMETER_LOOP_COUNT || getArg('--loop', config['jmeter.loop'] || DEFAULT_LOOP_COUNT);
  const baseUrl = process.env.BASE_URL || config['jmeter.base.url'] || 'https://www.amazon.in';
  const searchTerm = process.env.JMETER_SEARCH_TERM || config['jmeter.search.term'] || 'laptop';
  const heap = config['jmeter.heap'] || '-Xms1g -Xmx2g';
  const locale = config['jmeter.locale'] || '-Duser.language=en -Duser.region=IN';

  // ENTERPRISE POLICY: Always use -n (non-GUI) mode.
  // GUI mode is ONLY available via the --gui flag.
  const jmeterArgs = [
    '-n',                         // non-GUI mode (required — never open Swing GUI automatically)
    '-t', planPath,               // test plan
    '-l', jtlPath,                // JTL results file
    '-e',                         // generate HTML report
    '-o', HTML_DIR,               // HTML report output
    `-JUSERS=${users}`,
    `-JRAMP_UP=${rampup}`,
    `-JDURATION=${duration}`,
    `-JLOOP_COUNT=${loopCount}`,
    `-JBASE_URL=${baseUrl}`,
    `-JSEARCH_TERM=${searchTerm}`,
    `-JTHRESHOLD_ERROR_PCT=${process.env.THRESHOLD_ERROR_PCT || config['jmeter.threshold.error.pct'] || '5'}`,
    `-JTHRESHOLD_RESPONSE_TIME=${process.env.THRESHOLD_RESPONSE_TIME || config['jmeter.threshold.avg.response.time'] || '5000'}`,
    '-f',                         // force delete previous results
  ];

  return { cmd: jmeterBin, args: jmeterArgs, env: { ...process.env, JVM_ARGS: `${heap} ${locale}` } };
}

// --- Build JMeter GUI command (explicit opt-in only) ---
function buildGuiCommand(jmeterBin, planPath) {
  const heap = config['jmeter.heap'] || '-Xms1g -Xmx2g';
  const locale = config['jmeter.locale'] || '-Duser.language=en -Duser.region=IN';

  console.log('\n⚠️  JMeter GUI mode — explicitly requested via --gui flag.');
  console.log('   Available only via: npm run perf:jmeter:gui\n');

  const jmeterArgs = [
    '-t', planPath,               // open test plan in GUI
  ];

  return { cmd: jmeterBin, args: jmeterArgs, env: { ...process.env, JVM_ARGS: `${heap} ${locale}` } };
}

// --- Parse JTL file for summary ---
function parseJtlSummary(jtlPath) {
  if (!fs.existsSync(jtlPath)) return null;

  const lines = fs.readFileSync(jtlPath, 'utf-8').trim().split('\n');
  if (lines.length < 2) return null;

  const dataLines = lines.slice(1);
  const samples = [];
  let totalSamples = 0;
  let totalErrors = 0;
  let totalTime = 0;
  let totalLatency = 0;
  let totalConnectTime = 0;
  let maxTime = 0;
  let minTime = Infinity;

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 10) continue;

    const timeElapsed = parseInt(parts[1], 10) || 0;
    const success = parts[7] === 'true';
    const latency = parseInt(parts[9], 10) || 0;
    const connectTime = parseInt(parts[19], 10) || 0;

    totalSamples++;
    if (!success) totalErrors++;
    totalTime += timeElapsed;
    totalLatency += latency;
    totalConnectTime += connectTime;
    if (timeElapsed > maxTime) maxTime = timeElapsed;
    if (timeElapsed < minTime) minTime = timeElapsed;

    samples.push({
      timestamp: parts[0],
      elapsed: timeElapsed,
      label: parts[2],
      responseCode: parts[3],
      responseMessage: parts[4],
      threadName: parts[5],
      dataType: parts[6],
      success,
      latency,
      bytes: parseInt(parts[10], 10) || 0,
      sentBytes: parseInt(parts[15], 10) || 0,
      connectTime,
    });
  }

  if (totalSamples === 0) return null;

  const avgResponseTime = Math.round(totalTime / totalSamples);
  const avgLatency = Math.round(totalLatency / totalSamples);
  const avgConnectTime = Math.round(totalConnectTime / totalSamples);
  const errorPct = parseFloat(((totalErrors / totalSamples) * 100).toFixed(2));

  const sortedTimes = samples.map(s => s.elapsed).sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
  const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

  const durationSec = (sortedTimes[sortedTimes.length - 1] - sortedTimes[0]) / 1000 || 1;
  const throughput = parseFloat((totalSamples / durationSec).toFixed(2));

  const byLabel = {};
  for (const s of samples) {
    if (!byLabel[s.label]) byLabel[s.label] = { count: 0, errors: 0, totalTime: 0, min: Infinity, max: 0 };
    byLabel[s.label].count++;
    if (!s.success) byLabel[s.label].errors++;
    byLabel[s.label].totalTime += s.elapsed;
    if (s.elapsed < byLabel[s.label].min) byLabel[s.label].min = s.elapsed;
    if (s.elapsed > byLabel[s.label].max) byLabel[s.label].max = s.elapsed;
  }
  const labels = Object.entries(byLabel).map(([name, data]) => ({
    label: name,
    samples: data.count,
    errors: data.errors,
    errorPct: parseFloat(((data.errors / data.count) * 100).toFixed(2)),
    avg: Math.round(data.totalTime / data.count),
    min: data.min === Infinity ? 0 : data.min,
    max: data.max,
  }));

  return {
    totalSamples,
    totalErrors,
    errorPct,
    avgResponseTime,
    minResponseTime: minTime === Infinity ? 0 : minTime,
    maxResponseTime: maxTime,
    avgLatency,
    avgConnectTime,
    throughput,
    percentiles: { p50, p90, p95, p99 },
    byLabel: labels,
    durationSec: Math.round(durationSec),
  };
}

// --- Write summary files ---
function writeSummary(summary, planName, thresholds) {
  const thresholdErrorPct = thresholds.errorPct;
  const thresholdResponseTime = thresholds.avgResponseTime;
  const thresholdPct90 = thresholds.pct90;

  const passed = summary.errorPct <= thresholdErrorPct &&
    summary.avgResponseTime <= thresholdResponseTime &&
    summary.percentiles.p90 <= thresholdPct90;

  const now = new Date().toISOString();

  const jsonSummary = {
    testName: 'Amazon India Performance Test',
    planName,
    timestamp: now,
    status: passed ? 'PASS' : 'FAIL',
    thresholds: {
      maxErrorPct: thresholdErrorPct,
      maxAvgResponseTimeMs: thresholdResponseTime,
      maxP90ResponseTimeMs: thresholdPct90,
    },
    results: summary,
  };
  fs.writeFileSync(SUMMARY_JSON_PATH, JSON.stringify(jsonSummary, null, 2));

  const md = [
    `# JMeter Performance Test Summary`,
    ``,
    `**Test:** Amazon India Load Test`,
    `**Plan:** ${planName}`,
    `**Timestamp:** ${now}`,
    `**Status:** ${passed ? '✅ PASS' : '❌ FAIL'}`,
    ``,
    `## Thresholds`,
    ``,
    `| Metric | Threshold | Actual | Status |`,
    `|--------|-----------|--------|--------|`,
    `| Error % | ≤ ${thresholdErrorPct}% | ${summary.errorPct}% | ${summary.errorPct <= thresholdErrorPct ? '✅' : '❌'} |`,
    `| Avg Response Time | ≤ ${thresholdResponseTime}ms | ${summary.avgResponseTime}ms | ${summary.avgResponseTime <= thresholdResponseTime ? '✅' : '❌'} |`,
    `| P90 Response Time | ≤ ${thresholdPct90}ms | ${summary.percentiles.p90}ms | ${summary.percentiles.p90 <= thresholdPct90 ? '✅' : '❌'} |`,
    ``,
    `## Overall Results`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Samples | ${summary.totalSamples} |`,
    `| Throughput | ${summary.throughput} req/sec |`,
    `| Avg Response Time | ${summary.avgResponseTime} ms |`,
    `| Min Response Time | ${summary.minResponseTime} ms |`,
    `| Max Response Time | ${summary.maxResponseTime} ms |`,
    `| Avg Latency | ${summary.avgLatency} ms |`,
    `| Avg Connect Time | ${summary.avgConnectTime} ms |`,
    `| Error % | ${summary.errorPct}% |`,
    `| Duration | ${summary.durationSec}s |`,
    ``,
    `## Percentiles`,
    ``,
    `| Percentile | Response Time (ms) |`,
    `|------------|-------------------|`,
    `| P50 | ${summary.percentiles.p50} |`,
    `| P90 | ${summary.percentiles.p90} |`,
    `| P95 | ${summary.percentiles.p95} |`,
    `| P99 | ${summary.percentiles.p99} |`,
    ``,
    `## Per-Transaction Breakdown`,
    ``,
    `| Transaction | Samples | Errors | Error% | Avg(ms) | Min(ms) | Max(ms) |`,
    `|-------------|---------|--------|--------|---------|---------|---------|`,
  ];

  for (const label of summary.byLabel) {
    md.push(`| ${label.label} | ${label.samples} | ${label.errors} | ${label.errorPct}% | ${label.avg} | ${label.min} | ${label.max} |`);
  }

  md.push(``);
  md.push(`---`);
  md.push(`*Report generated by runJMeter.js at ${now}*`);

  fs.writeFileSync(SUMMARY_MD_PATH, md.join('\n'));

  console.log(`\n📄 Summary JSON: ${SUMMARY_JSON_PATH}`);
  console.log(`📄 Summary Markdown: ${SUMMARY_MD_PATH}`);

  return passed;
}

// --- Run AI Performance Analysis ---
function runAiPerformanceAnalysis() {
  console.log('\n🤖 Running AI Performance Analysis...');
  try {
    const result = spawnSync('node', [path.join(ROOT, 'ai', 'agents', 'jmeterPerformanceAnalysisAgent.js')], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: 60000,
    });
    if (result.status === 0) {
      console.log('✅ AI Performance Analysis complete.');
    } else {
      console.warn('⚠️  AI Performance Analysis exited with code:', result.status);
    }
  } catch (e) {
    console.warn('⚠️  AI Performance Analysis error:', e.message);
  }
}

// --- Main execution ---
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     JMeter Performance Test Runner           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // ENTERPRISE POLICY CHECK: Detect --gui flag for explicit GUI mode
  const guiMode = hasFlag('--gui') || hasFlag('-g');

  // Step 1: Find JMeter
  const jmeterBin = findJmeter();
  if (!jmeterBin) {
    console.error('❌ JMeter not found.');
    console.error('   Install JMeter: https://jmeter.apache.org/download_jmeter.cgi');
    console.error('   Or set JMETER_HOME or JMETER_BINARY environment variable.');
    process.exit(1);
  }
  console.log(`✅ JMeter binary: ${jmeterBin}`);

  // Step 2: Verify JMeter works
  try {
    const versionOut = execSync(`"${jmeterBin}" --version 2>&1 || "${jmeterBin}" -v 2>&1`, { encoding: 'utf-8', timeout: 15000 });
    const versionLine = versionOut.split('\n').find(l => l.includes('Apache JMeter'));
    console.log(`✅ ${versionLine ? versionLine.trim() : 'JMeter detected'}`);
  } catch (e) {
    console.error(`❌ JMeter not executable: ${e.message}`);
    process.exit(1);
  }

  // Step 3: Resolve test plan
  const planPath = resolveTestPlan();
  if (!planPath) {
    console.error('❌ No JMeter test plan (.jmx) found.');
    console.error(`   Place plans in performance/jmeter/plans/ or pass --plan <path>`);
    process.exit(1);
  }
  console.log(`✅ Test plan: ${planPath}`);

  // Step 4: GUI mode (explicit opt-in only)
  if (guiMode) {
    console.log('⚠️  Launching JMeter GUI (explicitly requested via --gui flag)...');
    const { cmd, args: guiArgs, env: guiEnv } = buildGuiCommand(jmeterBin, planPath);
    console.log(`$ ${cmd} ${guiArgs.join(' ')}`);
    const result = spawnSync(cmd, guiArgs.slice(1), {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'inherit',
      shell: true,
      env: guiEnv,
    });
    process.exit(result.status || 0);
  }

  // Step 5: Prepare directories
  ensureDir(JTL_DIR);
  ensureDir(HTML_DIR);
  ensureDir(SUMMARY_DIR);

  const planName = path.basename(planPath, '.jmx');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jtlPath = path.join(JTL_DIR, `${planName}-${timestamp}.jtl`);

  // Step 6: Build and run JMeter command (non-GUI mode)
  const users = process.env.JMETER_USERS || getArg('--users', config['jmeter.users'] || DEFAULT_USERS);
  const rampup = process.env.JMETER_RAMPUP || getArg('--rampup', config['jmeter.rampup'] || DEFAULT_RAMPUP);
  const duration = process.env.JMETER_DURATION || getArg('--duration', config['jmeter.duration'] || DEFAULT_DURATION);

  const { cmd, args: jmeterArgs } = buildCommand(jmeterBin, planPath, jtlPath);
  console.log(`\n🚀 Starting JMeter load test (NON-GUI mode)...`);
  console.log(`   Plan: ${planName}`);
  console.log(`   Users: ${users}`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   Ramp-up: ${rampup}s`);
  console.log(`   JTL: ${jtlPath}`);
  console.log(`   HTML: ${HTML_DIR}`);
  console.log('');

  console.log(`$ ${cmd} ${jmeterArgs.join(' ')}`);
  console.log('');

  const startTime = Date.now();

  const result = spawnSync(cmd, jmeterArgs, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'inherit',
    shell: true,
    timeout: 3600000,
    env: { ...process.env, JVM_ARGS: `${config['jmeter.heap'] || '-Xms1g -Xmx2g'} ${config['jmeter.locale'] || '-Duser.language=en -Duser.region=IN'}` },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.error) {
    console.error(`\n❌ JMeter process error: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`\n✅ JMeter test completed in ${elapsed}s (exit code: ${result.status})`);

  // Step 7: Parse and summarize
  console.log(`\n📊 Analyzing results...`);
  const summary = parseJtlSummary(jtlPath);

  if (!summary) {
    console.error('❌ Failed to parse JTL results file. Check that JMeter generated output.');
    process.exit(1);
  }

  const thresholdErrorPct = parseFloat(process.env.THRESHOLD_ERROR_PCT || config['jmeter.threshold.error.pct'] || '5');
  const thresholdResponseTime = parseFloat(process.env.THRESHOLD_RESPONSE_TIME || config['jmeter.threshold.avg.response.time'] || '5000');
  const thresholdPct90 = parseFloat(config['jmeter.threshold.pct.response.time'] || '8000');

  const passed = writeSummary(summary, planName, {
    errorPct: thresholdErrorPct,
    avgResponseTime: thresholdResponseTime,
    pct90: thresholdPct90,
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║     Test Status: ${passed ? '✅ PASS' : '❌ FAIL'}                     ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Step 8: Run AI Performance Analysis automatically
  runAiPerformanceAnalysis();

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
