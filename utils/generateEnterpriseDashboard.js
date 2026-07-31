#!/usr/bin/env node
/**
 * generateEnterpriseDashboard.js
 *
 * Enterprise Dashboard Generator — collects ALL platform results and
 * generates a single comprehensive dashboard with platform-by-platform
 * status, execution order, pass/fail/skip counts, and AI analysis.
 *
 * This replaces the previous generateDashboard.js which only collected WEB results.
 *
 * Sources:
 *   - API:  reports/api/api-summary.json, reports/api/cucumber-report.json
 *   - WEB:  reports/web/cucumber-report.json
 *   - ANDROID: reports/android/cucumber-report.json, reports/android/environment.properties
 *   - IOS:  reports/ios/cucumber-report.json, reports/ios/environment.properties
 *   - PERFORMANCE: reports/jmeter/summary/jmeter-summary.json
 *   - AI:   ai/output/*, reports/ai/*
 *   - Pipeline: reports/dashboard/enterprise-pipeline-report.md
 *
 * Usage:
 *   node utils/generateEnterpriseDashboard.js
 *   npm run dashboard:enterprise
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = process.cwd();
const DASHBOARD_DIR = path.join(ROOT, 'reports', 'dashboard');

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeReadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function safeReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch { /* ignore */ }
  return '';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Platform Data Collectors ──────────────────────────────────────────────

function collectWebData() {
  const report = safeReadJSON(path.join(ROOT, 'reports/web/cucumber-report.json'));
  if (!report) return null;

  let total = 0, passed = 0, failed = 0, skipped = 0, durationMs = 0;
  const features = [];

  for (const feature of report) {
    const featScenarios = [];
    for (const el of (feature.elements || [])) {
      total++;
      const status = el.steps.some(s => s.result?.status === 'failed') ? 'failed'
        : el.steps.every(s => s.result?.status === 'passed') ? 'passed' : 'skipped';
      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else skipped++;
      const dur = el.steps.reduce((s, st) => s + (st.result?.duration || 0), 0);
      durationMs += dur;
      featScenarios.push({ name: el.name, status, duration: Math.round(dur / 1e6) });
    }
    features.push({
      name: feature.name,
      scenarios: featScenarios,
      passed: featScenarios.filter(s => s.status === 'passed').length,
      failed: featScenarios.filter(s => s.status === 'failed').length,
      total: featScenarios.length
    });
  }

  return {
    total, passed, failed, skipped,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    durationMs: Math.round(durationMs / 1e6),
    features
  };
}

function collectAPIData() {
  const summary = safeReadJSON(path.join(ROOT, 'reports/api/api-summary.json'));
  if (summary && summary.totalAPIs > 0) {
    return {
      totalAPIs: summary.totalAPIs,
      passed: summary.passed,
      failed: summary.failed,
      passRate: summary.passRate,
      avgResponseTime: summary.avgResponseTime,
      executionDuration: summary.executionDuration
    };
  }
  return null;
}

function collectMobileData(platform) {
  const dir = platform === 'ANDROID' ? 'android' : 'ios';
  const envFile = path.join(ROOT, `reports/${dir}/environment.properties`);
  const env = {};
  const content = safeReadFile(envFile);
  content.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return Object.keys(env).length > 0 ? env : null;
}

function collectPerformanceData() {
  const summaryDir = path.join(ROOT, 'reports/jmeter/summary');
  if (fs.existsSync(summaryDir)) {
    const files = fs.readdirSync(summaryDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const data = safeReadJSON(path.join(summaryDir, f));
      if (data) return data;
    }
  }
  return null;
}

function collectPipelineData() {
  return safeReadJSON(path.join(DASHBOARD_DIR, 'enterprise-dashboard-data.json'));
}

// ─── HTML Template ─────────────────────────────────────────────────────────

function generateDashboardHTML(platforms) {
  const pipelineData = collectPipelineData();

  const platformRows = platforms.map(p => {
    const statusIcon = p.status === 'completed' ? '✅' : p.status === 'skipped' ? '⏭️' : p.status === 'failed' ? '❌' : p.status === 'scheduled' ? '⏳' : '❓';
    const statusClass = p.status === 'completed' ? 'pass' : p.status === 'skipped' ? 'skip' : 'fail';
    return `<tr class="${statusClass}">
      <td>${statusIcon} ${escHtml(p.name)}</td>
      <td>${p.status}</td>
      <td>${p.duration || '-'}</td>
      <td>${p.exitCode !== null && p.exitCode !== undefined ? p.exitCode : '-'}</td>
      <td>${escHtml(p.skippedReason || p.errorMessage || '-')}</td>
      <td>${p.startedAt ? new Date(p.startedAt).toLocaleTimeString() : '-'}</td>
    </tr>`;
  }).join('\n');

  const summary = pipelineData?.summary || { totalPlatforms: 0, completed: 0, failed: 0, skipped: 0, passRate: 0, totalDurationFormatted: '0s' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Enterprise Execution Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  .container { max-width: 1400px; margin: 0 auto; }
  h1 { font-size: 28px; color: #38bdf8; margin-bottom: 8px; }
  h2 { font-size: 20px; color: #94a3b8; margin: 30px 0 15px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
  .subtitle { color: #64748b; font-size: 14px; margin-bottom: 30px; }
  .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
  .card { background: #1e293b; border-radius: 10px; padding: 20px; text-align: center; border: 1px solid #334155; }
  .card-value { font-size: 36px; font-weight: 700; }
  .card-label { font-size: 12px; color: #94a3b8; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
  .card.pass .card-value { color: #22c55e; }
  .card.fail .card-value { color: #ef4444; }
  .card.skip .card-value { color: #eab308; }
  .card.total .card-value { color: #38bdf8; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
  th { background: #334155; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 12px 15px; text-align: left; }
  td { padding: 12px 15px; border-bottom: 1px solid #2d3a50; font-size: 14px; }
  tr.pass td:first-child { border-left: 3px solid #22c55e; }
  tr.fail td:first-child { border-left: 3px solid #ef4444; }
  tr.skip td:first-child { border-left: 3px solid #eab308; }
  tr:hover { background: #243044; }
  .execution-order { background: #1e293b; border-radius: 10px; padding: 20px; border: 1px solid #334155; margin-top: 20px; }
  .step { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #2d3a50; }
  .step:last-child { border-bottom: none; }
  .step-icon { width: 30px; text-align: center; font-size: 16px; }
  .step-name { flex: 1; }
  .platform-data { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-top: 20px; }
  .platform-card { background: #1e293b; border-radius: 10px; padding: 20px; border: 1px solid #334155; }
  .platform-card h3 { font-size: 16px; margin-bottom: 10px; }
  .platform-card .data-item { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .platform-card .data-item .label { color: #94a3b8; }
  .notes { background: #1e293b; border-radius: 10px; padding: 20px; border: 1px solid #334155; margin-top: 20px; }
  .notes li { margin: 6px 0; font-size: 13px; color: #94a3b8; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.pass { background: #166534; color: #86efac; }
  .badge.fail { background: #7f1d1d; color: #fca5a5; }
  .badge.skip { background: #713f12; color: #fde047; }
</style>
</head>
<body>
<div class="container">
  <h1>🏢 Enterprise Execution Dashboard</h1>
  <p class="subtitle">Generated: ${new Date().toISOString()} | Strategy: ${pipelineData?.executionStrategy || 'sequential'}</p>

  <div class="summary-cards">
    <div class="card total"><div class="card-value">${summary.totalPlatforms}</div><div class="card-label">Total Platforms</div></div>
    <div class="card pass"><div class="card-value">${summary.completed}</div><div class="card-label">Passed ✅</div></div>
    <div class="card fail"><div class="card-value">${summary.failed}</div><div class="card-label">Failed ❌</div></div>
    <div class="card skip"><div class="card-value">${summary.skipped}</div><div class="card-label">Skipped ⏭️</div></div>
    <div class="card pass"><div class="card-value">${summary.passRate}%</div><div class="card-label">Pass Rate</div></div>
    <div class="card total"><div class="card-value">${summary.totalDurationFormatted}</div><div class="card-label">Total Duration</div></div>
  </div>

  <h2>📋 Platform Results</h2>
  <table>
    <thead><tr><th>Platform</th><th>Status</th><th>Duration</th><th>Exit Code</th><th>Reason</th><th>Started</th></tr></thead>
    <tbody>${platformRows}</tbody>
  </table>

  <h2>🔷 Execution Order</h2>
  <div class="execution-order">
    ${['API', 'WEB', 'ANDROID', 'IOS', 'PERFORMANCE', 'AI Analysis', 'Dashboard'].map((step, i) => {
      const p = platforms.find(s => s.name === step || s.name === step.toUpperCase());
      const icon = p ? (p.status === 'completed' ? '✅' : p.status === 'skipped' ? '⏭️' : '❌') : '⏳';
      return `<div class="step"><span class="step-icon">${i + 1}.</span><span class="step-name">${icon} ${step}</span><span class="badge ${p ? (p.status === 'completed' ? 'pass' : p.status === 'skipped' ? 'skip' : 'fail') : 'skip'}">${p ? p.status : 'pending'}</span></div>`;
    }).join('\n    ')}
  </div>

  <h2>📊 Platform-Specific Data</h2>
  <div class="platform-data">
    ${['API', 'WEB', 'ANDROID', 'IOS', 'PERFORMANCE'].map(name => {
      const p = platforms.find(s => s.name === name);
      return `<div class="platform-card">
        <h3>${name === 'ANDROID' ? '🤖' : name === 'IOS' ? '📱' : name === 'API' ? '🔌' : name === 'WEB' ? '🌐' : '⚡'} ${name}</h3>
        <div class="data-item"><span class="label">Status</span><span>${p ? p.status : 'not_scheduled'}</span></div>
        <div class="data-item"><span class="label">Duration</span><span>${p ? p.duration : '-'}</span></div>
        <div class="data-item"><span class="label">Exit Code</span><span>${p && p.exitCode !== null ? p.exitCode : '-'}</span></div>
        ${p && p.skippedReason ? `<div class="data-item"><span class="label">Reason</span><span>${escHtml(p.skippedReason)}</span></div>` : ''}
        ${p && p.errorMessage ? `<div class="data-item"><span class="label">Error</span><span>${escHtml(p.errorMessage)}</span></div>` : ''}
      </div>`;
    }).join('\n    ')}
  </div>

  <h2>ℹ️ Execution Notes</h2>
  <div class="notes">
    <ul>
      <li>✅ Each platform executes <strong>independently</strong> — one failure never blocks others</li>
      <li>⏭️ Unavailable platforms are <strong>skipped</strong> with a logged reason (not failed)</li>
      <li>🔷 Execution order: ${['API', 'WEB', 'ANDROID', 'IOS', 'PERFORMANCE', 'AI Analysis', 'Dashboard'].join(' → ')}</li>
      <li>🚀 Run command: <code>npm run test:all:ai</code></li>
    </ul>
  </div>
</div>
</body>
</html>`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('═'.repeat(60));
  console.log('  Enterprise Dashboard Generator');
  console.log('═'.repeat(60));

  fs.ensureDirSync(DASHBOARD_DIR);

  // Collect pipeline data first
  const pipelineData = collectPipelineData();
  const platforms = pipelineData?.platforms || [];

  // If no pipeline data, try collecting individual platform data
  if (platforms.length === 0) {
    console.log('  [⚠] No pipeline data found — collecting individual platform data');

    const webData = collectWebData();
    const apiData = collectAPIData();
    const androidData = collectMobileData('ANDROID');
    const iosData = collectMobileData('IOS');
    const perfData = collectPerformanceData();

    const platformList = [
      { name: 'API', status: apiData ? 'completed' : 'skipped', duration: apiData?.executionDuration || '-', exitCode: apiData ? 0 : null, skippedReason: apiData ? null : 'No API data found' },
      { name: 'WEB', status: webData ? 'completed' : 'skipped', duration: webData ? `${(webData.durationMs / 1000).toFixed(1)}s` : '-', exitCode: webData ? 0 : null, skippedReason: webData ? null : 'No Web data found' },
      { name: 'ANDROID', status: androidData ? 'completed' : 'skipped', duration: '-', exitCode: androidData ? 0 : null, skippedReason: androidData ? null : 'No Android data found' },
      { name: 'IOS', status: iosData ? 'completed' : 'skipped', duration: '-', exitCode: iosData ? 0 : null, skippedReason: iosData ? null : 'No iOS data found' },
      { name: 'PERFORMANCE', status: perfData ? 'completed' : 'skipped', duration: '-', exitCode: perfData ? 0 : null, skippedReason: perfData ? null : 'No Performance data found' }
    ];

    // Generate HTML
    const html = generateDashboardHTML(platformList);
    const htmlPath = path.join(DASHBOARD_DIR, 'enterprise-dashboard.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`  ✅ Dashboard: ${htmlPath}`);
    return { htmlPath };
  }

  // Generate HTML from pipeline data
  const html = generateDashboardHTML(platforms);
  const htmlPath = path.join(DASHBOARD_DIR, 'enterprise-dashboard.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  ✅ Enterprise Dashboard: ${htmlPath}`);
  console.log(`  📊 Platforms tracked: ${platforms.length}`);

  // Generate data JSON for programmatic use
  const dataPath = path.join(DASHBOARD_DIR, 'enterprise-dashboard-data.json');
  if (pipelineData) {
    fs.writeJsonSync(dataPath, pipelineData, { spaces: 2 });
  }

  return { htmlPath, dataPath };
}

// Run if CLI
if (require.main === module) {
  try {
    const result = main();
    console.log('\n  ✅ Enterprise Dashboard generated successfully');
    process.exit(0);
  } catch (err) {
    console.error('\n  ❌ Dashboard generation failed:', err.message);
    process.exit(1);
  }
}

module.exports = { main, generateDashboardHTML, collectWebData, collectAPIData, collectMobileData, collectPerformanceData };
