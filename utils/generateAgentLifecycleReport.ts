#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
/**
 * generateAgentLifecycleReport.js
 *
 * Generates three lifecycle reports from AgentLifecycleManager data:
 *   reports/ai/agent-lifecycle.json  — Full structured data
 *   reports/ai/agent-lifecycle.md    — Markdown summary
 *   reports/ai/agent-lifecycle.html  — Visual HTML dashboard
 *
 * Displays:
 *   Execution Timeline, Agent Dependencies, Execution Order,
 *   Skipped Agents, Failure Chain, Recovery Chain, Retry Chain,
 *   Execution Duration, Memory Usage, CPU Usage, Output Files, Exit Status
 *
 * Usage:
 *   node utils/generateAgentLifecycleReport.js
 *   npm run lifecycle:report
 */


// ─── Paths ─────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const LIFECYCLE_STORE = path.join(ROOT, 'ai', 'memory', 'agent-lifecycle.json');
const STORE_DIR = path.join(ROOT, 'ai', 'memory');
const REPORTS_AI_DIR = path.join(ROOT, 'reports', 'ai');
const JSON_OUT = path.join(REPORTS_AI_DIR, 'agent-lifecycle.json');
const MD_OUT = path.join(REPORTS_AI_DIR, 'agent-lifecycle.md');
const HTML_OUT = path.join(REPORTS_AI_DIR, 'agent-lifecycle.html');

// ─── Load Data ─────────────────────────────────────────────────────────────
function loadData() {
  const lifecycleData = fs.existsSync(LIFECYCLE_STORE)
    ? fs.readJsonSync(LIFECYCLE_STORE)
    : { agents: {} as Record<string, any>, updatedAt: new Date().toISOString(), executionId: null };

  // Try to also load execution context data
  let execContext: Record<string, any> = {};
  const contextFiles = [
    path.join(ROOT, 'ai', 'memory', 'execution-context.json'),
    path.join(ROOT, 'reports', 'ai', 'orchestrator-telemetry.json'),
    path.join(ROOT, 'reports', 'playwright-cli', 'execution-manifest.json')
  ];
  for (const f of contextFiles) {
    if (fs.existsSync(f)) {
      try { execContext = { ...execContext, ...fs.readJsonSync(f) }; } catch {}
    }
  }

  return { lifecycleData, execContext };
}

// ─── Analysis ──────────────────────────────────────────────────────────────

function analyzeAgents(lifecycleData: any, execContext: any) {
  const agents = (Object.values(lifecycleData.agents || {}) as any[]);
  const byState: Record<string, any> = {};
  const byStage: Record<string, any> = {};
  const byHealth: Record<string, any> = {};
  const failures: any[] = [];
  const recoveries: any[] = [];
  const retries: any[] = [];
  const skipped: any[] = [];
  const completed: any[] = [];
  const timeline: any[] = [];

  for (const agent of agents) {
    // By state
    const st = agent.state || 'REGISTERED';
    byState[st] = (byState[st] || 0) + 1;

    // By stage
    const stage = agent.stage || 'unknown';
    byStage[stage] = (byStage[stage] || 0) + 1;

    // By health
    const health = agent.health || 'unknown';
    byHealth[health] = (byHealth[health] || 0) + 1;

    // Categories
    if (st === 'FAILED' || agent.consecutiveFailures > 0) {
      failures.push(agent);
    }
    if (agent.recoveryCount > 0) {
      recoveries.push(agent);
    }
    if (agent.totalRuns > 1 || agent.stateHistory.filter((h: any) => h.from === 'FAILED' || h.to === 'RUNNING').length > 1) {
      retries.push(agent);
    }
    if (st === 'SKIPPED' || agent.skipCount > 0) {
      skipped.push(agent);
    }
    if (st === 'COMPLETED') {
      completed.push(agent);
    }

    // Timeline: build from state history
    if (agent.stateHistory && agent.stateHistory.length > 0) {
      for (const h of agent.stateHistory) {
        timeline.push({
          agent: agent.key,
          name: agent.name,
          from: h.from,
          to: h.to,
          at: h.at,
          duration: agent.lastDuration,
          stage: agent.stage,
          priority: agent.priority,
          health: agent.health,
          error: agent.lastError
        });
      }
    }
  }

  // Sort timeline chronologically
  timeline.sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Build dependency chains
  const depChains: Record<string, any> = {};
  for (const agent of agents) {
    if (agent.dependencies && agent.dependencies.length > 0) {
      depChains[agent.key] = agent.dependencies.map((d: any) => {
        const dep = lifecycleData.agents[d];
        return { key: d, state: dep ? dep.state : 'unknown', health: dep ? dep.health : 'unknown' };
      });
    }
  }

  return {
    agents,
    byState,
    byStage,
    byHealth,
    failures: failures.sort((a, b) => (b.consecutiveFailures || 0) - (a.consecutiveFailures || 0)),
    recoveries: recoveries.sort((a, b) => (b.recoveryCount || 0) - (a.recoveryCount || 0)),
    retries: retries.sort((a, b) => (b.totalRuns || 0) - (a.totalRuns || 0)),
    skipped: skipped.sort((a, b) => (b.skipCount || 0) - (a.skipCount || 0)),
    completed,
    timeline,
    depChains,
    totalAgents: agents.length,
    updatedAt: lifecycleData.updatedAt || new Date().toISOString(),
    executionId: lifecycleData.executionId || execContext.executionId || null
  };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     JSON REPORT                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateJSON(analysis: any) {
  const report = {
    reportType: 'agent-lifecycle',
    generatedAt: new Date().toISOString(),
    executionId: analysis.executionId,
    summary: {
      totalAgents: analysis.totalAgents,
      stateDistribution: analysis.byState,
      stageDistribution: analysis.byStage,
      healthDistribution: analysis.byHealth,
      totalFailures: analysis.failures.length,
      totalRecoveries: analysis.recoveries.length,
      totalRetries: analysis.retries.length,
      totalSkipped: analysis.skipped.length,
      totalCompleted: analysis.completed.length
    },
    agents: analysis.agents.map((a: any) => ({
      key: a.key,
      name: a.name,
      state: a.state,
      previousState: a.previousState,
      stage: a.stage,
      priority: a.priority,
      health: a.health,
      successRate: a.successRate,
      totalRuns: a.totalRuns,
      successCount: a.successCount,
      failureCount: a.failureCount,
      skipCount: a.skipCount,
      recoveryCount: a.recoveryCount,
      consecutiveFailures: a.consecutiveFailures,
      lastDuration: a.lastDuration,
      lastError: a.lastError,
      lastRunningAt: a.lastRunningAt,
      lastCompletedAt: a.lastCompletedAt,
      lastFailedAt: a.lastFailedAt,
      lastSkippedAt: a.lastSkippedAt,
      lastRecoveredAt: a.lastRecoveredAt,
      dependencies: a.dependencies,
      platforms: a.platforms,
      tags: a.tags,
      lifecycle: a.lifecycle,
      stateHistory: (a.stateHistory || []).slice(-20)
    })),
    failureChain: analysis.failures.map((a: any) => ({
      key: a.key,
      consecutiveFailures: a.consecutiveFailures,
      lastError: a.lastError,
      lastFailedAt: a.lastFailedAt,
      health: a.health
    })),
    recoveryChain: analysis.recoveries.map((a: any) => ({
      key: a.key,
      recoveryCount: a.recoveryCount,
      lastRecoveredAt: a.lastRecoveredAt
    })),
    retryChain: analysis.retries.map((a: any) => ({
      key: a.key,
      totalRuns: a.totalRuns,
      successCount: a.successCount,
      failureCount: a.failureCount
    })),
    skippedAgents: analysis.skipped.map((a: any) => ({
      key: a.key,
      skipCount: a.skipCount,
      lastError: a.lastError,
      lastSkippedAt: a.lastSkippedAt
    })),
    executionTimeline: analysis.timeline,
    dependencyChains: analysis.depChains,
    executionOrder: analysis.timeline
      .filter((t: any) => t.to === 'RUNNING' || t.to === 'COMPLETED' || t.to === 'FAILED')
      .map((t: any) => ({ agent: t.agent, name: t.name, action: t.to, at: t.at, duration: t.duration }))
  };

  fs.ensureDirSync(REPORTS_AI_DIR);
  fs.writeJsonSync(JSON_OUT, report, { spaces: 2 });
  return report;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     MARKDOWN REPORT                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateMD(analysis: any, jsonReport: any) {
  const lines: any[] = [];

  lines.push('# Agent Lifecycle Report');
  lines.push('');
  lines.push('**Generated:** ' + new Date().toISOString());
  if (analysis.executionId) lines.push('**Execution ID:** ' + analysis.executionId);
  lines.push('');

  // ── Summary ──
  lines.push('## Execution Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push('| Total Agents | ' + analysis.totalAgents + ' |');
  lines.push('| Completed | ' + (analysis.byState['COMPLETED'] || 0) + ' |');
  lines.push('| Failed | ' + (analysis.byState['FAILED'] || 0) + ' |');
  lines.push('| Skipped | ' + (analysis.byState['SKIPPED'] || 0) + ' |');
  lines.push('| Running | ' + (analysis.byState['RUNNING'] || 0) + ' |');
  lines.push('| Disabled | ' + (analysis.byState['DISABLED'] || 0) + ' |');
  lines.push('| Registered | ' + (analysis.byState['REGISTERED'] || 0) + ' |');
  lines.push('| Recovered | ' + analysis.recoveries.length + ' |');
  lines.push('| Retries | ' + analysis.retries.length + ' |');
  lines.push('| Failure Chain | ' + analysis.failures.length + ' agents |');
  lines.push('');

  // ── State Distribution ──
  lines.push('## State Distribution');
  lines.push('');
  lines.push('| State | Count |');
  lines.push('|-------|-------|');
  for (const [state, count] of (Object.entries(analysis.byState) as [string, any][]).sort((a, b) => b[1] - a[1])) {
    lines.push('| ' + state + ' | ' + count + ' |');
  }
  lines.push('');

  // ── Health Distribution ──
  lines.push('## Health Distribution');
  lines.push('');
  lines.push('| Health | Count |');
  lines.push('|--------|-------|');
  for (const [health, count] of (Object.entries(analysis.byHealth) as [string, any][]).sort((a, b) => b[1] - a[1])) {
    lines.push('| ' + health + ' | ' + count + ' |');
  }
  lines.push('');

  // ── Stage Distribution ──
  lines.push('## Stage Distribution');
  lines.push('');
  lines.push('| Stage | Count |');
  lines.push('|-------|-------|');
  for (const [stage, count] of (Object.entries(analysis.byStage) as [string, any][]).sort((a, b) => b[1] - a[1])) {
    lines.push('| ' + stage + ' | ' + count + ' |');
  }
  lines.push('');

  // ── Execution Timeline ──
  lines.push('## Execution Timeline');
  lines.push('');
  lines.push('| Time | Agent | Transition | Duration |');
  lines.push('|------|-------|------------|----------|');
  const last20 = analysis.timeline.slice(-20);
  for (const t of last20) {
    const time = t.at ? new Date(t.at).toISOString().substring(11, 19) : '—';
    const dur = t.duration ? (t.duration + 'ms') : '—';
    lines.push('| ' + time + ' | ' + t.agent + ' | ' + t.from + ' → ' + t.to + ' | ' + dur + ' |');
  }
  lines.push('');

  // ── Execution Order ──
  lines.push('## Execution Order');
  lines.push('');
  const execOrder = analysis.timeline.filter((t: any) => t.to === 'RUNNING' || t.to === 'COMPLETED');
  if (execOrder.length > 0) {
    lines.push('| # | Agent | Stage | Status | Duration |');
    lines.push('|---|-------|-------|--------|----------|');
    execOrder.forEach((t: any, i: any) => {
      const status = t.to === 'COMPLETED' ? '✅' : '🔄';
      const dur = t.duration ? (t.duration + 'ms') : '—';
      lines.push('| ' + (i + 1) + ' | ' + t.agent + ' | ' + (t.stage || '—') + ' | ' + status + ' | ' + dur + ' |');
    });
  } else {
    lines.push('_No execution data available._');
  }
  lines.push('');

  // ── Agent Dependencies ──
  lines.push('## Agent Dependencies');
  lines.push('');
  const deps = (Object.entries(analysis.depChains) as [string, any][]);
  if (deps.length > 0) {
    for (const [agent, dependencies] of deps) {
      const depList = dependencies.map((d: any) => d.key + ' (' + d.state + ')').join(', ');
      lines.push('- **' + agent + '** → ' + (depList || '_none_'));
    }
  } else {
    lines.push('_No dependency data available._');
  }
  lines.push('');

  // ── Failure Chain ──
  lines.push('## Failure Chain');
  lines.push('');
  if (analysis.failures.length > 0) {
    lines.push('| Agent | Failures | Last Error | Last Failed |');
    lines.push('|-------|----------|------------|-------------|');
    for (const f of analysis.failures) {
      const err = f.lastError ? f.lastError.substring(0, 80) : '—';
      const failedAt = f.lastFailedAt ? new Date(f.lastFailedAt).toISOString().substring(11, 19) : '—';
      lines.push('| ' + f.key + ' | ' + (f.consecutiveFailures || 0) + ' | ' + err + ' | ' + failedAt + ' |');
    }
  } else {
    lines.push('_No failures detected._');
  }
  lines.push('');

  // ── Recovery Chain ──
  lines.push('## Recovery Chain');
  lines.push('');
  if (analysis.recoveries.length > 0) {
    for (const r of analysis.recoveries) {
      lines.push('- **' + r.key + '**: ' + r.recoveryCount + ' recoveries, last at ' + (r.lastRecoveredAt || '—'));
    }
  } else {
    lines.push('_No recoveries recorded._');
  }
  lines.push('');

  // ── Retry Chain ──
  lines.push('## Retry Chain');
  lines.push('');
  if (analysis.retries.length > 0) {
    lines.push('| Agent | Total Runs | Success | Failures |');
    lines.push('|-------|------------|---------|----------|');
    for (const r of analysis.retries) {
      lines.push('| ' + r.key + ' | ' + (r.totalRuns || 0) + ' | ' + (r.successCount || 0) + ' | ' + (r.failureCount || 0) + ' |');
    }
  } else {
    lines.push('_No retries recorded._');
  }
  lines.push('');

  // ── Skipped Agents ──
  lines.push('## Skipped Agents');
  lines.push('');
  if (analysis.skipped.length > 0) {
    lines.push('| Agent | Skip Count | Reason |');
    lines.push('|-------|------------|--------|');
    for (const s of analysis.skipped) {
      const reason = s.lastError ? s.lastError.substring(0, 80) : '—';
      lines.push('| ' + s.key + ' | ' + (s.skipCount || 0) + ' | ' + reason + ' |');
    }
  } else {
    lines.push('_No agents were skipped._');
  }
  lines.push('');

  // ── Execution Duration Summary ──
  lines.push('## Execution Duration');
  lines.push('');
  const withDuration = analysis.agents.filter((a: any) => a.lastDuration > 0);
  if (withDuration.length > 0) {
    const total = withDuration.reduce((s: any, a: any) => s + a.lastDuration, 0);
    const avg = Math.round(total / withDuration.length);
    const max = Math.max(...withDuration.map((a: any) => a.lastDuration));
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push('| Total Duration | ' + total + 'ms (' + (total / 1000).toFixed(1) + 's) |');
    lines.push('| Average per Agent | ' + avg + 'ms |');
    lines.push('| Max Duration | ' + max + 'ms |');
    lines.push('| Agents with Data | ' + withDuration.length + ' |');
    lines.push('');
    lines.push('| Agent | Duration |');
    lines.push('|-------|----------|');
    withDuration.sort((a: any, b: any) => b.lastDuration - a.lastDuration).forEach((a: any) => {
      lines.push('| ' + a.key + ' | ' + a.lastDuration + 'ms |');
    });
  } else {
    lines.push('_No duration data available._');
  }
  lines.push('');

  // ── Exit Status ──
  lines.push('## Exit Status');
  lines.push('');
  const failedCount = analysis.byState['FAILED'] || 0;
  const completedCount = analysis.byState['COMPLETED'] || 0;
  const overallStatus = failedCount === 0 ? '✅ PASSED' : '❌ FAILED';
  lines.push('**Overall Status:** ' + overallStatus);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push('| Agents Completed | ' + completedCount + ' |');
  lines.push('| Agents Failed | ' + failedCount + ' |');
  lines.push('| Success Rate | ' + (completedCount + failedCount > 0 ? Math.round((completedCount / (completedCount + failedCount)) * 100) + '%' : '—') + ' |');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('_Report generated by AgentLifecycleManager_');

  fs.ensureDirSync(REPORTS_AI_DIR);
  fs.writeFileSync(MD_OUT, lines.join('\n'), 'utf8');
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     HTML REPORT                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateHTML(analysis: any, jsonReport: any) {
  const agentsJson = JSON.stringify(jsonReport.agents || []);
  const timelineJson = JSON.stringify(analysis.timeline || []);
  const depChainsJson = JSON.stringify(analysis.depChains || {});
  const stateCountsJson = JSON.stringify(analysis.byState || {});
  const healthCountsJson = JSON.stringify(analysis.byHealth || {});
  const failuresJson = JSON.stringify(analysis.failures || []);
  const recoveriesJson = JSON.stringify(analysis.recoveries || []);
  const retriesJson = JSON.stringify(analysis.retries || []);
  const skippedJson = JSON.stringify(analysis.skipped || []);
  const summaryJson = JSON.stringify({
    totalAgents: analysis.totalAgents,
    completed: analysis.byState['COMPLETED'] || 0,
    failed: analysis.byState['FAILED'] || 0,
    skipped: analysis.byState['SKIPPED'] || 0,
    running: analysis.byState['RUNNING'] || 0
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Lifecycle Dashboard</title>
<style>
  :root {
    --bg: #0d1117; --card: #161b22; --border: #30363d;
    --text: #c9d1d9; --text-muted: #8b949e;
    --green: #3fb950; --red: #f85149; --yellow: #d29922;
    --blue: #58a6ff; --purple: #bc8cff; --orange: #d4760c;
    --cyan: #39d2c0; --pink: #f778ba;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--text); padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin: 24px 0 12px; color: var(--blue); }
  .subtitle { color: var(--text-muted); margin-bottom: 24px; font-size: 13px; }
  .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-card .label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { font-size: 28px; font-weight: 600; margin-top: 4px; }
  .stat-card .value.green { color: var(--green); }
  .stat-card .value.red { color: var(--red); }
  .stat-card .value.yellow { color: var(--yellow); }
  .stat-card .value.blue { color: var(--blue); }
  .stat-card .value.purple { color: var(--purple); }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  th { color: var(--text-muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  tr:hover td { background: rgba(255,255,255,0.03); }

  .state-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
  .state-COMPLETED { background: rgba(63,185,80,0.15); color: var(--green); }
  .state-FAILED { background: rgba(248,81,73,0.15); color: var(--red); }
  .state-RUNNING { background: rgba(88,166,255,0.15); color: var(--blue); }
  .state-SKIPPED { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .state-DISABLED { background: rgba(139,148,158,0.15); color: var(--text-muted); }
  .state-REGISTERED { background: rgba(188,140,255,0.15); color: var(--purple); }
  .state-WAITING { background: rgba(57,210,192,0.15); color: var(--cyan); }
  .state-ELIGIBLE { background: rgba(212,118,12,0.15); color: var(--orange); }
  .state-RECOVERED { background: rgba(247,120,186,0.15); color: var(--pink); }
  .state-INITIALIZED { background: rgba(88,166,255,0.1); color: var(--blue); }

  .health-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .health-healthy { background: var(--green); }
  .health-degraded { background: var(--yellow); }
  .health-critical { background: var(--red); }
  .health-unknown { background: var(--text-muted); }
  .health-disabled { background: var(--border); }

  .timeline-bar { display: flex; align-items: center; margin: 4px 0; }
  .timeline-label { width: 180px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timeline-track { flex: 1; height: 20px; background: rgba(255,255,255,0.05); border-radius: 4px; position: relative; overflow: hidden; }
  .timeline-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .fill-completed { background: var(--green); }
  .fill-failed { background: var(--red); }
  .fill-running { background: var(--blue); }
  .fill-skipped { background: var(--yellow); }
  .timeline-duration { width: 70px; text-align: right; font-size: 11px; color: var(--text-muted); margin-left: 8px; }

  .bar-chart { display: flex; gap: 8px; align-items: flex-end; height: 120px; padding: 8px 0; }
  .bar { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .bar-fill { width: 100%; max-width: 40px; border-radius: 4px 4px 0 0; min-height: 4px; transition: height 0.3s; }
  .bar-label { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

  .dep-graph { display: flex; flex-wrap: wrap; gap: 8px; }
  .dep-node { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 12px; }
  .dep-node .key { font-weight: 500; }
  .dep-node .arrow { color: var(--text-muted); margin: 0 4px; }
  .dep-node .dep-state { font-size: 10px; color: var(--text-muted); }

  .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: 16px; background: transparent; color: var(--text); cursor: pointer; font-size: 12px; }
  .filter-btn:hover { background: rgba(255,255,255,0.05); }
  .filter-btn.active { border-color: var(--blue); color: var(--blue); background: rgba(88,166,255,0.1); }

  .progress-ring { width: 120px; height: 120px; margin: 0 auto; }
  .section-header { display: flex; justify-content: space-between; align-items: center; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.05); }
</style>
</head>
<body>

<h1> Agent Lifecycle Dashboard</h1>
<div class="subtitle">Execution ID: ${analysis.executionId || '—'} &nbsp;|&nbsp; Generated: ${new Date().toISOString()} &nbsp;|&nbsp; ${analysis.totalAgents} agents tracked</div>

<div class="dashboard-grid" id="summaryCards">
  <div class="stat-card"><div class="label">Total Agents</div><div class="value blue">${analysis.totalAgents}</div></div>
  <div class="stat-card"><div class="label">Completed</div><div class="value green">${analysis.byState['COMPLETED'] || 0}</div></div>
  <div class="stat-card"><div class="label">Failed</div><div class="value red">${analysis.byState['FAILED'] || 0}</div></div>
  <div class="stat-card"><div class="label">Skipped</div><div class="value yellow">${analysis.byState['SKIPPED'] || 0}</div></div>
  <div class="stat-card"><div class="label">Running</div><div class="value blue">${analysis.byState['RUNNING'] || 0}</div></div>
  <div class="stat-card"><div class="label">Recoveries</div><div class="value purple">${analysis.recoveries.length}</div></div>
</div>

<div class="card">
  <h2>State Distribution</h2>
  <div class="bar-chart" id="stateChart"></div>
</div>

<div class="card">
  <h2>Health Distribution</h2>
  <div class="bar-chart" id="healthChart"></div>
</div>

<div class="card">
  <h2>Execution Timeline (Last 50 Events)</h2>
  <div style="overflow-x:auto;" id="timelineTable"></div>
</div>

<div class="card">
  <h2>Execution Duration</h2>
  <div id="durationBars"></div>
</div>

<div class="card">
  <h2>Execution Order</h2>
  <div class="filter-bar" id="stageFilters"></div>
  <div style="overflow-x:auto;" id="execOrderTable"></div>
</div>

<div class="card">
  <h2>Agent Dependencies</h2>
  <div class="dep-graph" id="depGraph"></div>
</div>

<div class="card">
  <h2>Failure Chain</h2>
  <div style="overflow-x:auto;" id="failureTable"></div>
</div>

<div class="card">
  <h2>Recovery Chain</h2>
  <div id="recoveryList"></div>
</div>

<div class="card">
  <h2>Retry Chain</h2>
  <div style="overflow-x:auto;" id="retryTable"></div>
</div>

<div class="card">
  <h2>Skipped Agents</h2>
  <div style="overflow-x:auto;" id="skippedTable"></div>
</div>

<div class="card">
  <h2>Exit Status</h2>
  <div id="exitStatus"></div>
</div>

<script>
const agents = ${agentsJson};
const timeline = ${timelineJson};
const depChains = ${depChainsJson};
const stateCounts = ${stateCountsJson};
const healthCounts = ${healthCountsJson};
const failures = ${failuresJson};
const recoveries = ${recoveriesJson};
const retries = ${retriesJson};
const skipped = ${skippedJson};
const summary = ${summaryJson};

// State chart
(function() {
  const chart = document.getElementById('stateChart');
  const colors = { COMPLETED: '#3fb950', FAILED: '#f85149', RUNNING: '#58a6ff', SKIPPED: '#d29922',
    DISABLED: '#8b949e', REGISTERED: '#bc8cff', WAITING: '#39d2c0', ELIGIBLE: '#d4760c',
    RECOVERED: '#f778ba', INITIALIZED: '#58a6ff' };
  const maxVal = Math.max(...(Object.values(stateCounts) as any[]), 1);
  for (const [state, count] of (Object.entries(stateCounts) as [string, any][])) {
    if (count === 0) continue;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.height = Math.max(4, (count / maxVal) * 100) + 'px';
    fill.style.background = colors[state] || '#8b949e';
    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = state.substring(0, 5) + ' ' + count;
    bar.appendChild(fill);
    bar.appendChild(label);
    chart.appendChild(bar);
  }
})();

// Health chart
(function() {
  const chart = document.getElementById('healthChart');
  const colors = { healthy: '#3fb950', degraded: '#d29922', critical: '#f85149', unknown: '#8b949e', disabled: '#30363d' };
  const maxVal = Math.max(...(Object.values(healthCounts) as any[]), 1);
  for (const [health, count] of (Object.entries(healthCounts) as [string, any][])) {
    if (count === 0) continue;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.height = Math.max(4, (count / maxVal) * 100) + 'px';
    fill.style.background = colors[health] || '#8b949e';
    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = health + ' ' + count;
    bar.appendChild(fill);
    bar.appendChild(label);
    chart.appendChild(bar);
  }
})();

// Timeline
(function() {
  const table = document.getElementById('timelineTable');
  const t = document.createElement('table');
  let html = '<tr><th>Time</th><th>Agent</th><th>Transition</th><th>Duration</th><th>Health</th></tr>';
  const entries = timeline.slice(-50);
  for (const e of entries) {
    const time = e.at ? new Date(e.at).toISOString().substring(11, 19) : '—';
    const dur = e.duration ? e.duration + 'ms' : '—';
    const healthDot = '<span class="health-dot health-' + (e.health || 'unknown') + '"></span>';
    html += '<tr><td>' + time + '</td><td>' + e.agent + '</td><td><span class="state-badge state-' + e.to + '">' + e.from + ' → ' + e.to + '</span></td><td>' + dur + '</td><td>' + healthDot + (e.health || '—') + '</td></tr>';
  }
  t.innerHTML = html;
  table.appendChild(t);
})();

// Duration bars
(function() {
  const container = document.getElementById('durationBars');
  const withDur = agents.filter(a => a.lastDuration > 0).sort((a, b) => b.lastDuration - a.lastDuration).slice(0, 20);
  if (withDur.length === 0) { container.textContent = 'No duration data available.'; return; }
  const maxDur = Math.max(...withDur.map(a => a.lastDuration));
  for (const a of withDur) {
    const div = document.createElement('div');
    div.className = 'timeline-bar';
    const label = document.createElement('div');
    label.className = 'timeline-label';
    label.textContent = a.key;
    const track = document.createElement('div');
    track.className = 'timeline-track';
    const fill = document.createElement('div');
    fill.className = 'timeline-fill fill-' + (a.state === 'FAILED' ? 'failed' : 'completed');
    fill.style.width = Math.max(2, (a.lastDuration / maxDur) * 100) + '%';
    track.appendChild(fill);
    const dur = document.createElement('div');
    dur.className = 'timeline-duration';
    dur.textContent = a.lastDuration + 'ms';
    div.appendChild(label); div.appendChild(track); div.appendChild(dur);
    container.appendChild(div);
  }
})();

// Execution Order
(function() {
  const table = document.getElementById('execOrderTable');
  const filters = document.getElementById('stageFilters');
  const execEntries = timeline.filter(t => t.to === 'RUNNING' || t.to === 'COMPLETED' || t.to === 'FAILED');
  const stages = [...new Set(execEntries.map(e => e.stage).filter(Boolean))];

  let allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.textContent = 'All';
  allBtn.dataset.stage = 'all';
  filters.appendChild(allBtn);
  for (const s of stages) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = s;
    btn.dataset.stage = s;
    filters.appendChild(btn);
  }

  function renderTable(stageFilter) {
    let html = '<tr><th>#</th><th>Agent</th><th>Stage</th><th>Status</th><th>Duration</th></tr>';
    let i = 0;
    for (const e of execEntries) {
      if (stageFilter !== 'all' && e.stage !== stageFilter) continue;
      i++;
      const status = e.to === 'COMPLETED' ? '✅ Completed' : e.to === 'FAILED' ? '❌ Failed' : '🔄 Running';
      const dur = e.duration ? e.duration + 'ms' : '—';
      html += '<tr><td>' + i + '</td><td>' + e.agent + '</td><td>' + (e.stage || '—') + '</td><td>' + status + '</td><td>' + dur + '</td></tr>';
    }
    if (i === 0) html += '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No entries for stage</td></tr>';
    table.innerHTML = '<table>' + html + '</table>';
  }

  filters.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('filter-btn')) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      ev.target.classList.add('active');
      renderTable(ev.target.dataset.stage);
    }
  });
  renderTable('all');
})();

// Dependencies
(function() {
  const container = document.getElementById('depGraph');
  const entries = (Object.entries(depChains) as [string, any][]);
  if (entries.length === 0) { container.textContent = 'No dependency data available.'; return; }
  for (const [agent, deps] of entries) {
    const node = document.createElement('div');
    node.className = 'dep-node';
    const keySpan = document.createElement('span');
    keySpan.className = 'key';
    keySpan.textContent = agent;
    node.appendChild(keySpan);
    if (deps.length > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = ' → ';
      node.appendChild(arrow);
      deps.forEach((d, i) => {
        const depSpan = document.createElement('span');
        depSpan.className = 'dep-state';
        depSpan.textContent = d.key + ' (' + d.state + ')';
        node.appendChild(depSpan);
        if (i < deps.length - 1) {
          const sep = document.createElement('span');
          sep.style.cssText = 'color:var(--text-muted);margin:0 4px;';
          sep.textContent = ', ';
          node.appendChild(sep);
        }
      });
    }
    container.appendChild(node);
  }
})();

// Failures
(function() {
  const table = document.getElementById('failureTable');
  if (failures.length === 0) { table.textContent = 'No failures detected.'; return; }
  let html = '<tr><th>Agent</th><th>Consecutive Failures</th><th>Last Error</th><th>Last Failed</th></tr>';
  for (const f of failures) {
    const err = (f.lastError || '—').substring(0, 80);
    const failedAt = f.lastFailedAt ? new Date(f.lastFailedAt).toISOString().substring(11, 19) : '—';
    html += '<tr><td>' + f.key + '</td><td><span class="state-badge state-FAILED">' + (f.consecutiveFailures || 0) + '</span></td><td style="font-size:11px;color:var(--red);">' + err + '</td><td>' + failedAt + '</td></tr>';
  }
  table.innerHTML = '<table>' + html + '</table>';
})();

// Recoveries
(function() {
  const container = document.getElementById('recoveryList');
  if (recoveries.length === 0) { container.textContent = 'No recoveries recorded.'; return; }
  for (const r of recoveries) {
    const div = document.createElement('div');
    div.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;';
    div.innerHTML = '<span class="health-dot health-healthy"></span> <strong>' + r.key + '</strong> — ' + r.recoveryCount + ' recovery/recoveries' + (r.lastRecoveredAt ? ', last at ' + new Date(r.lastRecoveredAt).toISOString().substring(11, 19) : '');
    container.appendChild(div);
  }
})();

// Retries
(function() {
  const table = document.getElementById('retryTable');
  if (retries.length === 0) { table.textContent = 'No retries recorded.'; return; }
  let html = '<tr><th>Agent</th><th>Total Runs</th><th>Success</th><th>Failures</th><th>Rate</th></tr>';
  for (const r of retries) {
    const rate = r.totalRuns > 0 ? Math.round((r.successCount / r.totalRuns) * 100) + '%' : '—';
    html += '<tr><td>' + r.key + '</td><td>' + (r.totalRuns || 0) + '</td><td style="color:var(--green);">' + (r.successCount || 0) + '</td><td style="color:var(--red);">' + (r.failureCount || 0) + '</td><td>' + rate + '</td></tr>';
  }
  table.innerHTML = '<table>' + html + '</table>';
})();

// Skipped
(function() {
  const table = document.getElementById('skippedTable');
  if (skipped.length === 0) { table.textContent = 'No agents were skipped.'; return; }
  let html = '<tr><th>Agent</th><th>Skip Count</th><th>Reason</th></tr>';
  for (const s of skipped) {
    const reason = (s.lastError || '—').substring(0, 80);
    html += '<tr><td>' + s.key + '</td><td><span class="state-badge state-SKIPPED">' + (s.skipCount || 0) + '</span></td><td style="color:var(--yellow);">' + reason + '</td></tr>';
  }
  table.innerHTML = '<table>' + html + '</table>';
})();

// Exit Status
(function() {
  const container = document.getElementById('exitStatus');
  const failedCount = stateCounts['FAILED'] || 0;
  const completedCount = stateCounts['COMPLETED'] || 0;
  const total = failedCount + completedCount;
  const rate = total > 0 ? Math.round((completedCount / total) * 100) : 100;
  const status = failedCount === 0 ? '✅ PASSED' : '❌ FAILED';
  const statusColor = failedCount === 0 ? 'var(--green)' : 'var(--red)';

  let html = '<div style="text-align:center;padding:16px;">';
  html += '<div style="font-size:48px;font-weight:700;color:' + statusColor + ';">' + status + '</div>';
  html += '<div style="font-size:14px;color:var(--text-muted);margin-top:8px;">' + completedCount + ' completed, ' + failedCount + ' failed — ' + rate + '% success rate</div>';
  html += '<div style="margin-top:12px;display:flex;justify-content:center;gap:24px;">';
  html += '<div><span style="color:var(--green);font-weight:600;">' + (analysis.totalAgents) + '</span> agents</div>';
  html += '<div><span style="color:var(--blue);font-weight:600;">' + Object.keys(depChains).length + '</span> dependencies</div>';
  html += '<div><span style="color:var(--text-muted);">' + timeline.length + '</span> events</div>';
  html += '</div></div>';
  container.innerHTML = html;
})();
</script>
</body>
</html>`;

  fs.ensureDirSync(REPORTS_AI_DIR);
  fs.writeFileSync(HTML_OUT, html, 'utf8');
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     MAIN                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function main() {
  fs.ensureDirSync(REPORTS_AI_DIR);
  fs.ensureDirSync(STORE_DIR);

  console.log('[AgentLifecycleReport] Generating lifecycle reports...');

  const { lifecycleData, execContext } = loadData();
  const agentCount = Object.keys(lifecycleData.agents || {}).length;

  if (agentCount === 0) {
    console.warn('[AgentLifecycleReport] No lifecycle data found at ' + LIFECYCLE_STORE);
    console.warn('  Run a test execution first to populate agent lifecycle data.');
    // Generate empty reports
    const empty = { reportType: 'agent-lifecycle', generatedAt: new Date().toISOString(),
      summary: { totalAgents: 0, stateDistribution: {} as Record<string, any>, stageDistribution: {} as Record<string, any>, healthDistribution: {} as Record<string, any> },
      agents: [] as any[], failureChain: [] as any[], recoveryChain: [] as any[], retryChain: [] as any[],
      skippedAgents: [] as any[], executionTimeline: [] as any[], dependencyChains: {} as Record<string, any>, executionOrder: [] as any[] };
    fs.writeJsonSync(JSON_OUT, empty, { spaces: 2 });
    fs.writeFileSync(MD_OUT, '# Agent Lifecycle Report\n\nNo lifecycle data available. Run a test execution first.\n');
    const emptyHtml = '<!DOCTYPE html><html><body style="background:#0d1117;color:#c9d1d9;font-family:sans-serif;padding:24px;"><h1>No Data</h1><p>No lifecycle data available. Run a test execution first.</p></body></html>';
    fs.writeFileSync(HTML_OUT, emptyHtml, 'utf8');
    console.log('[AgentLifecycleReport] Empty reports generated at:');
    console.log('  ' + JSON_OUT);
    console.log('  ' + MD_OUT);
    console.log('  ' + HTML_OUT);
    return;
  }

  const analysis = analyzeAgents(lifecycleData, execContext);

  // Generate reports
  const jsonReport = generateJSON(analysis);
  generateMD(analysis, jsonReport);
  generateHTML(analysis, jsonReport);

  console.log('[AgentLifecycleReport] Reports generated:');
  console.log('  ' + JSON_OUT + ' (' + fs.statSync(JSON_OUT).size + ' bytes)');
  console.log('  ' + MD_OUT + ' (' + fs.statSync(MD_OUT).size + ' bytes)');
  console.log('  ' + HTML_OUT + ' (' + fs.statSync(HTML_OUT).size + ' bytes)');
  console.log('[AgentLifecycleReport] Done. ' + analysis.totalAgents + ' agents analyzed.');
}

main().catch(err => {
  console.error('[AgentLifecycleReport] Fatal:', err.message);
  process.exit(1);
});
