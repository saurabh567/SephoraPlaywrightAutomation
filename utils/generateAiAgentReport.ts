#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
/**
 * generateAiAgentReport.js
 *
 * ENTERPRISE AI AGENT EXECUTION SUMMARY GENERATOR
 *
 * Reads the AgentMonitor trace data and generates:
 *   reports/ai/ai-agent-execution-summary.html  — Interactive enterprise HTML report
 *   reports/ai/ai-agent-execution-summary.json  — Full structured data
 *   reports/ai/ai-agent-execution-summary.md    — Clean markdown for GitHub
 *   reports/ai/ai-agent-execution-summary.csv   — Tabular data for spreadsheets
 *   reports/ai/ai-agent-execution-summary.pdf   — Printable professional PDF
 *
 * Usage:
 *   node utils/generateAiAgentReport.js
 *
 * Integration:
 *   Called automatically by runCucumberWithAi.js after execution completes.
 *   Reports are always generated to reports/ai/ directory.
 */


// ─── Paths ─────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const MONITOR_TRACE = path.join(ROOT, 'ai', 'memory', 'agent-monitor-trace.json');
const REPORTS_AI_DIR = path.join(ROOT, 'reports', 'ai');

const HTML_OUT = path.join(REPORTS_AI_DIR, 'ai-agent-execution-summary.html');
const JSON_OUT = path.join(REPORTS_AI_DIR, 'ai-agent-execution-summary.json');
const MD_OUT = path.join(REPORTS_AI_DIR, 'ai-agent-execution-summary.md');
const CSV_OUT = path.join(REPORTS_AI_DIR, 'ai-agent-execution-summary.csv');
const PDF_OUT = path.join(REPORTS_AI_DIR, 'ai-agent-execution-summary.pdf');

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     DATA LOADING                                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function loadData() {
  fs.ensureDirSync(REPORTS_AI_DIR);

  if (!fs.existsSync(MONITOR_TRACE)) {
    console.error(`[AiAgentReport] Monitor trace not found at ${MONITOR_TRACE}`);
    console.error('[AiAgentReport] Run the framework first with: HEADLESS=false npm run test:ai');
    return null;
  }

  return fs.readJsonSync(MONITOR_TRACE);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     JSON REPORT                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateJSON(data: any) {
  const report = {
    reportType: 'ai-agent-execution-summary',
    generatedAt: new Date().toISOString(),
    frameworkVersion: require(path.join(ROOT, 'package.json')).version,
    executionId: data.executionId,
    startedAt: data.startedAt,
    endedAt: data.endedAt,

    summary: data.summary,
    moduleSummary: data.moduleSummary,
    aiHealthScore: data.aiHealthScore,
    frameworkHealthScore: data.frameworkHealthScore,

    agents: data.agents,
    executionTimeline: data.executionTimeline,
    fullTimeline: data.fullTimeline,
    environment: data.environment
  };

  fs.writeJsonSync(JSON_OUT, report, { spaces: 2 });
  return report;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     MARKDOWN REPORT                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateMD(data: any) {
  const lines: any[] = [];
  const s = data.summary;

  lines.push('# AI Agent Execution Summary');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Execution ID:** ${data.executionId || 'N/A'}`);
  lines.push(`**Framework Version:** ${require(path.join(ROOT, 'package.json')).version}`);
  lines.push('');

  // ── Overview ──
  lines.push('## 📊 Execution Overview');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Registered Agents | ${s.totalAgents} |`);
  lines.push(`| Initialized | ${s.initialized} |`);
  lines.push(`| Executed | ${s.executed} |`);
  lines.push(`| Waiting | ${s.waiting} |`);
  lines.push(`| Skipped | ${s.skipped} |`);
  lines.push(`| Idle | ${s.idle} |`);
  lines.push(`| Failed | ${s.failed} |`);
  lines.push(`| Disabled | ${s.disabled} |`);
  lines.push(`| Overall Status | ${s.overallStatus} |`);
  lines.push(`| Success Rate | ${s.successRate}% |`);
  lines.push(`| Total Execution Time | ${s.totalDurationFormatted} |`);
  lines.push('');

  // ── Module Summary ──
  lines.push('## 📦 Module Summary');
  lines.push('');
  lines.push('| Module | Total | Executed | Skipped | Failed | Idle | Disabled |');
  lines.push('|--------|-------|----------|---------|--------|------|----------|');
  for (const [module, info] of (Object.entries(data.moduleSummary) as [string, any][]).sort((a, b) => b[1].total - a[1].total)) {
    lines.push(`| ${module} | ${info.total} | ${info.executed} | ${info.skipped} | ${info.failed} | ${info.idle} | ${info.disabled} |`);
  }
  lines.push('');

  // ── Health Scores ──
  lines.push('## 🏥 Health Scores');
  lines.push('');
  lines.push('| Metric | Score |');
  lines.push('|--------|-------|');
  lines.push(`| AI Health Score | ${data.aiHealthScore !== undefined ? data.aiHealthScore.toFixed(1) : 'N/A'}% |`);
  lines.push(`| Framework Health Score | ${data.frameworkHealthScore !== undefined ? data.frameworkHealthScore.toFixed(1) : 'N/A'}% |`);
  lines.push('');

  // ── Detailed Agent Table ──
  lines.push('## 📋 Detailed Agent Execution Table');
  lines.push('');
  lines.push('| Agent ID | Agent Name | Category | Module | Order | Status | Start Time | End Time | Duration | Trigger | Reason | Result | Error |');
  lines.push('|----------|------------|----------|--------|-------|--------|------------|----------|----------|---------|--------|--------|-------|');

  for (const agent of data.agents) {
    const startT = agent.startTime ? new Date(agent.startTime).toISOString().substring(11, 23) : '—';
    const endT = agent.endTime ? new Date(agent.endTime).toISOString().substring(11, 23) : '—';
    const dur = agent.durationFormatted || '—';
    const trigger = (agent.triggerCondition || '—').substring(0, 40);
    const reason = (agent.reason || '—').substring(0, 50);
    const result = agent.finalResult || agent.status || '—';
    const error = agent.exception ? (agent.exception || '').substring(0, 60) : '—';

    lines.push(`| ${agent.agentId} | ${agent.agentName} | ${agent.agentCategory} | ${agent.module} | ${agent.executionOrder} | ${agent.statusIcon} ${agent.status} | ${startT} | ${endT} | ${dur} | ${trigger} | ${reason} | ${result} | ${error} |`);
  }
  lines.push('');

  // ── Execution Timeline ──
  lines.push('## ⏱️ Execution Timeline');
  lines.push('');
  for (const t of data.executionTimeline) {
    const icon = t.status === 'COMPLETED' ? '✅' : t.status === 'FAILED' ? '❌' : t.status === 'SKIPPED' ? '⏭' : '⚡';
    lines.push(`- ${icon} **${t.agentName}** (${t.durationFormatted}) — ${t.status}`);
  }
  lines.push('');

  // ── Performance Metrics ──
  lines.push('## ⚡ Performance Metrics');
  lines.push('');
  const agentsWithDuration = data.agents.filter((a: any) => a.duration > 0);
  if (agentsWithDuration.length > 0) {
    const totalDur = agentsWithDuration.reduce((sum: any, a: any) => sum + a.duration, 0);
    const avgDur = Math.round(totalDur / agentsWithDuration.length);
    const maxDur = Math.max(...agentsWithDuration.map((a: any) => a.duration));
    const minDur = Math.min(...agentsWithDuration.map((a: any) => a.duration));

    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Agents with Duration Data | ${agentsWithDuration.length} |`);
    lines.push(`| Total Duration | ${(totalDur / 1000).toFixed(1)}s |`);
    lines.push(`| Average Duration | ${avgDur}ms |`);
    lines.push(`| Max Duration | ${maxDur}ms |`);
    lines.push(`| Min Duration | ${minDur}ms |`);
    lines.push('');

    lines.push('| Agent | Duration |');
    lines.push('|-------|----------|');
    agentsWithDuration.sort((a: any, b: any) => b.duration - a.duration).forEach((a: any) => {
      lines.push(`| ${a.agentName} | ${a.durationFormatted} |`);
    });
  }
  lines.push('');

  // ── Environment ──
  lines.push('## 🌐 Environment');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  if (data.environment) {
    for (const [key, val] of (Object.entries(data.environment) as [string, any][])) {
      lines.push(`| ${key} | ${val} |`);
    }
  }
  lines.push('');

  // ── Footer ──
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by AI Agent Monitoring System*');
  lines.push(`*AI Health Score: ${data.aiHealthScore !== undefined ? data.aiHealthScore.toFixed(1) : 'N/A'}% | Framework Health Score: ${data.frameworkHealthScore !== undefined ? data.frameworkHealthScore.toFixed(1) : 'N/A'}%*`);

  fs.writeFileSync(MD_OUT, lines.join('\n'), 'utf8');
  console.log(`  ✓ Markdown report: ${path.relative(ROOT, MD_OUT)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     CSV REPORT                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateCSV(data: any) {
  const lines: any[] = [];

  // Header
  lines.push('Agent ID,Agent Name,Category,Module,Execution Order,Status,Start Time,End Time,Duration,Trigger Condition,Reason,Result,Error');

  // Data rows
  for (const agent of data.agents) {
    const escapedName = `"${(agent.agentName || '').replace(/"/g, '""')}"`;
    const escapedReason = `"${(agent.reason || '').replace(/"/g, '""')}"`;
    const escapedTrigger = `"${(agent.triggerCondition || '').replace(/"/g, '""')}"`;
    const escapedError = `"${(agent.exception || '').replace(/"/g, '""')}"`;
    const escapedResult = `"${(agent.finalResult || agent.status || '').replace(/"/g, '""')}"`;

    lines.push([
      agent.agentId,
      escapedName,
      agent.agentCategory,
      agent.module,
      agent.executionOrder,
      agent.status,
      agent.startTime || '',
      agent.endTime || '',
      agent.durationFormatted,
      escapedTrigger,
      escapedReason,
      escapedResult,
      escapedError
    ].join(','));
  }

  fs.writeFileSync(CSV_OUT, lines.join('\n'), 'utf8');
  console.log(`  ✓ CSV report: ${path.relative(ROOT, CSV_OUT)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     HTML REPORT (Enterprise Quality)                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateHTML(data: any) {
  const s = data.summary;
  const agentsJSON = JSON.stringify(data.agents);
  const moduleJSON = JSON.stringify(data.moduleSummary);
  const timelineJSON = JSON.stringify(data.executionTimeline);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Agent Execution Summary</title>
<style>
  :root {
    --bg: #ffffff;
    --bg-card: #f8f9fa;
    --bg-hover: #e9ecef;
    --text: #212529;
    --text-secondary: #6c757d;
    --border: #dee2e6;
    --primary: #4361ee;
    --primary-light: #eef0ff;
    --success: #2ecc71;
    --danger: #e74c3c;
    --warning: #f39c12;
    --info: #3498db;
    --font: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  [data-theme="dark"] {
    --bg: #1a1a2e;
    --bg-card: #16213e;
    --bg-hover: #0f3460;
    --text: #e4e4e4;
    --text-secondary: #a0a0b0;
    --border: #2a2a4a;
    --primary: #4cc9f0;
    --primary-light: #1a1a3e;
    --success: #2ecc71;
    --danger: #e74c3c;
    --warning: #f39c12;
    --info: #3498db;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 20px;
    transition: background 0.3s, color 0.3s;
  }
  .container { max-width: 1400px; margin: 0 auto; }

  /* Header */
  .header {
    text-align: center;
    padding: 30px 20px;
    background: linear-gradient(135deg, var(--primary), #7209b7);
    color: #fff;
    border-radius: 12px;
    margin-bottom: 30px;
    position: relative;
  }
  .header h1 { font-size: 2em; font-weight: 700; margin-bottom: 8px; }
  .header p { opacity: 0.9; font-size: 1em; }
  .header .exec-id {
    position: absolute;
    top: 15px; right: 20px;
    font-size: 0.75em;
    opacity: 0.7;
    font-family: monospace;
  }
  .theme-toggle {
    position: absolute;
    top: 15px; left: 20px;
    background: rgba(255,255,255,0.2);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.3);
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8em;
  }
  .theme-toggle:hover { background: rgba(255,255,255,0.3); }

  /* Stats Cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 15px;
    margin-bottom: 30px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    text-align: center;
    transition: transform 0.2s;
  }
  .stat-card:hover { transform: translateY(-2px); }
  .stat-card .icon { font-size: 1.8em; margin-bottom: 5px; }
  .stat-card .value {
    font-size: 1.8em;
    font-weight: 700;
    color: var(--primary);
  }
  .stat-card .label {
    font-size: 0.8em;
    color: var(--text-secondary);
    margin-top: 4px;
  }
  .stat-card.success { border-left: 4px solid var(--success); }
  .stat-card.danger { border-left: 4px solid var(--danger); }
  .stat-card.warning { border-left: 4px solid var(--warning); }
  .stat-card.info { border-left: 4px solid var(--info); }
  .stat-card.primary { border-left: 4px solid var(--primary); }

  /* Health Score */
  .health-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 30px;
  }
  .health-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .health-ring {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3em;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }
  .health-ring.excellent { background: conic-gradient(var(--success) var(--pct), var(--bg-hover) var(--pct)); }
  .health-ring.good { background: conic-gradient(var(--info) var(--pct), var(--bg-hover) var(--pct)); }
  .health-ring.fair { background: conic-gradient(var(--warning) var(--pct), var(--bg-hover) var(--pct)); }
  .health-ring.poor { background: conic-gradient(var(--danger) var(--pct), var(--bg-hover) var(--pct)); }
  .health-info h3 { font-size: 1em; margin-bottom: 4px; }
  .health-info p { font-size: 0.85em; color: var(--text-secondary); }

  /* Section */
  .section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 25px;
  }
  .section h2 {
    font-size: 1.3em;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Search & Filter */
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
    flex-wrap: wrap;
    align-items: center;
  }
  .toolbar input, .toolbar select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.9em;
  }
  .toolbar input { flex: 1; min-width: 200px; }
  .toolbar .count-badge {
    background: var(--primary-light);
    color: var(--primary);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.85em;
    font-weight: 600;
  }

  /* Table */
  .table-container { overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }
  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th {
    background: var(--bg-card);
    font-weight: 600;
    color: var(--text-secondary);
    position: sticky;
    top: 0;
    cursor: pointer;
    user-select: none;
  }
  th:hover { background: var(--bg-hover); }
  tr:hover { background: var(--bg-hover); }
  tr.expandable { cursor: pointer; }
  tr.details-row { display: none; }
  tr.details-row.visible { display: table-row; }
  td.details-cell {
    padding: 15px 20px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: 600;
  }
  .status-badge.completed { background: #d4edda; color: #155724; }
  .status-badge.failed { background: #f8d7da; color: #721c24; }
  .status-badge.skipped { background: #fff3cd; color: #856404; }
  .status-badge.waiting { background: #cce5ff; color: #004085; }
  .status-badge.idle { background: #e2e3e5; color: #383d41; }
  .status-badge.disabled { background: #f5c6cb; color: #721c24; }
  .status-badge.running { background: #d1ecf1; color: #0c5460; }
  .status-badge.not_required { background: #e2e3e5; color: #383d41; }

  /* Timeline */
  .timeline {
    position: relative;
    padding-left: 30px;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border);
  }
  .timeline-item {
    position: relative;
    padding: 8px 0 8px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .timeline-item::before {
    content: '';
    position: absolute;
    left: -24px;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    transform: translateY(-50%);
    border: 2px solid var(--bg);
  }
  .timeline-item.completed::before { background: var(--success); }
  .timeline-item.failed::before { background: var(--danger); }
  .timeline-item.skipped::before { background: var(--warning); }
  .timeline-item .tl-icon { font-size: 1.1em; }
  .timeline-item .tl-name { font-weight: 600; }
  .timeline-item .tl-duration {
    font-size: 0.8em;
    color: var(--text-secondary);
  }
  .timeline-item .tl-status {
    font-size: 0.75em;
    padding: 2px 8px;
    border-radius: 8px;
  }

  /* Module bars */
  .module-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
    margin-top: 10px;
  }
  .module-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 15px;
  }
  .module-card h3 {
    font-size: 0.95em;
    margin-bottom: 10px;
    color: var(--primary);
  }
  .module-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .module-bar .seg-exec { background: var(--success); }
  .module-bar .seg-skip { background: var(--warning); }
  .module-bar .seg-fail { background: var(--danger); }
  .module-bar .seg-idle { background: var(--text-secondary); }
  .module-stat {
    display: flex;
    justify-content: space-between;
    font-size: 0.8em;
    color: var(--text-secondary);
  }

  /* Agent Cards */
  .agent-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 10px;
  }
  .agent-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    transition: transform 0.2s;
  }
  .agent-card:hover { transform: translateY(-2px); }
  .agent-card .ac-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .agent-card .ac-name {
    font-weight: 600;
    font-size: 0.9em;
  }
  .agent-card .ac-status { font-size: 1.1em; }
  .agent-card .ac-meta {
    font-size: 0.75em;
    color: var(--text-secondary);
  }
  .agent-card .ac-reason {
    font-size: 0.75em;
    color: var(--text-secondary);
    margin-top: 4px;
    font-style: italic;
  }

  /* Chart placeholder */
  .chart-bar {
    height: 20px;
    border-radius: 4px;
    background: var(--border);
    position: relative;
    overflow: hidden;
    margin: 5px 0;
  }
  .chart-bar .fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .chart-bar .fill.executed { background: var(--success); }
  .chart-bar .fill.skipped { background: var(--warning); }
  .chart-bar .fill.failed { background: var(--danger); }
  .chart-bar .fill.idle { background: var(--text-secondary); }

  .legend {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin: 10px 0;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
  }
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .health-row { grid-template-columns: 1fr; }
    .header h1 { font-size: 1.5em; }
    .header .exec-id { position: static; margin-top: 10px; }
    .theme-toggle { position: static; margin-bottom: 10px; }
    .module-grid { grid-template-columns: 1fr; }
    .agent-cards { grid-template-columns: 1fr; }
  }

  /* Print */
  @media print {
    .theme-toggle { display: none; }
    .toolbar { display: none; }
    body { padding: 0; }
    .section { break-inside: avoid; }
  }

  /* Pie chart CSS */
  .pie-chart {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    position: relative;
    margin: 0 auto;
  }
  .pie-center {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  .pie-center .pc-value {
    font-size: 1.8em;
    font-weight: 700;
    color: var(--text);
  }
  .pie-center .pc-label {
    font-size: 0.75em;
    color: var(--text-secondary);
  }
  .pie-row {
    display: flex;
    justify-content: center;
    gap: 30px;
    flex-wrap: wrap;
    margin: 20px 0;
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <button class="theme-toggle" onclick="toggleTheme()">🌓 Toggle Theme</button>
    <h1>🤖 AI Agent Execution Summary</h1>
    <p>Enterprise AI Agent Monitoring &amp; Execution Tracking System</p>
    <div class="exec-id">ID: ${data.executionId || 'N/A'}</div>
  </div>

  <!-- Stats Grid -->
  <div class="stats-grid">
    <div class="stat-card primary">
      <div class="icon">🤖</div>
      <div class="value">${s.totalAgents}</div>
      <div class="label">Total AI Agents</div>
    </div>
    <div class="stat-card success">
      <div class="icon">✅</div>
      <div class="value">${s.executed}</div>
      <div class="label">Executed</div>
    </div>
    <div class="stat-card warning">
      <div class="icon">💤</div>
      <div class="value">${s.idle}</div>
      <div class="label">Idle</div>
    </div>
    <div class="stat-card info">
      <div class="icon">⏳</div>
      <div class="value">${s.waiting}</div>
      <div class="label">Waiting</div>
    </div>
    <div class="stat-card danger">
      <div class="icon">❌</div>
      <div class="value">${s.failed}</div>
      <div class="label">Failed</div>
    </div>
    <div class="stat-card" style="border-left: 4px solid #6c757d">
      <div class="icon">🚫</div>
      <div class="value">${s.disabled}</div>
      <div class="label">Disabled</div>
    </div>
    <div class="stat-card">
      <div class="icon">⏱️</div>
      <div class="value">${s.totalDurationFormatted}</div>
      <div class="label">Total Time</div>
    </div>
    <div class="stat-card ${s.overallStatus === 'SUCCESS' ? 'success' : 'danger'}">
      <div class="icon">${s.overallStatus === 'SUCCESS' ? '✅' : '⚠️'}</div>
      <div class="value">${s.successRate}%</div>
      <div class="label">Success Rate</div>
    </div>
  </div>

  <!-- Health Scores -->
  <div class="health-row">
    <div class="health-card">
      <div class="health-ring ${data.aiHealthScore >= 80 ? 'excellent' : data.aiHealthScore >= 60 ? 'good' : data.aiHealthScore >= 40 ? 'fair' : 'poor'}" style="--pct: ${data.aiHealthScore}%">
        <span>${data.aiHealthScore !== undefined ? data.aiHealthScore.toFixed(0) : 'N/A'}%</span>
      </div>
      <div class="health-info">
        <h3>🏥 AI Health Score</h3>
        <p>${data.aiHealthScore >= 80 ? 'Excellent - All AI agents functioning optimally' : data.aiHealthScore >= 60 ? 'Good - Minor issues detected' : data.aiHealthScore >= 40 ? 'Fair - Multiple agents need attention' : 'Poor - Critical AI agent failures detected'}</p>
      </div>
    </div>
    <div class="health-card">
      <div class="health-ring ${data.frameworkHealthScore >= 80 ? 'excellent' : data.frameworkHealthScore >= 60 ? 'good' : data.frameworkHealthScore >= 40 ? 'fair' : 'poor'}" style="--pct: ${data.frameworkHealthScore}%">
        <span>${data.frameworkHealthScore !== undefined ? data.frameworkHealthScore.toFixed(0) : 'N/A'}%</span>
      </div>
      <div class="health-info">
        <h3>🏗️ Framework Health Score</h3>
        <p>${data.frameworkHealthScore >= 80 ? 'Excellent - Framework is stable and healthy' : data.frameworkHealthScore >= 60 ? 'Good - Framework operational' : data.frameworkHealthScore >= 40 ? 'Fair - Framework needs attention' : 'Poor - Framework critical issues detected'}</p>
      </div>
    </div>
  </div>

  <!-- Pie & Legend -->
  <div class="section">
    <h2>📊 Execution Distribution</h2>
    <div class="pie-row">
      <div>
        <div class="pie-chart" style="background: conic-gradient(
          var(--success) ${(s.executed/s.totalAgents)*100}%,
          var(--warning) ${(s.executed/s.totalAgents)*100}% ${((s.executed+s.skipped)/s.totalAgents)*100}%,
          var(--danger) ${((s.executed+s.skipped)/s.totalAgents)*100}% ${((s.executed+s.skipped+s.failed)/s.totalAgents)*100}%,
          var(--text-secondary) ${((s.executed+s.skipped+s.failed)/s.totalAgents)*100}% ${((s.executed+s.skipped+s.failed+s.idle)/s.totalAgents)*100}%,
          #6c757d ${((s.executed+s.skipped+s.failed+s.idle)/s.totalAgents)*100}% 100%
        )">
          <div class="pie-center">
            <div class="pc-value">${s.totalAgents}</div>
            <div class="pc-label">Total Agents</div>
          </div>
        </div>
      </div>
    </div>
    <div class="legend" style="justify-content:center">
      <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div> Executed (${s.executed})</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--warning)"></div> Skipped (${s.skipped})</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div> Failed (${s.failed})</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--text-secondary)"></div> Idle (${s.idle})</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6c757d"></div> Disabled (${s.disabled})</div>
    </div>
  </div>

  <!-- Module Summary -->
  <div class="section">
    <h2>📦 Module Wise Summary</h2>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div> Executed</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--warning)"></div> Skipped</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div> Failed</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--text-secondary)"></div> Idle</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6c757d"></div> Disabled</div>
    </div>
    <div class="module-grid" id="moduleGrid"></div>
  </div>

  <!-- Execution Timeline -->
  <div class="section">
    <h2>⏱️ Execution Timeline</h2>
    <div class="timeline" id="timeline"></div>
  </div>

  <!-- Agent Cards -->
  <div class="section">
    <h2>🃏 Agent Cards</h2>
    <div class="toolbar">
      <input type="text" id="searchInput" placeholder="🔍 Search agents by name, ID, module..." oninput="renderTable()">
      <select id="statusFilter" onchange="renderTable()">
        <option value="">All Statuses</option>
        <option value="COMPLETED">✅ Executed</option>
        <option value="FAILED">❌ Failed</option>
        <option value="SKIPPED">⏭ Skipped</option>
        <option value="IDLE">💤 Idle</option>
        <option value="DISABLED">🚫 Disabled</option>
        <option value="WAITING">⏳ Waiting</option>
        <option value="REGISTERED">📦 Registered</option>
        <option value="NOT_REQUIRED">📦 Not Required</option>
      </select>
      <select id="moduleFilter" onchange="renderTable()">
        <option value="">All Modules</option>
      </select>
      <span class="count-badge" id="agentCount"></span>
    </div>
    <div class="table-container" id="tableContainer"></div>
  </div>

  <!-- Agent Details (expandable) -->
  <div class="section">
    <h2>📋 Detailed Agent Table</h2>
    <p style="color:var(--text-secondary);font-size:0.85em;margin-bottom:10px">Click any row for full agent details. Sort by clicking column headers.</p>
    <div class="table-container">
      <table id="agentTable">
        <thead>
          <tr>
            <th onclick="sortTable(0)">Agent ID</th>
            <th onclick="sortTable(1)">Agent Name</th>
            <th onclick="sortTable(2)">Category</th>
            <th onclick="sortTable(3)">Module</th>
            <th onclick="sortTable(4)">Order</th>
            <th onclick="sortTable(5)">Status</th>
            <th onclick="sortTable(6)">Start Time</th>
            <th onclick="sortTable(7)">Duration</th>
            <th onclick="sortTable(8)">Trigger</th>
            <th onclick="sortTable(9)">Reason</th>
            <th onclick="sortTable(10)">Result</th>
            <th onclick="sortTable(11)">Error</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </div>

  <!-- Performance Metrics -->
  <div class="section">
    <h2>⚡ Performance Metrics</h2>
    <div id="performanceMetrics"></div>
  </div>

  <!-- Environment -->
  <div class="section">
    <h2>🌐 Environment</h2>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${data.environment ? (Object.entries(data.environment) as [string, any][]).map(([k, v]) =>
          `<tr><td>${k}</td><td>${v}</td></tr>`
        ).join('') : '<tr><td colspan="2">No environment data</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:0.85em">
    <p>AI Agent Execution Summary — Generated ${new Date().toISOString()}</p>
    <p>AI Health Score: ${data.aiHealthScore !== undefined ? data.aiHealthScore.toFixed(1) : 'N/A'}% | Framework Health Score: ${data.frameworkHealthScore !== undefined ? data.frameworkHealthScore.toFixed(1) : 'N/A'}%</p>
  </div>

</div>

<script>
const agents = ${agentsJSON};
const moduleData = ${moduleJSON};
const timeline = ${timelineJSON};

// ── Theme ──
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  localStorage.setItem('ai-agent-theme', current === 'dark' ? 'light' : 'dark');
}
(function() {
  const saved = localStorage.getItem('ai-agent-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

// ── Module Grid ──
function renderModules() {
  const grid = document.getElementById('moduleGrid');
  const entries = (Object.entries(moduleData) as [string, any][]).sort((a, b) => b[1].total - a[1].total);
  const totalAll = (Object.values(moduleData) as any[]).reduce((s, m) => s + m.total, 0);

  grid.innerHTML = entries.map(([name, info]) => {
    const execPct = (info.executed / info.total) * 100;
    const skipPct = (info.skipped / info.total) * 100;
    const failPct = (info.failed / info.total) * 100;
    const idlePct = (info.idle / info.total) * 100;

    return \`<div class="module-card">
      <h3>\${name}</h3>
      <div class="module-bar">
        <div class="seg-exec" style="width:\${execPct}%"></div>
        <div class="seg-skip" style="width:\${skipPct}%"></div>
        <div class="seg-fail" style="width:\${failPct}%"></div>
        <div class="seg-idle" style="width:\${idlePct}%"></div>
      </div>
      <div class="module-stat">
        <span>Total: \${info.total}</span>
        <span>✅ \${info.executed} ⏭ \${info.skipped} ❌ \${info.failed} 💤 \${info.idle}</span>
      </div>
    </div>\`;
  }).join('');
}

// ── Timeline ──
function renderTimeline() {
  const tl = document.getElementById('timeline');
  tl.innerHTML = '<div class="timeline-item"><span class="tl-icon">🚀</span><span class="tl-name">Framework Started</span></div>';

  timeline.forEach(t => {
    const cls = t.status === 'COMPLETED' ? 'completed' : t.status === 'FAILED' ? 'failed' : t.status === 'SKIPPED' ? 'skipped' : '';
    const icon = t.status === 'COMPLETED' ? '✅' : t.status === 'FAILED' ? '❌' : t.status === 'SKIPPED' ? '⏭' : '⚡';
    tl.innerHTML += \`<div class="timeline-item \${cls}">
      <span class="tl-icon">\${icon}</span>
      <span class="tl-name">\${t.agentName}</span>
      <span class="tl-duration">(\${t.durationFormatted})</span>
      <span class="tl-status">\${t.status}</span>
    </div>\`;
  });

  tl.innerHTML += '<div class="timeline-item"><span class="tl-icon">🏁</span><span class="tl-name">Execution Finished</span></div>';
}

// ── Agent Cards + Table ──
function getStatusBadge(status, icon) {
  const cls = status.toLowerCase().replace(/[^a-z]/g, '');
  return \`<span class="status-badge \${cls}">\${icon || ''} \${status}</span>\`;
}

function renderTable() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const moduleFilter = document.getElementById('moduleFilter').value;

  const filtered = agents.filter(a => {
    if (search && !a.agentName.toLowerCase().includes(search) && !a.agentId.toLowerCase().includes(search) && !a.module.toLowerCase().includes(search)) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (moduleFilter && a.module !== moduleFilter) return false;
    return true;
  });

  document.getElementById('agentCount').textContent = \`\${filtered.length} / \${agents.length} agents\`;

  const tbody = document.getElementById('tableBody');
  const cardsContainer = document.getElementById('agentCards') || (() => {
    const div = document.createElement('div');
    div.id = 'agentCards';
    div.className = 'agent-cards';
    // Insert after table container
    return div;
  })();

  // Rebuild table
  tbody.innerHTML = filtered.map((a, idx) => \`<tr class="expandable" onclick="toggleDetails('\${idx}')">
    <td><code>\${a.agentId}</code></td>
    <td><strong>\${a.agentName}</strong></td>
    <td>\${a.agentCategory}</td>
    <td>\${a.module}</td>
    <td>\${a.executionOrder}</td>
    <td>\${getStatusBadge(a.status, a.statusIcon)}</td>
    <td>\${a.startTime ? new Date(a.startTime).toISOString().substring(11,23) : '—'}</td>
    <td>\${a.durationFormatted}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">\${(a.triggerCondition || '—').substring(0,40)}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;color:var(--warning)">\${(a.reason || '—').substring(0,40)}</td>
    <td>\${a.finalResult || a.status || '—'}</td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;color:var(--danger)">\${a.exception ? (a.exception).substring(0,40) : '—'}</td>
  </tr><tr id="detail-\${idx}" class="details-row">
    <td colspan="12">
      <div class="details-cell">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          <div><strong>Agent ID:</strong> \${a.agentId}</div>
          <div><strong>Name:</strong> \${a.agentName}</div>
          <div><strong>Category:</strong> \${a.agentCategory}</div>
          <div><strong>Module:</strong> \${a.module}</div>
          <div><strong>Execution Order:</strong> \${a.executionOrder}</div>
          <div><strong>Status:</strong> \${a.statusIcon} \${a.status}</div>
          <div><strong>Start Time:</strong> \${a.startTime || 'N/A'}</div>
          <div><strong>End Time:</strong> \${a.endTime || 'N/A'}</div>
          <div><strong>Duration:</strong> \${a.durationFormatted}</div>
          <div><strong>Trigger:</strong> \${a.triggerCondition || 'N/A'}</div>
          <div><strong>Source File:</strong> \${a.sourceFile || 'N/A'}</div>
          <div><strong>Version:</strong> \${a.version || 'N/A'}</div>
          <div><strong>Lifecycle:</strong> \${a.lifecycle || 'N/A'}</div>
          <div style="grid-column:1/-1"><strong>Reason:</strong> \${a.reason || 'N/A'}</div>
          \${a.exception ? '<div style="grid-column:1/-1;color:var(--danger)"><strong>Error:</strong> ' + a.exception + '</div>' : ''}
          \${a.errorStack ? '<div style="grid-column:1/-1;font-size:0.8em;font-family:monospace;white-space:pre-wrap;color:var(--text-secondary)"><strong>Stack:</strong> ' + a.errorStack + '</div>' : ''}
        </div>
      </div>
    </td>
  </tr>\`).join('');

  // Agent cards
  const section = document.querySelector('.section:has(#tableContainer)');
  let cardsSection = document.getElementById('agentCardsSection');
  if (!cardsSection) {
    cardsSection = document.createElement('div');
    cardsSection.id = 'agentCardsSection';
    cardsSection.innerHTML = '<h2 style="font-size:1.1em;margin:15px 0 10px">🃏 Agent Cards</h2><div class="agent-cards" id="agentCardsContainer"></div>';
    section.parentNode.insertBefore(cardsSection, section.nextSibling);
  }

  const cardsContainer2 = document.getElementById('agentCardsContainer');
  cardsContainer2.innerHTML = filtered.slice(0, 100).map(a => \`<div class="agent-card" onclick="scrollToRow('\${a.agentId}')">
    <div class="ac-header">
      <span class="ac-name">\${a.agentName}</span>
      <span class="ac-status">\${a.statusIcon}</span>
    </div>
    <div class="ac-meta">\${a.module} · \${a.agentCategory}</div>
    <div style="margin-top:4px">\${getStatusBadge(a.status, '')}</div>
    <div class="ac-meta" style="margin-top:4px">\${a.durationFormatted}</div>
    \${a.reason ? '<div class="ac-reason">' + a.reason.substring(0,80) + '</div>' : ''}
  </div>\`).join('');
}

function toggleDetails(idx) {
  const row = document.getElementById('detail-' + idx);
  row.classList.toggle('visible');
}

function scrollToRow(agentId) {
  const idx = agents.findIndex(a => a.agentId === agentId);
  if (idx >= 0) {
    const rows = document.getElementById('tableBody').querySelectorAll('tr:not(.details-row)');
    if (rows[idx]) rows[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ── Sorting ──
let sortDir: any = {};
function sortTable(col) {
  const key = col;
  sortDir[key] = sortDir[key] === 'asc' ? 'desc' : 'asc';
  const dir = sortDir[key];

  agents.sort((a, b) => {
    const vals = [
      a.agentId, a.agentName, a.agentCategory, a.module,
      a.executionOrder, a.status, a.startTime || '', a.duration,
      a.triggerCondition || '', a.reason || '', a.finalResult || '', a.exception || ''
    ];
    const va = vals[col] || '';
    const vb = vals[col] || '';
    if (typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
    return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  renderTable();
}

// ── Performance Metrics ──
function renderPerformance() {
  const div = document.getElementById('performanceMetrics');
  const withDur = agents.filter(a => a.duration > 0);
  if (withDur.length === 0) {
    div.innerHTML = '<p style="color:var(--text-secondary)">No performance data available.</p>';
    return;
  }

  const total = withDur.reduce((s, a) => s + a.duration, 0);
  const avg = Math.round(total / withDur.length);
  const max = Math.max(...withDur.map(a => a.duration));
  const min = Math.min(...withDur.map(a => a.duration));

  let html = \`
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:15px">
    <div class="stat-card primary"><div class="value">\${withDur.length}</div><div class="label">Agents with Data</div></div>
    <div class="stat-card"><div class="value">\${(total/1000).toFixed(1)}s</div><div class="label">Total Duration</div></div>
    <div class="stat-card"><div class="value">\${avg}ms</div><div class="label">Average Duration</div></div>
    <div class="stat-card"><div class="value">\${max}ms</div><div class="label">Max Duration</div></div>
    <div class="stat-card"><div class="value">\${min}ms</div><div class="label">Min Duration</div></div>
  </div>
  <table>
    <thead><tr><th>Agent</th><th>Duration</th><th>Bar</th></tr></thead>
    <tbody>\`;

  withDur.sort((a, b) => b.duration - a.duration).slice(0, 20).forEach(a => {
    const pct = (a.duration / max) * 100;
    html += \`<tr>
      <td>\${a.agentName}</td>
      <td>\${a.durationFormatted}</td>
      <td><div class="chart-bar"><div class="fill executed" style="width:\${pct}%"></div></div></td>
    </tr>\`;
  });

  html += '</tbody></table>';
  div.innerHTML = html;
}

// ── Module filter population ──
function populateModuleFilter() {
  const select = document.getElementById('moduleFilter');
  const modules = [...new Set(agents.map(a => a.module))].sort();
  modules.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
}

// ── Init ──
renderModules();
renderTimeline();
populateModuleFilter();
renderTable();
renderPerformance();
</script>
</body>
</html>`;

  fs.writeFileSync(HTML_OUT, html, 'utf8');
  console.log(`  ✓ HTML report: ${path.relative(ROOT, HTML_OUT)}`);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     PDF REPORT (via HTML print)                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function generatePDF(data: any) {
  // PDF generation via HTML-to-PDF. We attempt puppeteer first,
  // then fallback to copying the HTML as a printable version.
  let pdfGenerated = false;

  try {
    // Try puppeteer
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // Read the HTML we just generated
    const htmlContent = fs.readFileSync(HTML_OUT, 'utf8');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.pdf({
      path: PDF_OUT,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
    });

    await browser.close();
    console.log(`  ✓ PDF report: ${path.relative(ROOT, PDF_OUT)}`);
    pdfGenerated = true;
  } catch (puppeteerErr: any) {
    // Puppeteer not available - try playwright
    try {
      const { chromium } = require('@playwright/test');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const htmlContent = fs.readFileSync(HTML_OUT, 'utf8');
      await page.setContent(htmlContent, { waitUntil: 'networkidle', timeout: 30000 });
      await page.pdf({
        path: PDF_OUT,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
      });
      await browser.close();
      console.log(`  ✓ PDF report (via Playwright): ${path.relative(ROOT, PDF_OUT)}`);
      pdfGenerated = true;
    } catch (pwErr: any) {
      // Neither available — copy HTML as printable version
      console.log('  ⚠ PDF generation requires puppeteer or @playwright/test');
      console.log('  ⚠ Install: npm install puppeteer or use playwright');
      console.log('  ⚠ HTML report is available for print-to-PDF manually');
    }
  }

  if (!pdfGenerated) {
    // Write a simple HTML printable version as PDF placeholder
    const htmlContent = fs.readFileSync(HTML_OUT, 'utf8');
    const printableHtml = htmlContent.replace(
      '</head>',
      `<style>@media print { body { font-size: 9pt; } .theme-toggle, .toolbar { display: none; } .section { break-inside: avoid; } }</style></head>`
    );
    fs.writeFileSync(PDF_OUT.replace('.pdf', '-printable.html'), printableHtml, 'utf8');
    console.log(`  ⚠ PDF skipped. Printable HTML: ${path.relative(ROOT, PDF_OUT.replace('.pdf', '-printable.html'))}`);
  }
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     MAIN ENTRY                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  📊 AI Agent Report Generator');
  console.log('══════════════════════════════════════════════\n');

  const data = loadData();
  if (!data) {
    console.error('[AiAgentReport] No trace data found. Has the framework been executed?');
    process.exit(1);
  }

  console.log(`  📥 Loaded trace data: ${data.agents ? data.agents.length : 0} agents`);

  // Generate all report formats
  const jsonReport = generateJSON(data);
  console.log(`  ✓ JSON report: ${path.relative(ROOT, JSON_OUT)}`);

  generateMD(data);
  generateCSV(data);
  generateHTML(data);

  // PDF
  await generatePDF(data);

  // Summary
  const s = data.summary;
  console.log('\n' + '='.repeat(60));
  console.log('  AI AGENT EXECUTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total Registered Agents : ${s.totalAgents}`);
  console.log(`  Initialized             : ${s.initialized}`);
  console.log(`  Executed                : ${s.executed}`);
  console.log(`  Waiting                 : ${s.waiting}`);
  console.log(`  Skipped                 : ${s.skipped}`);
  console.log(`  Idle                    : ${s.idle}`);
  console.log(`  Failed                  : ${s.failed}`);
  console.log(`  Disabled                : ${s.disabled}`);
  console.log(`  Overall Status          : ${s.overallStatus}`);
  console.log(`  Total Execution Time    : ${s.totalDurationFormatted}`);
  console.log(`  AI Health Score         : ${data.aiHealthScore !== undefined ? data.aiHealthScore.toFixed(1) : 'N/A'}%`);
  console.log(`  Framework Health Score  : ${data.frameworkHealthScore !== undefined ? data.frameworkHealthScore.toFixed(1) : 'N/A'}%`);
  console.log('='.repeat(60));

  console.log('\n  📁 Reports generated:');
  console.log(`     ${path.relative(ROOT, HTML_OUT)}`);
  console.log(`     ${path.relative(ROOT, JSON_OUT)}`);
  console.log(`     ${path.relative(ROOT, MD_OUT)}`);
  console.log(`     ${path.relative(ROOT, CSV_OUT)}`);
  if (fs.existsSync(PDF_OUT)) {
    console.log(`     ${path.relative(ROOT, PDF_OUT)}`);
  }
  console.log('');

  return jsonReport;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(err => {
    console.error('[AiAgentReport] Fatal:', err.message);
    process.exit(1);
  });
}

export { main, generateHTML, generateJSON, generateMD, generateCSV, generatePDF };
export default { main, generateHTML, generateJSON, generateMD, generateCSV, generatePDF };
