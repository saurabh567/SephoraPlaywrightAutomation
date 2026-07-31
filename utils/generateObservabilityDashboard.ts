#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
/**
 * generateObservabilityDashboard.js
 *
 * Enterprise observability dashboard generator.
 * Creates a single self-contained HTML dashboard showing:
 *
 *   Execution Flow | Agent Timeline | Execution Graph | Playwright Command
 *   Worker Distribution | CPU | Memory | Failures | Healing | Retries
 *   Execution Heatmap | AI Decisions | Agent Health | Platform Health
 *
 * Reads from AgentRegistry, AgentLifecycleManager, AgentPerformanceMetrics,
 * AgentHealthTracker, ExecutionContext, PlaywrightExecutionEngine manifests,
 * and EventBus history.
 *
 * Output: reports/ai/observability/index.html (self-contained, no external deps)
 *         reports/ai/observability/data.json (raw data for external tools)
 *
 * Usage:
 *   node utils/generateObservabilityDashboard.js
 *   npm run obs:dashboard
 */


const ROOT = process.cwd();
const OBS_DIR = path.join(ROOT, 'reports', 'ai', 'observability');
const HTML_OUT = path.join(OBS_DIR, 'index.html');
const JSON_OUT = path.join(OBS_DIR, 'data.json');

async function main() {
  console.log('[ObservabilityDashboard] Generating enterprise observability dashboard...');

  // ─── Load all data sources ──────────────────────────────────────────
  const registry = require('../ai/core/AgentRegistry');
  await registry.discover();

  const lifecycleManager = require('../ai/core/AgentLifecycleManager');
  await lifecycleManager.initializeFromRegistry(registry);

  const performanceMetrics = require('../ai/core/AgentPerformanceMetrics');
  await performanceMetrics.initialize();
  await performanceMetrics.syncFromLifecycle(lifecycleManager);

  const ctx = require('../ai/core/ExecutionContext');

  let healthData: Record<string, any> = {};
  try {
    const hp = path.join(ROOT, 'ai', 'memory', 'agent-health.json');
    if (fs.existsSync(hp)) healthData = JSON.parse(fs.readFileSync(hp, 'utf8'));
  } catch {}

  let execManifest: Record<string, any> = {};
  try {
    const mp = path.join(ROOT, 'reports', 'playwright-cli', 'execution-manifest.json');
    if (fs.existsSync(mp)) execManifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  } catch {}

  let ingestionData: Record<string, any> = {};
  try {
    const ip = path.join(ROOT, 'reports', 'ingestion', 'artifact-index.json');
    if (fs.existsSync(ip)) ingestionData = JSON.parse(fs.readFileSync(ip, 'utf8'));
  } catch {}

  // ─── Gather metrics ─────────────────────────────────────────────────
  const allAgents = registry.getAll();
  const lifecycleEntries = lifecycleManager.getAll();
  const perfSummary = performanceMetrics.getSummary();
  const healthAgents = healthData.agents || {};

  // Agent state counts
  const stateCounts = lifecycleManager.getStateCounts();

  // Build agent detail array
  const agentDetails = allAgents.map((a: any) => {
    const key = a.key;
    const lc = lifecycleEntries.find((e: any) => e.key === key);
    const perf = perfSummary.agents?.find((p: any) => p.key === key);
    const health = healthAgents[key];

    return {
      key, name: a.metadata.name || key,
      stage: a.metadata.executionStage || 'unknown',
      priority: a.metadata.priority || 50,
      platforms: a.metadata.platforms || [],
      lifecycle: a.metadata.lifecycle || 'active',
      state: lc ? lc.state : 'REGISTERED',
      totalRuns: lc ? lc.totalRuns || 0 : 0,
      successCount: lc ? lc.successCount || 0 : 0,
      failureCount: lc ? lc.failureCount || 0 : 0,
      skipCount: lc ? lc.skipCount || 0 : 0,
      recoveryCount: lc ? lc.recoveryCount || 0 : 0,
      lastDuration: lc ? lc.lastDuration || 0 : 0,
      stateHistory: lc ? (lc.stateHistory || []).slice(-20) : [] as any[],
      // Perf
      meanDuration: perf ? perf.meanDuration : 0,
      perfSuccessRate: perf ? perf.successRate : 0,
      perfSkipRate: perf ? perf.skipRate : 0,
      perfRecoveryRate: perf ? perf.recoveryRate : 0,
      perfTrend: perf ? perf.trend : 'no-data',
      // Health
      healthStatus: health ? health.health : 'unknown',
      healthLastStatus: health ? health.lastStatus : 'never'
    };
  });

  // Platform health
  const platformHealth: Record<string, any> = {};
  for (const agent of agentDetails) {
    for (const p of agent.platforms) {
      if (!platformHealth[p]) platformHealth[p] = { total: 0, executed: 0, failed: 0, healthy: 0 };
      platformHealth[p].total++;
      if (agent.totalRuns > 0) platformHealth[p].executed++;
      if (agent.failureCount > 0) platformHealth[p].failed++;
      if (agent.healthStatus === 'healthy') platformHealth[p].healthy++;
    }
  }

  // Stage breakdown for timeline
  const stageOrder = ['preflight', 'execution', 'analysis', 'multi-agent', 'reporting', 'cleanup'];
  const stageData: Record<string, any> = {};
  for (const stage of stageOrder) {
    const agents = agentDetails.filter((a: any) => a.stage === stage);
    stageData[stage] = {
      count: agents.length,
      executed: agents.filter((a: any) => a.totalRuns > 0).length,
      failed: agents.filter((a: any) => a.failureCount > 0).length,
      avgDuration: agents.length > 0
        ? Math.round(agents.reduce((s: any, a: any) => s + a.meanDuration, 0) / agents.length)
        : 0,
      agents: agents.map((a: any) => a.key)
    };
  }

  // Build timeline from state histories
  const timeline: any[] = [];
  for (const agent of agentDetails) {
    for (const h of agent.stateHistory) {
      timeline.push({
        agent: agent.key,
        name: agent.name,
        stage: agent.stage,
        from: h.from,
        to: h.to,
        at: h.at,
        reason: h.reason || null
      });
    }
  }
  timeline.sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // ─── Build data JSON ────────────────────────────────────────────────
  const data = {
    generatedAt: new Date().toISOString(),
    executionId: ctx.executionId,
    summary: {
      totalAgents: allAgents.length,
      totalReachable: allAgents.filter((a: any) => a.metadata.lifecycle === 'active').length,
      totalExecutions: perfSummary.totalExecutions,
      totalDuration: perfSummary.totalDurationFormatted,
      overallSuccessRate: perfSummary.overallSuccessRate,
      totalFailures: perfSummary.totalFailures,
      agentStateCounts: stateCounts,
      platformHealth,
      stageData
    },
    execManifest: {
      exitCode: execManifest.exitCode,
      duration: execManifest.durationFormatted,
      passed: execManifest.passed,
      failed: execManifest.failed,
      skipped: execManifest.skipped,
      workers: execManifest.workers,
      retries: execManifest.retries,
      profile: execManifest.profile,
      platform: execManifest.platform,
      config: execManifest.config
    },
    ingestionData: {
      totalArtifacts: ingestionData.totalArtifacts || 0,
      traces: ingestionData.traces || 0,
      videos: ingestionData.videos || 0,
      screenshots: ingestionData.screenshots || 0,
      jsonReports: ingestionData.jsonReports || 0,
      htmlReports: ingestionData.htmlReports || 0,
      cucumberReports: ingestionData.cucumberReports || 0
    },
    agents: agentDetails,
    perfSummary,
    performanceTrends: perfSummary.agents?.filter((a: any) => a.trend && a.trend !== 'no-data') || [],
    timeline: timeline.slice(-100),
    degradingAgents: performanceMetrics.getDegradingAgents()
  };

  fs.ensureDirSync(OBS_DIR);
  fs.writeJsonSync(JSON_OUT, data, { spaces: 2 });

  // ─── Generate HTML ──────────────────────────────────────────────────
  const dataJson = JSON.stringify(data);
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Enterprise Observability Dashboard</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--text-muted:#8b949e;
--green:#3fb950;--red:#f85149;--yellow:#d29922;--blue:#58a6ff;--purple:#bc8cff;--cyan:#39d2c0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:var(--bg);color:var(--text);padding:20px}
h1{font-size:22px;margin-bottom:4px}
.subtitle{color:var(--text-muted);font-size:13px;margin-bottom:20px}
.grid{display:grid;gap:12px;margin-bottom:16px}
.grid-6{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.grid-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.grid-3{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.grid-2{grid-template-columns:repeat(auto-fit,minmax(380px,1fr))}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
.card h2{font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.value{font-size:28px;font-weight:600}
.value.green{color:var(--green)}.value.red{color:var(--red)}.value.yellow{color:var(--yellow)}
.value.blue{color:var(--blue)}.value.purple{color:var(--purple)}.value.cyan{color:var(--cyan)}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)}
th{color:var(--text-muted);font-size:10px;text-transform:uppercase}
tr:hover td{background:rgba(255,255,255,.03)}
.state{display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px}
.state-COMPLETED,.state-completed{background:rgba(63,185,80,.15);color:var(--green)}
.state-FAILED,.state-failed{background:rgba(248,81,73,.15);color:var(--red)}
.state-RUNNING,.state-running{background:rgba(88,166,255,.15);color:var(--blue)}
.state-SKIPPED,.state-skipped{background:rgba(210,153,34,.15);color:var(--yellow)}
.state-DISABLED,.state-disabled{background:rgba(139,148,158,.15);color:var(--text-muted)}
.state-REGISTERED{background:rgba(188,140,255,.15);color:var(--purple)}
.bar-container{display:flex;align-items:center;margin:4px 0;gap:8px}
.bar-label{width:140px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}
.bar-track{flex:1;height:16px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;transition:width .3s}
.bar-val{width:50px;text-align:right;font-size:10px;color:var(--text-muted);flex-shrink:0}
.heatmap{display:grid;grid-template-columns:repeat(auto-fill,minmax(12px,1fr));gap:2px;margin-top:8px}
.heat-cell{aspect-ratio:1;border-radius:2px;min-width:8px;min-height:8px}
.timeline{position:relative;padding-left:20px;margin-top:8px}
.timeline::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--border)}
.tl-item{position:relative;padding:4px 0 4px 16px;font-size:11px;border-left:2px solid transparent}
.tl-item::before{content:'';position:absolute;left:-14px;top:8px;width:8px;height:8px;border-radius:50%;background:var(--blue)}
.tl-item.completed::before{background:var(--green)}
.tl-item.failed::before{background:var(--red)}
.tl-item.skipped::before{background:var(--yellow)}
.tl-time{color:var(--text-muted);font-size:10px}
.chart-row{display:flex;align-items:flex-end;gap:4px;height:80px;margin-top:8px}
.chart-bar{flex:1;display:flex;flex-direction:column;align-items:center}
.chart-fill{width:100%;max-width:30px;border-radius:3px 3px 0 0;min-height:2px}
.chart-label{font-size:9px;color:var(--text-muted);margin-top:2px}
.flex{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.tag{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;background:rgba(255,255,255,.05);margin:2px}
.refresh{color:var(--blue);cursor:pointer;font-size:12px;text-decoration:none;float:right}
</style></head><body>

<script>
const DATA = ${dataJson};

function render() {
  const d = DATA;

  // Header
  document.title = 'Observability — ' + d.summary.totalAgents + ' agents';
  document.getElementById('header').innerHTML =
    '<h1> Enterprise Observability Dashboard</h1>' +
    '<div class="subtitle">' + d.summary.totalAgents + ' agents · ' +
    d.summary.totalExecutions + ' executions · ' +
    (d.execManifest.duration ? 'Last run: ' + d.execManifest.duration : 'No recent run') +
    ' · ' + new Date(d.generatedAt).toLocaleString() + '</div>';

  // Summary cards
  document.getElementById('summaryCards').innerHTML = [
    ['Total Agents', d.summary.totalAgents, 'blue'],
    ['Executions', d.summary.totalExecutions, 'cyan'],
    ['Success Rate', d.summary.overallSuccessRate + '%', 'green'],
    ['Failures', d.summary.totalFailures, d.summary.totalFailures > 0 ? 'red' : 'green'],
    ['Passed', d.execManifest.passed || 0, 'green'],
    ['Failed', d.execManifest.failed || 0, d.execManifest.failed > 0 ? 'red' : 'green'],
    ['Workers', d.execManifest.workers || 0, 'blue'],
    ['Retries', d.execManifest.retries || 0, 'yellow'],
    ['Traces', d.ingestionData.traces || 0, 'purple'],
    ['Screenshots', d.ingestionData.screenshots || 0, 'yellow']
  ].map(([label, val, color]) =>
    '<div class="card"><div class="value ' + color + '">' + val + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + label + '</div></div>'
  ).join('');

  // Agent state distribution
  const states = d.summary.agentStateCounts || {};
  const stateColors = {COMPLETED:'#3fb950',FAILED:'#f85149',RUNNING:'#58a6ff',SKIPPED:'#d29922',
    REGISTERED:'#bc8cff',DISABLED:'#8b949e',WAITING:'#39d2c0',ELIGIBLE:'#d4760c',RECOVERED:'#f778ba',INITIALIZED:'#58a6ff'};
  const maxState = Math.max(...(Object.values(states) as any[]).filter(v=>typeof v==='number'), 1);
  document.getElementById('stateChart').innerHTML = '<div class="chart-row">' +
    (Object.entries(states) as [string, any][]).filter(([,c]) => c > 0).map(([s,c]) =>
      '<div class="chart-bar"><div class="chart-fill" style="height:' + Math.max(2, (c/maxState)*70) + 'px;background:' + (stateColors[s]||'#8b949e') + '"></div><div class="chart-label">' + s.substring(0,4) + '<br>' + c + '</div></div>'
    ).join('') + '</div>';

  // Stage breakdown
  const stages = d.summary.stageData || {};
  document.getElementById('stageTable').innerHTML = '<table><tr><th>Stage</th><th>Count</th><th>Executed</th><th>Failed</th><th>Avg Duration</th></tr>' +
    (Object.entries(stages) as [string, any][]).map(([s, v]) =>
      '<tr><td>' + s + '</td><td>' + v.count + '</td><td>' + v.executed + '</td><td>' + v.failed + '</td><td>' + v.avgDuration + 'ms</td></tr>'
    ).join('') + '</table>';

  // Platform health
  const ph = d.summary.platformHealth || {};
  document.getElementById('platformTable').innerHTML = '<table><tr><th>Platform</th><th>Total</th><th>Executed</th><th>Failed</th><th>Healthy</th></tr>' +
    (Object.entries(ph) as [string, any][]).map(([p, v]) =>
      '<tr><td>' + p + '</td><td>' + v.total + '</td><td>' + v.executed + '</td><td>' + v.failed + '</td><td>' + v.healthy + '</td></tr>'
    ).join('') + '</table>';

  // Execution timeline
  const tl = d.timeline || [];
  document.getElementById('timeline').innerHTML = tl.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No timeline events</div>' :
    '<div class="timeline">' + tl.slice(-30).map(t => {
      const cls = t.to === 'COMPLETED' ? 'completed' : t.to === 'FAILED' ? 'failed' : t.to === 'SKIPPED' ? 'skipped' : '';
      const time = t.at ? new Date(t.at).toISOString().substring(11,19) : '--:--:--';
      return '<div class="tl-item ' + cls + '"><span class="tl-time">' + time + '</span> <strong>' + t.agent + '</strong> ' + t.from + ' → ' + t.to +
        (t.reason ? ' <span style="color:var(--yellow)">(' + t.reason + ')</span>' : '') + '</div>';
    }).join('') + '</div>';

  // Agent table
  const agents = d.agents || [];
  document.getElementById('agentTable').innerHTML = '<table><tr><th>Agent</th><th>Stage</th><th>State</th><th>Runs</th><th>Success</th><th>Fail</th><th>Skip</th><th>Recover</th><th>Duration</th><th>Success%</th><th>Trend</th><th>Health</th></tr>' +
    agents.sort((a,b) => b.totalRuns - a.totalRuns).slice(0, 100).map(a =>
      '<tr><td>' + a.key + '</td><td>' + a.stage + '</td>' +
      '<td><span class="state state-' + a.state + '">' + a.state + '</span></td>' +
      '<td>' + a.totalRuns + '</td><td>' + a.successCount + '</td><td>' + a.failureCount + '</td>' +
      '<td>' + a.skipCount + '</td><td>' + a.recoveryCount + '</td>' +
      '<td>' + a.meanDuration + 'ms</td>' +
      '<td>' + (a.perfSuccessRate || '—') + '</td>' +
      '<td><span style="color:' +
        (a.perfTrend === 'improving' ? 'var(--green)' : a.perfTrend === 'degrading' ? 'var(--red)' : 'var(--text-muted)') +
        '">' + a.perfTrend + '</span></td>' +
      '<td><span style="color:' +
        (a.healthStatus === 'healthy' ? 'var(--green)' : a.healthStatus === 'degraded' ? 'var(--yellow)' : 'var(--text-muted)') +
        '">' + a.healthStatus + '</span></td></tr>'
    ).join('') + '</table>';

  // CPU chart (mock from perf data)
  const cpus = agents.filter(a => a.meanDuration > 0).slice(0, 15);
  const maxCpu = Math.max(...cpus.map(a => a.meanDuration), 1);
  document.getElementById('cpuChart').innerHTML = cpus.length === 0 ? '<div style="color:var(--text-muted)">No CPU data</div>' :
    cpus.map(a => '<div class="bar-container"><div class="bar-label">' + a.key + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, (a.meanDuration/maxCpu)*100) + '%;background:var(--blue)"></div></div><div class="bar-val">' + a.meanDuration + 'ms</div></div>').join('');

  // Failures chart
  const fails = agents.filter(a => a.failureCount > 0).sort((a,b) => b.failureCount - a.failureCount).slice(0, 10);
  const maxFail = Math.max(...fails.map(a => a.failureCount), 1);
  document.getElementById('failChart').innerHTML = fails.length === 0 ? '<div style="color:var(--text-muted)">No failures</div>' :
    fails.map(a => '<div class="bar-container"><div class="bar-label">' + a.key + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, (a.failureCount/maxFail)*100) + '%;background:var(--red)"></div></div><div class="bar-val">' + a.failureCount + '</div></div>').join('');

  // Healing/retries chart
  const recovers = agents.filter(a => a.recoveryCount > 0).sort((a,b) => b.recoveryCount - a.recoveryCount).slice(0, 10);
  const maxRec = Math.max(...recovers.map(a => a.recoveryCount), 1);
  document.getElementById('healChart').innerHTML = recovers.length === 0 ? '<div style="color:var(--text-muted)">No recoveries</div>' :
    recovers.map(a => '<div class="bar-container"><div class="bar-label">' + a.key + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, (a.recoveryCount/maxRec)*100) + '%;background:var(--purple)"></div></div><div class="bar-val">' + a.recoveryCount + '</div></div>').join('');

  // Worker distribution
  const workers = d.execManifest.workers || 0;
  document.getElementById('workerDist').innerHTML =
    '<div style="text-align:center;padding:16px"><div class="value blue">' + workers + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted)">Parallel Workers</div>' +
    '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Profile: ' + (d.execManifest.profile || '—') +
    ' | Retries: ' + (d.execManifest.retries || 0) + '</div></div>';

  // Execution heatmap (mock — from agent durations)
  const heatAgents = agents.filter(a => a.meanDuration > 0).slice(0, 60);
  const maxDur = Math.max(...heatAgents.map(a => a.meanDuration), 1);
  const heatColors = ['#0d4429','#006d32','#3fb950','#56d364','#7ee787'];
  document.getElementById('heatmap').innerHTML = heatAgents.length === 0 ? '<div style="color:var(--text-muted)">No data</div>' :
    '<div class="heatmap">' + heatAgents.map(a => {
      const intensity = Math.min(4, Math.floor((a.meanDuration / maxDur) * 5));
      return '<div class="heat-cell" style="background:' + heatColors[intensity] + '" title="' + a.key + ': ' + a.meanDuration + 'ms"></div>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:4px;margin-top:6px;justify-content:center">' +
    heatColors.map((c, i) => '<div style="display:flex;align-items:center;gap:2px;font-size:9px;color:var(--text-muted)"><div style="width:10px;height:10px;border-radius:2px;background:' + c + '"></div>' + (i+1) + '</div>').join('') + '</div>';

  // AI Decisions
  const decisions = agents.filter(a => a.state === 'COMPLETED' || a.state === 'FAILED' || a.state === 'SKIPPED').length;
  document.getElementById('aiDecisions').innerHTML =
    '<div style="text-align:center;padding:12px"><div class="value purple">' + decisions + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted)">Agents with Decisions</div></div>';

  // Performance trends
  const trends = d.performanceTrends || [];
  const trendCounts: Record<string, any> = {};
  trends.forEach(t => { trendCounts[t.trend] = (trendCounts[t.trend] || 0) + 1; });
  document.getElementById('trendTable').innerHTML = '<table><tr><th>Trend</th><th>Count</th></tr>' +
    (Object.entries(trendCounts) as [string, any][]).map(([k, v]) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>').join('') + '</table>';

  // Degrading agents
  const degrading = d.degradingAgents || [];
  document.getElementById('degrading').innerHTML = degrading.length === 0 ? '<div style="color:var(--text-muted);font-size:12px">No degrading agents</div>' :
    '<table><tr><th>Agent</th><th>Mean Duration</th><th>Success Rate</th></tr>' +
    degrading.map(a => '<tr><td>' + a.key + '</td><td>' + a.meanDuration + 'ms</td><td>' + a.successRate + '%</td></tr>').join('') + '</table>';

  // Playwright Command
  document.getElementById('pwCommand').innerHTML = d.execManifest.config ?
    '<div style="padding:8px;background:rgba(255,255,255,.03);border-radius:4px;font-family:monospace;font-size:11px;word-break:break-all">' +
    'npx playwright test --profile ' + (d.execManifest.profile || '—') +
    ' --workers ' + (d.execManifest.workers || '—') +
    ' --retries ' + (d.execManifest.retries || '—') +
    (d.execManifest.platform ? ' --platform ' + d.execManifest.platform : '') +
    '</div>' : '<div style="color:var(--text-muted);font-size:12px">No command data</div>';
}

document.addEventListener('DOMContentLoaded', render);
</script>

<div id="header"></div>
<div class="grid grid-6" id="summaryCards"></div>

<div class="grid grid-2">
  <div class="card"><h2>Agent State Distribution</h2><div id="stateChart"></div></div>
  <div class="card"><h2>Execution Timeline</h2><div id="timeline"></div></div>
</div>

<div class="grid grid-3">
  <div class="card"><h2>Stage Breakdown</h2><div id="stageTable"></div></div>
  <div class="card"><h2>Platform Health</h2><div id="platformTable"></div></div>
  <div class="card"><h2>Worker Distribution</h2><div id="workerDist"></div></div>
</div>

<div class="grid grid-2">
  <div class="card"><h2>Execution Duration (Top 15)</h2><div id="cpuChart"></div></div>
  <div class="card"><h2>Execution Heatmap</h2><div id="heatmap"></div></div>
</div>

<div class="grid grid-3">
  <div class="card"><h2>Failures</h2><div id="failChart"></div></div>
  <div class="card"><h2>Healing / Recoveries</h2><div id="healChart"></div></div>
  <div class="card"><h2>AI Decisions</h2><div id="aiDecisions"></div></div>
</div>

<div class="grid grid-2">
  <div class="card"><h2>Playwright CLI Command</h2><div id="pwCommand"></div></div>
  <div class="card"><h2>Performance Trends</h2><div id="trendTable"></div></div>
</div>

<div class="card"><h2>Agent Health & Performance <span style="font-weight:400;color:var(--text-muted);font-size:11px">— sorted by total runs</span></h2>
  <div style="overflow-x:auto" id="agentTable"></div>
</div>

<div class="card"><h2>Degrading Agents</h2><div id="degrading"></div></div>

<div style="text-align:center;padding:16px;font-size:11px;color:var(--text-muted)">
  Enterprise Observability Dashboard · Generated ' + new Date().toISOString().substring(0, 10) + ' · AI-Powered Playwright Framework
</div>

</body></html>`;

  fs.ensureDirSync(OBS_DIR);
  fs.writeFileSync(HTML_OUT, html, 'utf8');

  console.log('[ObservabilityDashboard] Generated:');
  console.log('  ' + HTML_OUT + ' (' + fs.statSync(HTML_OUT).size + ' bytes)');
  console.log('  ' + JSON_OUT + ' (' + fs.statSync(JSON_OUT).size + ' bytes)');
  console.log('[ObservabilityDashboard] Done.');
}

main().catch(err => {
  console.error('[ObservabilityDashboard] Fatal:', err.message);
  process.exit(1);
});
