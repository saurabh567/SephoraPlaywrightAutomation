/**
 * agentHealthAgent.js
 *
 * Agent Health Monitoring - generates health, performance, and latency reports.
 *
 * Reports:
 *   reports/ai/agent-health.md    - Status, last execution, health per agent
 *   reports/ai/agent-performance.md - Duration, success rate, run statistics
 *   reports/ai/agent-latency.md   - Execution latency analysis
 */

const fs = require('fs-extra');
const path = require('path');

const REPORTS_DIR = path.join(process.cwd(), 'reports', 'ai');

class AgentHealthAgent {
  async run(input) {
    if (!input) input = {};
    console.log('[AgentHealthAgent] Generating agent health reports');

    const healthTracker = require('../core/AgentHealthTracker');
    const registry = require('../core/AgentRegistry');

    await registry.discover();
    await healthTracker.initializeFromRegistry(registry);

    const results = {};

    // Report 1: Agent Health
    results.healthReport = await this._generateHealthReport(healthTracker, registry);

    // Report 2: Agent Performance
    results.performanceReport = await this._generatePerformanceReport(healthTracker, registry);

    // Report 3: Agent Latency
    results.latencyReport = await this._generateLatencyReport(healthTracker, registry);

    console.log('[AgentHealthAgent] Reports generated: ' + Object.keys(results).length);
    return results;
  }

  async _generateHealthReport(healthTracker, registry) {
    const allHealth = healthTracker.getAllHealth();
    const summary = healthTracker.getSummary();
    const data = registry.getAll();
    const allKeys = new Set(data.map(function(a) { return a.key; }));

    const md = [];
    md.push('# Agent Health Report');
    md.push('');
    md.push('**Generated:** ' + new Date().toISOString());
    md.push('**Total Agents:** ' + summary.totalAgents);
    md.push('');
    md.push('## Summary');
    md.push('');
    md.push('| Status | Count |');
    md.push('|---|---|');
    md.push('| ✅ Healthy | ' + summary.healthy + ' |');
    md.push('| ⚠️  Degraded | ' + summary.degraded + ' |');
    md.push('| ❌ Critical | ' + summary.critical + ' |');
    md.push('| ❓ Unknown | ' + summary.unknown + ' |');
    md.push('| **Total Executions** | ' + summary.totalExecutions + ' |');
    md.push('| **Average Success Rate** | ' + summary.averageSuccessRate + '% |');
    md.push('');
    md.push('## Agent Health Details');
    md.push('');
    md.push('| Agent | Health | Status | Runs | Success Rate | Last Duration | Last Execution |');
    md.push('|---|---|---|---|---|---|---|');

    var sorted = Object.entries(allHealth).sort(function(a, b) {
      var healthOrder = { critical: 0, degraded: 1, unknown: 2, healthy: 3 };
      return (healthOrder[a[1].health] || 99) - (healthOrder[b[1].health] || 99);
    });

    for (var si = 0; si < sorted.length; si++) {
      var key = sorted[si][0];
      var entry = sorted[si][1];
      if (!allKeys.has(key)) continue;
      var icon = entry.health === 'healthy' ? '✅' : entry.health === 'degraded' ? '⚠️' : entry.health === 'critical' ? '❌' : '❓';
      var lastExec = entry.lastExecution ? new Date(entry.lastExecution).toISOString().slice(0, 19) : 'never';
      var dur = entry.lastDuration ? entry.lastDuration + 'ms' : '-';
      md.push('| ' + icon + ' ' + key + ' | ' + entry.health + ' | ' + entry.lastStatus + ' | ' + entry.totalRuns + ' | ' + entry.successRate + '% | ' + dur + ' | ' + lastExec + ' |');
    }

    md.push('');
    var outPath = path.join(REPORTS_DIR, 'agent-health.md');
    fs.writeFileSync(outPath, md.join('\n'), 'utf8');
    return { path: outPath };
  }

  async _generatePerformanceReport(healthTracker) {
    const allHealth = healthTracker.getAllHealth();
    const summary = healthTracker.getSummary();

    const md = [];
    md.push('# Agent Performance Report');
    md.push('');
    md.push('**Generated:** ' + new Date().toISOString());
    md.push('**Average Success Rate:** ' + summary.averageSuccessRate + '%');
    md.push('**Total Executions:** ' + summary.totalExecutions);
    md.push('');
    md.push('## Performance by Agent');
    md.push('');
    md.push('| Agent | Runs | Success | Failures | Skips | Success Rate | Consecutive Failures |');
    md.push('|---|---|---|---|---|---|---|');

    var sorted = Object.entries(allHealth)
      .filter(function(e) { return e[1].totalRuns > 0 || e[1].totalSkips > 0; })
      .sort(function(a, b) { return (b[1].totalRuns || 0) - (a[1].totalRuns || 0); });

    for (var si = 0; si < sorted.length; si++) {
      var key = sorted[si][0];
      var entry = sorted[si][1];
      var rate = entry.successRate + '%';
      md.push('| ' + key + ' | ' + entry.totalRuns + ' | ' + entry.successCount + ' | ' + entry.failureCount + ' | ' + (entry.totalSkips || 0) + ' | ' + rate + ' | ' + entry.consecutiveFailures + ' |');
    }

    md.push('');
    md.push('## Top Performers');
    md.push('');
    var top = Object.entries(allHealth)
      .filter(function(e) { return e[1].totalRuns > 0; })
      .sort(function(a, b) { return (b[1].successRate || 0) - (a[1].successRate || 0); })
      .slice(0, 5);
    for (var ti = 0; ti < top.length; ti++) {
      md.push('- **' + top[ti][0] + '**: ' + top[ti][1].successRate + '% success (' + top[ti][1].successCount + '/' + top[ti][1].totalRuns + ')');
    }

    md.push('');
    md.push('## Needs Attention');
    md.push('');
    var bottom = Object.entries(allHealth)
      .filter(function(e) { return e[1].totalRuns > 0; })
      .sort(function(a, b) { return (a[1].successRate || 0) - (b[1].successRate || 0); })
      .slice(0, 5);
    for (var bi = 0; bi < bottom.length; bi++) {
      md.push('- **' + bottom[bi][0] + '**: ' + bottom[bi][1].successRate + '% success (' + bottom[bi][1].successCount + '/' + bottom[bi][1].totalRuns + ') - ' + (bottom[bi][1].lastError || 'no error info'));
    }

    var outPath = path.join(REPORTS_DIR, 'agent-performance.md');
    fs.writeFileSync(outPath, md.join('\n'), 'utf8');
    return { path: outPath };
  }

  async _generateLatencyReport(healthTracker) {
    const allHealth = healthTracker.getAllHealth();

    const md = [];
    md.push('# Agent Latency Report');
    md.push('');
    md.push('**Generated:** ' + new Date().toISOString());
    md.push('');
    md.push('## Execution Latency by Agent');
    md.push('');
    md.push('| Agent | Last Duration | Health | Priority | Stage |');
    md.push('|---|---|---|---|---|');

    var sorted = Object.entries(allHealth)
      .filter(function(e) { return e[1].lastDuration > 0; })
      .sort(function(a, b) { return b[1].lastDuration - a[1].lastDuration; });

    for (var si = 0; si < sorted.length; si++) {
      var key = sorted[si][0];
      var entry = sorted[si][1];
      var dur = entry.lastDuration + 'ms';
      var healthIcon = entry.health === 'healthy' ? '✅' : entry.health === 'degraded' ? '⚠️' : '❌';
      md.push('| ' + key + ' | ' + dur + ' | ' + healthIcon + ' ' + entry.health + ' | ' + entry.priority + ' | ' + entry.stage + ' |');
    }

    md.push('');
    md.push('## Latency Distribution');
    md.push('');
    var durations = Object.values(allHealth).map(function(e) { return e.lastDuration; }).filter(function(d) { return d > 0; });
    if (durations.length > 0) {
      var avg = Math.round(durations.reduce(function(s, d) { return s + d; }, 0) / durations.length);
      var max = Math.max.apply(null, durations);
      var min = Math.min.apply(null, durations);
      md.push('| Metric | Value |');
      md.push('|---|---|');
      md.push('| Average Latency | ' + avg + 'ms |');
      md.push('| Max Latency | ' + max + 'ms |');
      md.push('| Min Latency | ' + min + 'ms |');
      md.push('| Agents Tracked | ' + durations.length + ' |');
    }

    var outPath = path.join(REPORTS_DIR, 'agent-latency.md');
    fs.writeFileSync(outPath, md.join('\n'), 'utf8');
    return { path: outPath };
  }
}

var instance = new AgentHealthAgent();
module.exports = instance;

module.exports.metadata = {
  name: 'Agent Health Agent',
  version: '1.0.0',
  description: 'Generates agent health, performance, and latency monitoring reports',
  dependencies: [],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['health', 'monitoring', 'reports'],
  executionStage: 'multi-agent',
  priority: 45,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['agent-health-monitoring'],
  lifecycle: 'active'
};
