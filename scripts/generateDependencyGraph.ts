#!/usr/bin/env node
import registry from '../ai/core/AgentRegistry';
import path from 'path';
import fs from 'fs-extra';
/**
 * generateDependencyGraph.js
 *
 * Generates the visual agent dependency graph report.
 * Output: reports/architecture/agent-dependency-graph.md
 */


async function main() {
  await registry.discover();

  const reportPath = path.join(process.cwd(), 'reports', 'architecture', 'agent-dependency-graph.md');
  fs.ensureDirSync(path.dirname(reportPath));

  const all = registry.getAll();
  const topoOrder = registry.getTopologicalOrder();
  const cycles = registry.detectCircularDependencies();

  let md: any[] = [];
  md.push('# Agent Dependency Graph');
  md.push('');
  md.push('**Generated:** ' + new Date().toISOString());
  md.push('**Agents:** ' + all.length);
  md.push('**Cycles:** ' + (cycles.length === 0 ? 'None (DAG)' : cycles.length));
  md.push('');

  // 1. Circular dependencies
  md.push('## 1. Circular Dependency Check');
  md.push('');
  if (cycles.length === 0) {
    md.push('✅ **No circular dependencies detected.** The agent dependency graph is a valid Directed Acyclic Graph (DAG).');
  } else {
    md.push('❌ **Circular dependencies detected:**');
    md.push('');
    for (const cycle of cycles) {
      md.push('- `' + cycle + '`');
    }
  }
  md.push('');

  // 2. Topological execution order
  md.push('## 2. Topological Execution Order');
  md.push('');
  md.push('Agents in dependency-respecting execution order:');
  md.push('');
  md.push('```');
  md.push(topoOrder.join('\n'));
  md.push('```');
  md.push('');

  // 3. Full dependency graph (visual)
  md.push('## 3. Visual Dependency Graph');
  md.push('');
  md.push('```');
  
  // Build a stage-based tree
  const stages: Record<string, any> = {};
  for (const key of topoOrder) {
    const agent = registry.get(key);
    if (!agent) continue;
    const stage = agent.metadata.executionStage || 'unknown';
    if (!stages[stage]) stages[stage] = [];
    stages[stage].push(key);
  }

  for (const [stage, agents] of (Object.entries(stages) as [string, any][])) {
    md.push('');
    md.push('  ' + stage.toUpperCase());
    md.push('  ' + '─'.repeat(40));
    
    for (const key of agents) {
      const agent = registry.get(key);
      const deps = agent ? (agent.metadata.dependencies || []) : [] as any[];
      if (deps.length > 0) {
        md.push('  │  ' + key + '  ←  ' + deps.join(', '));
      } else {
        md.push('  │  ' + key + '  (no dependencies)');
      }
    }
  }
  md.push('  └' + '─'.repeat(40));
  md.push('```');
  md.push('');

  // 4. Full Dependency List
  md.push('## 4. Complete Dependency List');
  md.push('');
  md.push('| Agent | Dependencies | Stage | Priority |');
  md.push('|---|---|---|---|');

  for (const key of topoOrder) {
    const agent = registry.get(key);
    if (!agent) continue;
    const m = agent.metadata;
    const deps = (m.dependencies || []).join(', ') || 'none';
    md.push('| ' + key + ' | ' + deps + ' | ' + (m.executionStage || '?') + ' | ' + (m.priority || 50) + ' |');
  }
  md.push('');

  // 5. Stage Summary
  md.push('## 5. Stage Summary');
  md.push('');
  md.push('| Stage | Agent Count | Key Agents |');
  md.push('|---|---|---|');
  for (const [stage, agents] of (Object.entries(stages) as [string, any][])) {
    const count = agents.length;
    const sample = agents.slice(0, 5).join(', ') + (agents.length > 5 ? '...' : '');
    md.push('| ' + stage + ' | ' + count + ' | ' + sample + ' |');
  }
  md.push('');

  // 6. Topological invariants
  md.push('## 6. Topological Invariants');
  md.push('');
  md.push('- **DAG Status:** ' + (cycles.length === 0 ? 'Valid' : 'Invalid'));
  md.push('- **Total Agents:** ' + all.length);
  md.push('- **Agents with Dependencies:** ' + all.filter(a => (a.metadata.dependencies || []).length > 0).length);
  md.push('- **Root Agents (no deps):** ' + all.filter(a => (a.metadata.dependencies || []).length === 0).map(a => a.key).join(', '));
  md.push('- **Leaf Agents (depended by none):** (calculated from graph)');
  md.push('');

  fs.writeFileSync(reportPath, md.join('\n'), 'utf8');
  console.log('Dependency graph report written to: ' + reportPath);
}

main().catch(e => { console.error(e); process.exit(1); });
