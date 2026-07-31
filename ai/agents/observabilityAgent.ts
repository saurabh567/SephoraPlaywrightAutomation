import fs from 'fs-extra';
import path from 'path';
/**
 * observabilityAgent.js
 *
 * Comprehensive observability system with live dashboard, timelines, and graphs.
 *
 * Generates:
 *   reports/ai/observability/index.html  - Live dashboard with all views
 *   reports/ai/observability/data.json   - All observability data
 */


const OBS_DIR = path.join(process.cwd(), 'reports', 'ai', 'observability');

class ObservabilityAgent {
  async run(input: any = {}) {
    console.log('[ObservabilityAgent] Generating observability dashboard');

    fs.ensureDirSync(OBS_DIR);

    const registry = require('../core/AgentRegistry');
    await registry.discover();

    // Collect all data sources
    const data = {
      generatedAt: new Date().toISOString(),
      runId: input.runId || `obs-${Date.now()}`,
      platform: input.platform || process.env.TEST_PLATFORM || 'WEB',
      registry: this._collectRegistryData(registry),
      health: this._collectHealthData(),
      memory: this._collectMemoryData(),
      execution: this._collectExecutionData(),
      events: this._collectEventData()
    };

    // Write data JSON
    const dataPath = path.join(OBS_DIR, 'data.json');
    fs.writeJsonSync(dataPath, data, { spaces: 2 });

    // Generate HTML dashboard
    const html = this._generateDashboardHtml(data);
    const htmlPath = path.join(OBS_DIR, 'index.html');
    fs.writeFileSync(htmlPath, html, 'utf8');

    console.log('[ObservabilityAgent] Dashboard written to ' + htmlPath);

    return {
      ok: true,
      dashboardPath: path.relative(process.cwd(), htmlPath),
      dataPath: path.relative(process.cwd(), dataPath)
    };
  }

  _collectRegistryData(registry: any) {
    const all = registry.getAll();
    const order = registry.getTopologicalOrder();
    const cycles = registry.detectCircularDependencies();

    return {
      totalAgents: all.length,
      topologicalOrder: order,
      hasCycles: cycles.length > 0,
      cycles: cycles,
      agents: all.map((a: any) => ({
        key: a.key,
        name: a.metadata.name,
        stage: a.metadata.executionStage,
        priority: a.metadata.priority,
        lifecycle: a.metadata.lifecycle,
        hasRun: a.hasRun,
        platforms: a.metadata.platforms,
        conditions: (a.metadata.conditions || []).map((c: any) => typeof c === 'string' ? c : c.type),
        dependencies: a.metadata.dependencies || [],
        strategy: a.metadata.strategy || 'independent'
      }))
    };
  }

  _collectHealthData() {
    try {
      const health = require('../core/AgentHealthTracker');
      const allHealth = health.getAllHealth();
      const summary = health.getSummary();
      return { summary, agents: allHealth };
    } catch (e: any) {
      return { summary: { totalAgents: 0 }, agents: {} as Record<string, any> };
    }
  }

  _collectMemoryData() {
    const memory: Record<string, any> = {};
    const stores = [
      { key: 'execution', path: 'ai/memory/execution-history.json' },
      { key: 'failure', path: 'ai/memory/failure-memory.json' },
      { key: 'environment', path: 'ai/memory/environment-memory.json' },
      { key: 'performance', path: 'ai/memory/performance-memory.json' },
      { key: 'device', path: 'ai/memory/device-memory.json' },
      { key: 'anomaly', path: 'ai/memory/anomaly-state.json' }
    ];

    for (const store of stores) {
      try {
        const fullPath = path.join(process.cwd(), store.path);
        if (fs.existsSync(fullPath)) {
          const data = fs.readJsonSync(fullPath);
          if (store.key === 'performance' && data.runs) {
            memory[store.key] = { totalEntries: data.runs.length, latest: data.runs.slice(-1)[0] };
          } else if (store.key === 'failure' && data.failures) {
            memory[store.key] = { totalEntries: data.failures.length, unresolved: data.failures.filter((f: any) => !f.resolved).length };
          } else if (store.key === 'anomaly' && data.history) {
            memory[store.key] = { totalEntries: data.history.length, alerts: (data.alerts || []).length };
          } else if (store.key === 'environment' && data.environments) {
            memory[store.key] = { totalEntries: data.environments.length };
          } else if (store.key === 'device' && data.sessions) {
            memory[store.key] = { totalEntries: data.sessions.length, devices: (data.devices || []).length };
          } else if (store.key === 'execution') {
            memory[store.key] = { totalEntries: Array.isArray(data) ? data.length : 0 };
          }
        }
      } catch (e: any) {}
    }
    return memory;
  }

  _collectExecutionData() {
    try {
      const execPath = path.join(process.cwd(), 'reports', 'json', 'cucumber-report.json');
      if (fs.existsSync(execPath)) {
        const report = fs.readJsonSync(execPath);
        const features = Array.isArray(report) ? report : [] as any[];
        const allScenarios = features.flatMap(f => (f.elements || []).filter((e: any) => e.type === 'scenario'));
        return {
          totalFeatures: features.length,
          totalScenarios: allScenarios.length,
          passed: allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'passed')).length,
          failed: allScenarios.filter(s => (s.steps || []).some((st: any) => st.result?.status === 'failed')).length,
          skipped: allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'skipped' || st.result?.status === 'undefined')).length
        };
      }
    } catch (e: any) {}
    return {};
  }

  _collectEventData() {
    try {
      const bus = require('../core/EventBus');
      const history = bus.getHistory({ limit: 200 });
      return {
        totalEvents: history.length,
        recent: history.slice(-50).map((e: any) => ({
          type: e.type,
          timestamp: e.timestamp,
          source: e.source
        }))
      };
    } catch (e: any) {
      return { totalEvents: 0, recent: [] as any[] };
    }
  }

  _generateDashboardHtml(data: any) {
    const reg = data.registry;
    const health = data.health;
    const mem = data.memory;
    const exec = data.execution;

    const stages: Record<string, any> = {};
    for (const a of reg.agents) {
      const s = a.stage || 'unknown';
      if (!stages[s]) stages[s] = [];
      stages[s].push(a.key);
    }

    const agentRows = reg.agents.sort((a: any, b: any) => a.key.localeCompare(b.key)).map((a: any) => {
      const h = health.agents[a.key] || {};
      const healthIcon = h.health === 'healthy' ? '&#9989;' : h.health === 'degraded' ? '&#9888;&#65039;' : h.health === 'critical' ? '&#10060;' : '&#10067;';
      return `<tr><td>${healthIcon}</td><td>${a.key}</td><td>${a.name}</td><td>${a.stage}</td><td>${a.priority}</td><td>${a.lifecycle}</td><td>${(a.platforms || []).join(', ')}</td><td>${(a.dependencies || []).join(', ') || '-'}</td></tr>`;
    }).join('\n');

    const topoOrder = (reg.topologicalOrder || []).map((k: any, i: any) => `<div class="topo-item">${i+1}. ${k}</div>`).join('\n');

    const timelineRows = (data.events.recent || []).map((e: any) => {
      const ts = new Date(e.timestamp).toLocaleTimeString();
      return `<tr><td>${ts}</td><td>${e.type}</td><td>${e.source}</td></tr>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI Observability Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;padding:20px}
.container{max-width:1400px;margin:0 auto}
.header{background:linear-gradient(135deg,#1f6feb,#3fb950);padding:20px 30px;border-radius:12px;margin-bottom:20px;color:#fff}
.header h1{font-size:24px;margin-bottom:5px}
.header .sub{opacity:.85;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.card h3{font-size:11px;text-transform:uppercase;color:#8b949e;margin-bottom:6px;letter-spacing:.5px}
.card .val{font-size:28px;font-weight:700;margin-bottom:4px}
.card .sub{font-size:12px;color:#8b949e}
.section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin-bottom:16px}
.section h2{font-size:16px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #30363d;color:#f0f6fc}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #21262d}
th{background:#21262d;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.3px;position:sticky;top:0}
tr:hover{background:#1c2128}
.topo-container{display:flex;flex-wrap:wrap;gap:6px;max-height:300px;overflow-y:auto;padding:8px 0}
.topo-item{background:#1f6feb20;border:1px solid #1f6feb40;border-radius:4px;padding:4px 10px;font-size:12px;color:#58a6ff}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.bg-green{background:#3fb95030;color:#3fb950}
.bg-red{background:#f8514930;color:#f85149}
.bg-yellow{background:#d2992230;color:#d29922}
.bg-gray{background:#8b949e30;color:#8b949e}
.footer{text-align:center;color:#484f58;font-size:12px;padding:20px 0}
.tag{display:inline-block;background:#1f6feb20;color:#58a6ff;border:1px solid #1f6feb40;border-radius:3px;padding:1px 6px;font-size:10px;margin:1px}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.status-healthy{background:#3fb950}
.status-degraded{background:#d29922}
.status-critical{background:#f85149}
.status-unknown{background:#8b949e}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>&#128200; AI Observability Dashboard</h1>
<div class="sub">Generated: ${data.generatedAt.replace('T', ' ').slice(0,19)} | Platform: ${data.platform} | Run: ${data.runId}</div>
</div>

<div class="grid">
<div class="card"><h3>Total Agents</h3><div class="val" style="color:#58a6ff">${reg.totalAgents}</div><div class="sub">${Object.keys(stages).length} stages</div></div>
<div class="card"><h3>Healthy</h3><div class="val" style="color:#3fb950">${health.summary.healthy || 0}</div><div class="sub">${health.summary.averageSuccessRate || 0}% avg success</div></div>
<div class="card"><h3>Degraded</h3><div class="val" style="color:#d29922">${health.summary.degraded || 0}</div><div class="sub">${health.summary.critical || 0} critical</div></div>
<div class="card"><h3>Executions</h3><div class="val" style="color:#f0883e">${health.summary.totalExecutions || 0}</div><div class="sub">total agent runs</div></div>
<div class="card"><h3>Memory Stores</h3><div class="val" style="color:#bc8cff">${Object.keys(mem).length}</div><div class="sub">${(Object.values(mem) as any[]).reduce((s,m) => s + (m.totalEntries||0), 0)} total entries</div></div>
<div class="card"><h3>Test Scenarios</h3><div class="val" style="color:#7ee787">${exec.totalScenarios || 0}</div><div class="sub">${exec.passed || 0} passed, ${exec.failed || 0} failed</div></div>
</div>

<div class="section">
<h2>&#128337; Execution Timeline</h2>
<table>
<tr><th>Time</th><th>Event</th><th>Source</th></tr>
${timelineRows || '<tr><td colspan="3">No events recorded yet</td></tr>'}
</table>
</div>

<div class="section">
<h2>&#128268; Agent Registry (${reg.totalAgents})</h2>
<div style="overflow-x:auto;max-height:400px;overflow-y:auto">
<table>
<tr><th></th><th>Key</th><th>Name</th><th>Stage</th><th>Priority</th><th>Lifecycle</th><th>Platforms</th><th>Dependencies</th></tr>
${agentRows}
</table>
</div>
</div>

<div class="section">
<h2>&#128200; Dependency Graph (Topological Order)</h2>
<div class="topo-container">
${topoOrder}
</div>
${reg.hasCycles ? '<p style="color:#f85149">&#10060; Circular dependencies detected: ' + reg.cycles.join(', ') + '</p>' : '<p style="color:#3fb950">&#9989; No circular dependencies (valid DAG)</p>'}
</div>

<div class="section">
<h2>&#127759; Agent Stages</h2>
<table>
<tr><th>Stage</th><th>Count</th><th>Agents</th></tr>
${(Object.entries(stages) as [string, any][]).map(([s, agents]) => `<tr><td><strong>${s}</strong></td><td>${agents.length}</td><td>${agents.join(', ')}</td></tr>`).join('\n')}
</table>
</div>

<div class="section">
<h2>&#128202; Memory Store Statistics</h2>
<table>
<tr><th>Store</th><th>Entries</th><th>Details</th></tr>
${(Object.entries(mem) as [string, any][]).map(([k, v]) => {
  const details = v.unresolved !== undefined ? v.unresolved + ' unresolved' : v.alerts !== undefined ? v.alerts + ' alerts' : v.latest ? 'latest: ' + JSON.stringify(v.latest).slice(0,80) : '';
  return '<tr><td>' + k + '</td><td>' + (v.totalEntries || 0) + '</td><td>' + details + '</td></tr>';
}).join('\n') || '<tr><td colspan="3">No memory data</td></tr>'}
</table>
</div>

<div class="section">
<h2>&#128202; Agent Health Summary</h2>
<table>
<tr><th>Status</th><th>Count</th></tr>
<tr><td><span class="status-dot status-healthy"></span>Healthy</td><td>${health.summary.healthy || 0}</td></tr>
<tr><td><span class="status-dot status-degraded"></span>Degraded</td><td>${health.summary.degraded || 0}</td></tr>
<tr><td><span class="status-dot status-critical"></span>Critical</td><td>${health.summary.critical || 0}</td></tr>
<tr><td><span class="status-dot status-unknown"></span>Unknown</td><td>${health.summary.unknown || 0}</td></tr>
</table>
</div>

<div class="footer">
Observability Dashboard v1.0.0 | Auto-generated every execution
</div>
</div>
</body>
</html>`;

    return html;
  }
}

export default ObservabilityAgent;

export const metadata = {
  name: 'Observability Agent',
  version: '1.0.0',
  description: 'Generates live observability dashboard with timelines, graphs, and agent dependency visualization',
  dependencies: [] as any[],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['observability', 'dashboard', 'monitoring'],
  executionStage: 'reporting',
  priority: 73,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['observability'],
  lifecycle: 'active'
};
