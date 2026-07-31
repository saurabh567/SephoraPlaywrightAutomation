#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
/**
 * generateAgentCoverageReport.js
 *
 * Generates a comprehensive agent coverage report.
 * Reads from AgentRegistry, AgentLifecycleManager, AgentPerformanceMetrics,
 * and AgentHealthTracker to produce:
 *
 *   Total Registered Agents | Total Reachable | Executed | Skipped
 *   Disabled | Failed | Recovered | Unused | Never Executed
 *   Platform Specific | On Demand | Average Runtime
 *   Average Success Rate | Average Recovery Rate
 *
 * Output: reports/ai/agent-coverage-report.md
 *
 * Usage:
 *   node utils/generateAgentCoverageReport.js
 *   npm run coverage:report
 */


const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'reports', 'ai', 'agent-coverage-report.md');

async function main() {
  console.log('[AgentCoverageReport] Generating coverage report...');

  // ─── Load data sources ──────────────────────────────────────────────
  const registry = require('../ai/core/AgentRegistry');
  await registry.discover();

  const lifecycleManager = require('../ai/core/AgentLifecycleManager');
  await lifecycleManager.initializeFromRegistry(registry);

  const performanceMetrics = require('../ai/core/AgentPerformanceMetrics');
  await performanceMetrics.initialize();
  await performanceMetrics.syncFromLifecycle(lifecycleManager);

  let healthData: Record<string, any> = {};
  try {
    const healthPath = path.join(ROOT, 'ai', 'memory', 'agent-health.json');
    if (fs.existsSync(healthPath)) {
      healthData = fs.readJsonSync(healthPath);
    }
  } catch (e: any) {
    console.warn('[AgentCoverageReport] Health data unavailable:', e.message);
  }

  // ─── Collect data ────────────────────────────────────────────────────
  const allAgents = registry.getAll();
  const lifecycleEntries = lifecycleManager.getAll();
  const performanceSummary = performanceMetrics.getSummary();
  const healthAgents = healthData.agents || {};

  // Build a map for quick lookup
  const agentMap: Record<string, any> = {};
  for (const agent of allAgents) {
    const key = agent.key;
    const meta = agent.metadata || {};
    const lc = lifecycleEntries.find((e: any) => e.key === key);
    const perf = performanceSummary.agents?.find((a: any) => a.key === key);
    const health = healthAgents[key];

    agentMap[key] = {
      key,
      name: meta.name || key,
      stage: meta.executionStage || 'unknown',
      priority: meta.priority || 50,
      platforms: meta.platforms || [],
      tags: meta.tags || [],
      lifecycle: meta.lifecycle || 'active',
      hasRun: agent.hasRun || false,
      dependencies: meta.dependencies || [],
      description: meta.description || '',
      version: meta.version || '1.0.0',

      // From lifecycle manager
      state: lc ? lc.state : 'REGISTERED',
      totalRuns: lc ? lc.totalRuns || 0 : 0,
      successCount: lc ? lc.successCount || 0 : 0,
      failureCount: lc ? lc.failureCount || 0 : 0,
      skipCount: lc ? lc.skipCount || 0 : 0,
      recoveryCount: lc ? lc.recoveryCount || 0 : 0,
      lastDuration: lc ? lc.lastDuration || 0 : 0,
      stateHistory: lc ? lc.stateHistory || [] : [] as any[],

      // From performance metrics
      perfMeanDuration: perf ? perf.meanDuration : 0,
      perfSuccessRate: perf ? perf.successRate : 0,
      perfSkipRate: perf ? perf.skipRate : 0,
      perfRecoveryRate: perf ? perf.recoveryRate : 0,
      perfTrend: perf ? perf.trend : 'no-data',

      // From health tracker
      healthStatus: health ? health.health : 'unknown',
      healthSuccessRate: health ? health.successRate || 0 : 0,
      healthLastStatus: health ? health.lastStatus : 'never'
    };
  }

  const agents = (Object.values(agentMap) as any[]);

  // ─── Compute coverage metrics ────────────────────────────────────────

  const totalRegistered = agents.length;
  const totalReachable = agents.filter(a => a.lifecycle === 'active').length;
  const disabled = agents.filter(a => a.lifecycle === 'deprecated' || a.lifecycle === 'placeholder' || a.state === 'DISABLED').length;
  const executed = agents.filter(a => a.totalRuns > 0).length;
  const neverExecuted = agents.filter(a => a.totalRuns === 0 && a.lifecycle === 'active').length;
  const skipped = agents.filter(a => a.skipCount > 0).length;
  const failed = agents.filter(a => a.failureCount > 0).length;
  const recovered = agents.filter(a => a.recoveryCount > 0).length;

  // Platform-specific
  const platformBreakdown: Record<string, any> = {};
  for (const agent of agents) {
    for (const p of agent.platforms) {
      if (!platformBreakdown[p]) platformBreakdown[p] = { total: 0, executed: 0, skipped: 0, failed: 0 };
      platformBreakdown[p].total++;
      if (agent.totalRuns > 0) platformBreakdown[p].executed++;
      if (agent.skipCount > 0) platformBreakdown[p].skipped++;
      if (agent.failureCount > 0) platformBreakdown[p].failed++;
    }
  }

  // Stage breakdown
  const stageBreakdown: Record<string, any> = {};
  for (const agent of agents) {
    const stage = agent.stage;
    if (!stageBreakdown[stage]) stageBreakdown[stage] = { total: 0, executed: 0, skipped: 0, failed: 0, recovered: 0 };
    stageBreakdown[stage].total++;
    if (agent.totalRuns > 0) stageBreakdown[stage].executed++;
    if (agent.skipCount > 0) stageBreakdown[stage].skipped++;
    if (agent.failureCount > 0) stageBreakdown[stage].failed++;
    if (agent.recoveryCount > 0) stageBreakdown[stage].recovered++;
  }

  // On-demand agents (tags include 'on-demand' or 'manual')
  const onDemand = agents.filter(a => a.tags.some((t: any) => t.toLowerCase().includes('on-demand') || t.toLowerCase().includes('manual'))).length;

  // Averages
  const withDuration = agents.filter(a => a.lastDuration > 0);
  const avgRuntime = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, a) => s + a.lastDuration, 0) / withDuration.length)
    : 0;

  const withSuccess = agents.filter(a => a.perfSuccessRate > 0);
  const avgSuccessRate = withSuccess.length > 0
    ? Math.round(withSuccess.reduce((s, a) => s + a.perfSuccessRate, 0) / withSuccess.length)
    : 0;

  const withRecovery = agents.filter(a => a.perfRecoveryRate > 0);
  const avgRecoveryRate = withRecovery.length > 0
    ? Math.round(withRecovery.reduce((s, a) => s + a.perfRecoveryRate, 0) / withRecovery.length)
    : 0;

  // Unused agents (never executed, active lifecycle)
  const unused = agents.filter(a => a.state === 'REGISTERED' && a.lifecycle === 'active');

  // ─── Generate Markdown ────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const lines: any[] = [];
  lines.push('# Agent Coverage Report');
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**Source:** AgentRegistry · AgentLifecycleManager · AgentPerformanceMetrics · AgentHealthTracker`);
  lines.push('');

  // ── Executive Summary ──
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Registered Agents | ${totalRegistered} |`);
  lines.push(`| Total Reachable (active) | ${totalReachable} |`);
  lines.push(`| Executed (≥1 run) | ${executed} |`);
  lines.push(`| Skipped (≥1 skip) | ${skipped} |`);
  lines.push(`| Disabled | ${disabled} |`);
  lines.push(`| Failed (≥1 failure) | ${failed} |`);
  lines.push(`| Recovered (≥1 recovery) | ${recovered} |`);
  lines.push(`| Never Executed (active, 0 runs) | ${neverExecuted} |`);
  lines.push(`| Unused (state=REGISTERED, active) | ${unused.length} |`);
  lines.push(`| On-Demand Agents | ${onDemand} |`);
  lines.push(`| Average Runtime | ${avgRuntime}ms |`);
  lines.push(`| Average Success Rate | ${avgSuccessRate}% |`);
  lines.push(`| Average Recovery Rate | ${avgRecoveryRate}% |`);
  lines.push('');

  // ── Coverage Breakdown ──
  lines.push('## Coverage Breakdown');
  lines.push('');
  const executedPct = totalReachable > 0 ? Math.round((executed / totalReachable) * 100) : 0;
  const skippedPct = totalReachable > 0 ? Math.round((skipped / totalReachable) * 100) : 0;
  const failedPct = totalReachable > 0 ? Math.round((failed / totalReachable) * 100) : 0;
  const neverPct = totalReachable > 0 ? Math.round((neverExecuted / totalReachable) * 100) : 0;

  lines.push('```');
  const barLen = 30;
  const makeBar = (pct: any) => '█'.repeat(Math.round(pct / 100 * barLen)) + '░'.repeat(barLen - Math.round(pct / 100 * barLen));
  lines.push(` Executed    : ${makeBar(executedPct)} ${String(executed).padStart(3)}/${totalReachable} (${executedPct}%)`);
  lines.push(` Skipped     : ${makeBar(skippedPct)} ${String(skipped).padStart(3)}/${totalReachable} (${skippedPct}%)`);
  lines.push(` Failed      : ${makeBar(failedPct)} ${String(failed).padStart(3)}/${totalReachable} (${failedPct}%)`);
  lines.push(` Never Exec  : ${makeBar(neverPct)} ${String(neverExecuted).padStart(3)}/${totalReachable} (${neverPct}%)`);
  lines.push('```');
  lines.push('');

  // ── Platform-Specific Coverage ──
  lines.push('## Platform-Specific Coverage');
  lines.push('');
  lines.push('| Platform | Total | Executed | Skipped | Failed | Coverage % |');
  lines.push('|----------|-------|----------|---------|--------|------------|');
  for (const [platform, data] of (Object.entries(platformBreakdown) as [string, any][]).sort((a, b) => b[1].total - a[1].total)) {
    const covPct = data.total > 0 ? Math.round((data.executed / data.total) * 100) : 0;
    lines.push(`| ${platform} | ${data.total} | ${data.executed} | ${data.skipped} | ${data.failed} | ${covPct}% |`);
  }
  lines.push('');

  // ── Stage-Specific Coverage ──
  lines.push('## Stage-Specific Coverage');
  lines.push('');
  lines.push('| Stage | Total | Executed | Skipped | Failed | Recovered | Coverage % |');
  lines.push('|-------|-------|----------|---------|--------|-----------|------------|');
  const stageOrder = ['preflight', 'execution', 'analysis', 'multi-agent', 'reporting', 'cleanup'];
  for (const stage of stageOrder) {
    const data = stageBreakdown[stage];
    if (!data) continue;
    const covPct = data.total > 0 ? Math.round((data.executed / data.total) * 100) : 0;
    lines.push(`| ${stage} | ${data.total} | ${data.executed} | ${data.skipped} | ${data.failed} | ${data.recovered} | ${covPct}% |`);
  }
  lines.push('');

  // ── Never Executed Agents ──
  lines.push('## Never Executed Agents');
  lines.push('');
  lines.push('These agents are active but have never been executed:');
  lines.push('');
  if (neverExecuted > 0) {
    lines.push('| Agent | Stage | Priority | Platforms | Dependencies |');
    lines.push('|-------|-------|----------|-----------|--------------|');
    const neverList = agents.filter(a => a.totalRuns === 0 && a.lifecycle === 'active')
      .sort((a, b) => a.priority - b.priority);
    for (const agent of neverList) {
      const deps = agent.dependencies.length > 0 ? agent.dependencies.join(', ') : '—';
      const platforms = agent.platforms.length > 0 ? agent.platforms.join(', ') : '—';
      lines.push(`| ${agent.key} | ${agent.stage} | ${agent.priority} | ${platforms} | ${deps} |`);
    }
  } else {
    lines.push('_All active agents have been executed at least once._');
  }
  lines.push('');

  // ── Disabled Agents ──
  lines.push('## Disabled Agents');
  lines.push('');
  if (disabled > 0) {
    lines.push('| Agent | Stage | Reason |');
    lines.push('|-------|-------|--------|');
    const disabledList = agents.filter(a => a.lifecycle === 'deprecated' || a.lifecycle === 'placeholder')
      .sort((a, b) => a.priority - b.priority);
    for (const agent of disabledList) {
      const reason = agent.lifecycle === 'deprecated' ? 'Deprecated' : 'Placeholder';
      lines.push(`| ${agent.key} | ${agent.stage} | ${reason} |`);
    }
  } else {
    lines.push('_No agents are disabled._');
  }
  lines.push('');

  // ── Agents by Success Rate ──
  lines.push('## Agents by Success Rate');
  lines.push('');
  const bySuccess = agents.filter(a => a.perfSuccessRate > 0 || a.totalRuns > 0)
    .sort((a, b) => a.perfSuccessRate - b.perfSuccessRate);
  if (bySuccess.length > 0) {
    lines.push('| Agent | Stage | Success Rate | Runs | Failures | Trend |');
    lines.push('|-------|-------|-------------|------|----------|-------|');
    for (const agent of bySuccess) {
      const rate = agent.perfSuccessRate > 0 ? agent.perfSuccessRate + '%' : '—';
      const trend = agent.perfTrend || 'no-data';
      lines.push(`| ${agent.key} | ${agent.stage} | ${rate} | ${agent.totalRuns} | ${agent.failureCount} | ${trend} |`);
    }
  } else {
    lines.push('_No execution data available._');
  }
  lines.push('');

  // ── Agents by Average Runtime ──
  lines.push('## Agents by Average Runtime');
  lines.push('');
  const byRuntime = agents.filter(a => a.perfMeanDuration > 0)
    .sort((a, b) => b.perfMeanDuration - a.perfMeanDuration);
  if (byRuntime.length > 0) {
    lines.push('| Agent | Stage | Mean Duration | Last Duration | Runs | Trend |');
    lines.push('|-------|-------|---------------|---------------|------|-------|');
    for (const agent of byRuntime) {
      lines.push(`| ${agent.key} | ${agent.stage} | ${agent.perfMeanDuration}ms | ${agent.lastDuration}ms | ${agent.totalRuns} | ${agent.perfTrend} |`);
    }
  } else {
    lines.push('_No runtime data available._');
  }
  lines.push('');

  // ── Health Status Summary ──
  lines.push('## Health Status Summary');
  lines.push('');
  const healthCounts: Record<string, any> = {};
  for (const agent of agents) {
    const h = agent.healthStatus || 'unknown';
    healthCounts[h] = (healthCounts[h] || 0) + 1;
  }
  lines.push('| Health | Count |');
  lines.push('|--------|-------|');
  for (const [health, count] of (Object.entries(healthCounts) as [string, any][]).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${health} | ${count} |`);
  }
  lines.push('');

  // ── Coverage by Dependency Chain ──
  lines.push('## Coverage by Top-Level Dependency Chain');
  lines.push('');
  const depChains: Record<string, any> = {};
  for (const agent of agents) {
    if (agent.dependencies.length === 0) {
      if (!depChains['Root']) depChains['Root'] = { total: 0, executed: 0 };
      depChains['Root'].total++;
      if (agent.totalRuns > 0) depChains['Root'].executed++;
    } else {
      for (const dep of agent.dependencies) {
        if (!depChains[dep]) depChains[dep] = { total: 0, executed: 0 };
        depChains[dep].total++;
        if (agent.totalRuns > 0) depChains[dep].executed++;
      }
    }
  }
  lines.push('| Dependency (parent) | Dependent Agents | Executed | Coverage % |');
  lines.push('|---------------------|------------------|----------|------------|');
  for (const [dep, data] of (Object.entries(depChains) as [string, any][]).sort((a, b) => b[1].total - a[1].total).slice(0, 15)) {
    const covPct = data.total > 0 ? Math.round((data.executed / data.total) * 100) : 0;
    lines.push(`| ${dep} | ${data.total} | ${data.executed} | ${covPct}% |`);
  }
  lines.push('');

  // ── Historical Trend ──
  lines.push('## Performance Trend Distribution');
  lines.push('');
  const trendCounts: Record<string, any> = {};
  for (const agent of agents) {
    const t = agent.perfTrend || 'no-data';
    trendCounts[t] = (trendCounts[t] || 0) + 1;
  }
  lines.push('| Trend | Agent Count |');
  lines.push('|-------|-------------|');
  for (const [trend, count] of (Object.entries(trendCounts) as [string, any][]).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${trend} | ${count} |`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('_Report generated by generateAgentCoverageReport.js_');

  // ─── Write output ──────────────────────────────────────────────────────
  fs.ensureDirSync(path.dirname(OUTPUT));
  fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');

  console.log(`[AgentCoverageReport] Generated: ${OUTPUT}`);
  console.log(`[AgentCoverageReport] ${totalRegistered} agents, ${executed} executed, ${skipped} skipped, ${failed} failed, ${recovered} recovered, ${neverExecuted} never executed`);
  console.log(`[AgentCoverageReport] Avg success rate: ${avgSuccessRate}%, Avg runtime: ${avgRuntime}ms, Avg recovery rate: ${avgRecoveryRate}%`);
}

main().catch(err => {
  console.error('[AgentCoverageReport] Fatal:', err.message);
  process.exit(1);
});
