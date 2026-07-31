#!/usr/bin/env node
/**
 * ai/index.ts
 *
 * Beginner-friendly AI CLI. Routes to agents via the AgentRegistry (auto-discovered).
 * Supports direct agent invocation, batch runs, and post-test analysis.
 *
 * Usage:
 *   node ai/index.ts --agent TestCaseGenerationAgent
 *   node ai/index.ts --all
 *   node ai/index.ts --post-test
 *   node ai/index.ts --list
 *   node ai/index.ts --list-active
 */

import registry from './core/AgentRegistry';
import path from 'path';
import fs from 'fs-extra';

interface CliArgs {
  all?: boolean;
  postTest?: boolean;
  list?: boolean;
  listActive?: boolean;
  info?: string;
  agent?: string;
  [key: string]: string | boolean | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--all') {
      args.all = true;
    } else if (token === '--post-test') {
      args.postTest = true;
    } else if (token === '--list') {
      args.list = true;
    } else if (token === '--list-active') {
      args.listActive = true;
    } else if (token === '--info') {
      args.info = argv[index + 1];
      index += 1;
    } else if (token.startsWith('--')) {
      args[token.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function listAgents(): Promise<void> {
  await registry.discover();
  const all = registry.getAll();
  const stats = registry.getStats();

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║     Agent Registry (${all.length} agents)`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  console.log(`${'Key'.padEnd(30)} ${'Name'.padEnd(32)} Stage`.padEnd(20) + 'Lifecycle');
  console.log(`${'─'.repeat(30)} ${'─'.repeat(32)} ${'─'.repeat(16)} ${'─'.repeat(12)}`);
  for (const agent of all.sort((a, b) => a.key.localeCompare(b.key))) {
    const m = agent.metadata;
    console.log(`${agent.key.padEnd(30)} ${(m.name || '?').padEnd(32)} ${(m.executionStage || '?').padEnd(16)} ${(m.lifecycle || '?').padEnd(12)}`);
  }

  console.log(`\n  Total: ${stats.totalAgents} | Stages: ${(Object.entries(stats.byStage) as [string, any][]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  Lifecycles: ${(Object.entries(stats.byLifecycle) as [string, any][]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log('');
}

async function showAgentInfo(agentKey: string): Promise<void> {
  await registry.discover();
  let agent = registry.get(agentKey);
  if (!agent) agent = registry.getByName(agentKey);
  if (!agent) agent = registry.getAll().find(a => a.key.toLowerCase() === agentKey.toLowerCase());
  if (!agent) {
    console.error(`Agent '${agentKey}' not found in registry.`);
    console.log(`Available agents: ${registry.getAll().map(a => a.key).join(', ')}`);
    process.exit(1);
  }

  const m = agent.metadata;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║     Agent: ${m.name}`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  console.log(`  Key:         ${agent.key}`);
  console.log(`  File:        ${agent.filePath}`);
  console.log(`  Version:     ${m.version || '1.0.0'}`);
  console.log(`  Description: ${m.description || 'N/A'}`);
  console.log(`  Stage:       ${m.executionStage || 'N/A'}`);
  console.log(`  Priority:    ${m.priority || 50}`);
  console.log(`  Lifecycle:   ${m.lifecycle || 'active'}`);
  console.log(`  Platforms:   ${(m.platforms || []).join(', ')}`);
  console.log(`  Tags:        ${(m.tags || []).join(', ')}`);
  console.log(`  Methods:     ${agent.methods.join(', ')}`);
  console.log(`  Has run():   ${agent.hasRun}`);
  console.log(`  Dependencies: ${(m.dependencies || []).join(', ') || 'none'}`);
  console.log(`  Conditions:  ${JSON.stringify(m.conditions || [])}`);
  console.log(`  Retry:       ${JSON.stringify(m.retryPolicy || {})}`);
  console.log('');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Discover the registry before any operation
  await registry.discover();

  if (args.list) {
    await listAgents();
    return;
  }

  if (args.listActive) {
    await registry.discover();
    const active = registry.getByLifecycle('active');
    console.log(`\nActive agents (${active.length}):\n`);
    for (const a of active.sort((x, y) => (x.metadata.priority || 50) - (y.metadata.priority || 50))) {
      console.log(`  ${a.key.padEnd(30)} [${(a.metadata.executionStage || '?').padEnd(12)}] ${a.metadata.name}`);
    }
    console.log('');
    return;
  }

  if (args.info) {
    await showAgentInfo(args.info);
    return;
  }

  if (args.all) {
    const order = [
      'testCaseGenerationAgent',
      'featureFileGenerationAgent',
      'stepDefinitionGenerationAgent',
      'pageObjectGenerationAgent',
      'jenkinsBuildFailureAnalysisAgent',
      'playwrightCodeReviewAgent',
      'selfHealingAutomationAgent'
    ];

    interface RunResult { agent: string; status: string; result?: unknown; error?: string; }
    const results: RunResult[] = [];
    for (const agentName of order) {
      const agent = registry.get(agentName);
      if (agent && typeof agent.module.run === 'function') {
        try {
          console.log(`[AI] Running ${agentName}...`);
          const result = await agent.module.run();
          results.push({ agent: agentName, status: 'completed', result });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[AI] ${agentName} failed: ${message}`);
          results.push({ agent: agentName, status: 'failed', error: message });
        }
      }
    }

    const memoryPath = path.join(process.cwd(), 'ai/memory/agent-run-history.json');
    fs.ensureDirSync(path.dirname(memoryPath));
    const history = fs.existsSync(memoryPath) ? fs.readJsonSync(memoryPath) : [] as any[];
    history.push({
      runType: 'ai-all-run',
      executedAt: new Date().toISOString(),
      results
    });
    fs.writeJsonSync(memoryPath, history, { spaces: 2 });
    return;
  }

  if (args.postTest) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const workflow = require('./workflows/runPostExecutionAgents');
    const result = await workflow.run();
    const memoryPath = path.join(process.cwd(), 'ai/memory/agent-run-history.json');
    fs.ensureDirSync(path.dirname(memoryPath));
    const history = fs.existsSync(memoryPath) ? fs.readJsonSync(memoryPath) : [] as any[];
    history.push({
      runType: 'post-test-rag-analysis',
      executedAt: new Date().toISOString(),
      results: [result]
    });
    fs.writeJsonSync(memoryPath, history, { spaces: 2 });
    return;
  }

  if (args.agent) {
    const agentName = args.agent;
    let agent = registry.get(agentName);
    if (!agent) agent = registry.getByName(agentName);
    if (!agent) agent = registry.getAll().find(a => a.key.toLowerCase() === agentName.toLowerCase());
    if (!agent) {
      console.error(`Unknown agent: ${agentName}`);
      console.log(`Available agents: ${registry.getAll().map(a => a.key).join(', ')}`);
      process.exit(1);
    }

    if (typeof agent.module.run !== 'function') {
      console.error(`Agent '${agentName}' does not expose a run() method.`);
      process.exit(1);
    }

    const result = await agent.module.run();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Usage:');
  console.log('  node ai/index.ts --agent <AgentName>');
  console.log('  node ai/index.ts --all');
  console.log('  node ai/index.ts --post-test');
  console.log('  node ai/index.ts --list');
  console.log('  node ai/index.ts --list-active');
  console.log('  node ai/index.ts --info <AgentName>');
}

main().catch((error: unknown) => {
  console.error(`[AI] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
