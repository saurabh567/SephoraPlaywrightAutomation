#!/usr/bin/env node
/**
 * runtimeValidation.js
 *
 * Executes every reachable agent through the orchestrator pipeline,
 * traces all execution, and generates runtime validation reports.
 *
 * Output:
 *   reports/runtime/agent-runtime-execution-matrix.md
 *   reports/runtime/agent-runtime-trace.json
 *   reports/runtime/agent-dependency-graph-runtime.md
 */

const fs = require('fs-extra');
const path = require('path');
const registry = require('../ai/core/AgentRegistry');
const router = require('../ai/core/AgentRouter');

const REPORTS_DIR = path.join(process.cwd(), 'reports', 'runtime');

async function main() {
  fs.ensureDirSync(REPORTS_DIR);
  console.log('══════════════════════════════════════════════');
  console.log('  Runtime Execution Validation');
  console.log('══════════════════════════════════════════════\n');

  await registry.discover();
  const allAgents = registry.getAll();
  const cycles = registry.detectCircularDependencies();

  console.log('Registry: ' + allAgents.length + ' agents, ' + cycles.length + ' cycles\n');

  // Build execution plan for multiple contexts
  const contexts = [
    { name: 'Web Clean', opts: { platform: 'WEB', hasFailures: false } },
    { name: 'Web Failures', opts: { platform: 'WEB', hasFailures: true } },
    { name: 'CI Mode', opts: { platform: 'WEB', hasFailures: true, isCI: true } },
    { name: 'Force Full', opts: { platform: 'WEB', forceFull: true } },
    { name: 'Android', opts: { platform: 'ANDROID', hasFailures: false } },
    { name: 'API', opts: { platform: 'API', hasFailures: false } }
  ];

  const allTraces = {};
  const agentExecutions = {};
  const allPlans = {};

  for (const ctx of contexts) {
    console.log('Planning: ' + ctx.name + '...');
    const plan = await router.buildPlan(ctx.opts);
    allPlans[ctx.name] = plan;

    // Execute each agent in the plan with full tracing
    for (const entry of plan.plan) {
      const agentKey = entry.key;
      if (!agentExecutions[agentKey]) {
        agentExecutions[agentKey] = { executions: [], totalDuration: 0, successCount: 0, failureCount: 0 };
      }

      const trace = {
        agent: agentKey,
        name: entry.metadata.name || agentKey,
        stage: entry.stage,
        priority: entry.priority,
        context: ctx.name,
        platform: ctx.opts.platform || 'WEB',
        invokedBy: 'AgentRouter.executeAgents',
        dependencies: entry.dependsOn,
        startTime: null,
        endTime: null,
        duration: null,
        input: { platform: ctx.opts.platform, context: ctx.name },
        output: null,
        error: null,
        status: 'pending',
        skipped: false,
        skipReason: null,
        downstream: []
      };

      const startTime = Date.now();
      trace.startTime = new Date().toISOString();

      try {
        const agentModule = entry.module;
        let result;
        if (typeof agentModule.run === 'function') {
          result = await agentModule.run({ platform: ctx.opts.platform, phase: 'runtime-validation' });
        } else if (agentModule.default && typeof agentModule.default.run === 'function') {
          result = await agentModule.default.run();
        } else if (typeof agentModule === 'function' && agentModule.prototype && typeof agentModule.prototype.run === 'function') {
          const instance = new agentModule({ platform: ctx.opts.platform, phase: 'runtime-validation' });
          result = await instance.run();
        } else {
          trace.status = 'noop';
          trace.output = 'Agent has no run() method (utility module)';
          agentExecutions[agentKey].executions.push(trace);
          continue;
        }

        trace.status = 'success';
        trace.output = result;
        agentExecutions[agentKey].successCount++;

      } catch (err) {
        trace.status = 'failed';
        trace.error = err.message;
        trace.output = null;
        agentExecutions[agentKey].failureCount++;
        console.warn('  [⚠] ' + agentKey + ': ' + err.message);
      }

      trace.endTime = new Date().toISOString();
      trace.duration = Date.now() - startTime;
      agentExecutions[agentKey].totalDuration += trace.duration;
      agentExecutions[agentKey].executions.push(trace);

      // Track in allTraces by context+agent
      if (!allTraces[ctx.name]) allTraces[ctx.name] = {};
      allTraces[ctx.name][agentKey] = trace;
    }

    // Track skipped agents
    for (const skip of plan.skipped) {
      if (!agentExecutions[skip.key]) {
        agentExecutions[skip.key] = { executions: [], totalDuration: 0, successCount: 0, failureCount: 0 };
      }
      agentExecutions[skip.key].executions.push({
        agent: skip.key,
        context: ctx.name,
        status: 'skipped',
        skipReason: skip.reason,
        duration: 0
      });
    }
  }

  // Build downstream consumer map
  for (const [ctxName, traces] of Object.entries(allTraces)) {
    for (const [agentKey, trace] of Object.entries(traces)) {
      if (trace.dependencies && trace.dependencies.length > 0) {
        for (const dep of trace.dependencies) {
          if (allTraces[ctxName][dep]) {
            if (!allTraces[ctxName][dep].downstream) allTraces[ctxName][dep].downstream = [];
            if (!allTraces[ctxName][dep].downstream.includes(agentKey)) {
              allTraces[ctxName][dep].downstream.push(agentKey);
            }
          }
        }
      }
    }
  }

  // Compute overall utilization
  const registeredAgents = allAgents.filter(a => a.hasRun || a.metadata.lifecycle === 'active');
  const executedAgents = new Set();
  for (const [ctxName, traces] of Object.entries(allTraces)) {
    for (const agentKey of Object.keys(traces)) {
      executedAgents.add(agentKey);
    }
  }
  const neverExecuted = registeredAgents.filter(a => !executedAgents.has(a.key));
  const utilization = Math.round((executedAgents.size / registeredAgents.length) * 100);

  console.log('\nExecuted: ' + executedAgents.size + '/' + registeredAgents.length + ' (' + utilization + '%)');
  if (neverExecuted.length > 0) {
    console.log('Not executed: ' + neverExecuted.map(a => a.key).join(', '));
  }

  // ══════════════════════════════════════════════
  // Generate Report 1: Execution Matrix (Markdown)
  // ══════════════════════════════════════════════
  const matrixMd = generateExecutionMatrix(allTraces, allPlans, agentExecutions, executedAgents, neverExecuted, utilization, registeredAgents);
  fs.writeFileSync(path.join(REPORTS_DIR, 'agent-runtime-execution-matrix.md'), matrixMd, 'utf8');
  console.log('  [✓] agent-runtime-execution-matrix.md');

  // ══════════════════════════════════════════════
  // Generate Report 2: Trace JSON
  // ══════════════════════════════════════════════
  const traceData = {
    generatedAt: new Date().toISOString(),
    totalAgents: registeredAgents.length,
    executedAgents: executedAgents.size,
    utilizationPercent: utilization,
    contexts: Object.keys(allPlans).map(k => ({ name: k, planned: allPlans[k].stats.planned, skipped: allPlans[k].stats.skipped })),
    agents: {}
  };
  for (const [key, data] of Object.entries(agentExecutions)) {
    traceData.agents[key] = {
      totalExecutions: data.executions.length,
      totalDuration: data.totalDuration,
      successCount: data.successCount,
      failureCount: data.failureCount,
      executions: data.executions
    };
  }
  fs.writeJsonSync(path.join(REPORTS_DIR, 'agent-runtime-trace.json'), traceData, { spaces: 2 });
  console.log('  [✓] agent-runtime-trace.json');

  // ══════════════════════════════════════════════
  // Generate Report 3: Runtime Dependency Graph
  // ══════════════════════════════════════════════
  const depGraphMd = generateRuntimeDepGraph(allTraces, allPlans, agentExecutions, cycles);
  fs.writeFileSync(path.join(REPORTS_DIR, 'agent-dependency-graph-runtime.md'), depGraphMd, 'utf8');
  console.log('  [✓] agent-dependency-graph-runtime.md');

  console.log('\n' + '═'.repeat(50));
  console.log('Runtime validation complete.');
  console.log('Reports: reports/runtime/');
  console.log('Utilization: ' + utilization + '%');
  console.log('' + '═'.repeat(50));
}

function generateExecutionMatrix(allTraces, allPlans, agentExecutions, executedAgents, neverExecuted, utilization, registeredAgents) {
  let md = '# Agent Runtime Execution Matrix\n\n';
  md += '**Generated:** ' + new Date().toISOString() + '\n';
  md += '**Total Registered Agents:** ' + registeredAgents.length + '\n';
  md += '**Agents Executed:** ' + executedAgents.size + '\n';
  md += '**Overall Utilization:** ' + utilization + '%\n\n';

  md += '## Execution Plan by Context\n\n';
  md += '| Context | Planned | Skipped | Executed | Passed | Failed |\n';
  md += '|---|---|---|---|---|---|\n';
  for (const [ctxName, plan] of Object.entries(allPlans)) {
    const traces = allTraces[ctxName] || {};
    const success = Object.values(traces).filter(t => t.status === 'success').length;
    const failed = Object.values(traces).filter(t => t.status === 'failed').length;
    const skipped = plan.stats.skipped;
    md += '| ' + ctxName + ' | ' + plan.stats.planned + ' | ' + skipped + ' | ' + Object.keys(traces).length + ' | ' + success + ' | ' + failed + ' |\n';
  }

  md += '\n## Agent Execution Details\n\n';
  md += '| Agent | Stage | Contexts | Executions | Success | Failed | Total Duration | Avg Duration | Status |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';

  const sorted = [...registeredAgents].sort((a, b) => a.key.localeCompare(b.key));
  for (const agent of sorted) {
    const exec = agentExecutions[agent.key];
    if (!exec) {
      md += '| ' + agent.key + ' | ' + (agent.metadata.executionStage || '?') + ' | - | 0 | - | - | - | - | ⏭ never invoked |\n';
      continue;
    }
    const contexts = new Set(exec.executions.map(e => e.context).filter(Boolean));
    const success = exec.successCount;
    const failed = exec.failureCount;
    const total = success + failed;
    const avgDur = total > 0 ? Math.round(exec.totalDuration / total) + 'ms' : '-';
    const status = failed > 0 ? '⚠️ partial' : total > 0 ? '✅ passed' : '⏭ skipped';
    md += '| ' + agent.key + ' | ' + (agent.metadata.executionStage || '?') + ' | ' + [...contexts].join(', ') + ' | ' + total + ' | ' + success + ' | ' + failed + ' | ' + exec.totalDuration + 'ms | ' + avgDur + ' | ' + status + ' |\n';
  }

  md += '\n## Agents Not Executed\n\n';
  if (neverExecuted.length > 0) {
    md += '| Agent | Lifecycle | Reason |\n';
    md += '|---|---|---|\n';
    for (const a of neverExecuted) {
      const reason = a.metadata.lifecycle === 'on_demand' ? 'On-demand agent (not triggered by any context)' :
                     !a.hasRun ? 'Utility module (no run() method)' :
                     'Condition not met in any test context';
      md += '| ' + a.key + ' | ' + (a.metadata.lifecycle || 'active') + ' | ' + reason + ' |\n';
    }
  } else {
    md += 'All registered agents were executed in at least one context.\n';
  }

  md += '\n## Context Plan Comparisons\n\n';
  for (const [ctxName, plan] of Object.entries(allPlans)) {
    const traces = allTraces[ctxName] || {};
    md += '### ' + ctxName + ' (' + plan.stats.planned + ' agents)\n\n';
    md += '```\n';
    for (const entry of plan.plan) {
      const trace = traces[entry.key];
      const status = trace ? trace.status : 'planned';
      const dur = trace ? (trace.duration || 0) + 'ms' : '-';
      md += '  ' + entry.key.padEnd(30) + ' [' + status.padEnd(8) + '] ' + dur + '\n';
    }
    md += '```\n\n';
  }

  return md;
}

function generateRuntimeDepGraph(allTraces, allPlans, agentExecutions, cycles) {
  let md = '# Runtime Dependency Graph\n\n';
  md += '**Generated:** ' + new Date().toISOString() + '\n\n';

  md += '## Circular Dependencies\n\n';
  md += cycles.length === 0 ? '✅ None detected (valid DAG)\n\n' : '❌ ' + cycles.length + ' cycles: ' + cycles.join(', ') + '\n\n';

  md += '## Runtime Execution Flow (Web Failures context)\n\n';
  md += '```\n';
  const webFailures = allTraces['Web Failures'] || {};
  const plan = allPlans['Web Failures'];
  if (plan) {
    for (const entry of plan.plan) {
      const trace = webFailures[entry.key];
      const status = trace ? trace.status : 'planned';
      const dur = trace ? (trace.duration || 0) + 'ms' : '-';
      const deps = entry.dependsOn.length > 0 ? ' [after: ' + entry.dependsOn.join(', ') + ']' : '';
      md += '  ' + entry.key.padEnd(30) + ' [' + status.padEnd(8) + '] ' + dur.padEnd(10) + deps + '\n';
    }
  }
  md += '```\n\n';

  md += '## Downstream Consumers (Web Failures)\n\n';
  md += '| Agent | Consumed By |\n';
  md += '|---|---|\n';
  for (const [agentKey, trace] of Object.entries(webFailures)) {
    if (trace.downstream && trace.downstream.length > 0) {
      md += '| ' + agentKey + ' | ' + trace.downstream.join(', ') + ' |\n';
    }
  }

  return md;
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
