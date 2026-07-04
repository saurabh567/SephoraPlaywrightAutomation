#!/usr/bin/env node
/**
 * unifiedOrchestrator.js
 *
 * Enterprise master orchestrator.
 * Uses AgentRegistry for auto-discovery, AgentRouter for context-aware execution,
 * and EventBus for event-driven agent communication.
 *
 * Execution phases:
 *   0. Pre-flight  – AI services, environment, readiness
 *   1. Execution   – platform test execution (Web/Android/iOS/API)
 *   2. AI Analysis – ingestion, failure analysis, healing, RCA, reporting
 *   3. Multi-Agent – impact, visual, anomaly, release gate, monitoring
 *   4. Reporting   – consolidated reports, dashboard, telemetry
 *   5. Cleanup     – Appium stop, exit handling
 *
 * Each phase uses the AgentRouter to determine which agents should run
 * based on the current execution context (platform, failures, CI mode, etc.).
 *
 * Usage:
 *   node ai/orchestrator/unifiedOrchestrator.js              # Full pipeline
 *   node ai/orchestrator/unifiedOrchestrator.js --platform WEB
 *   node ai/orchestrator/unifiedOrchestrator.js --skip-analysis
 *   node ai/orchestrator/unifiedOrchestrator.js --dry-run     # Show plan only
 */

const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');

// ─── Core Infrastructure ──────────────────────────────────────────────────
const registry = require('../core/AgentRegistry');
const router = require('../core/AgentRouter');
const bus = require('../core/EventBus');
const healthTracker = require('../core/AgentHealthTracker');
const ollamaManager = require('../health/ollamaManager');
const chromaManager = require('../vector-db/chromaServerManager');
const unifiedHealth = require('../health/unifiedHealth');

// ─── Constants ─────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const MEMORY_DIR = path.join(ROOT, 'ai', 'memory');
const REPORTS_AI_DIR = path.join(ROOT, 'reports', 'ai');
const REPORTS_JSON_DIR = path.join(ROOT, 'reports', 'json');

function ensureDirs() { fs.ensureDirSync(MEMORY_DIR); fs.ensureDirSync(REPORTS_AI_DIR); fs.ensureDirSync(REPORTS_JSON_DIR); }
function timestamp() { return new Date().toISOString(); }

// ─── Execute agents from a router plan ─────────────────────────────────────

async function executeAgents(plan, phaseId, options) {
  const results = {};
  try {
    const registry = require('../core/AgentRegistry');
    await healthTracker.initializeFromRegistry(registry);
  } catch (e) {}

  for (const entry of plan) {
    const agentKey = entry.key;
    const agentModule = entry.module;
    const agentName = entry.metadata.name || agentKey;

    console.log('  [Phase ' + phaseId + '] ' + agentName + '...');
    bus.emit(bus.EVENTS.AGENT_EXECUTION_STARTED, { agent: agentKey, phase: phaseId });

    const startTime = Date.now();

    try {
      let result;
      if (typeof agentModule.run === 'function') {
        result = await agentModule.run({ platform: options.platform, phase: phaseId });
      } else if (agentModule.default && typeof agentModule.default.run === 'function') {
        result = await agentModule.default.run();
      } else if (typeof agentModule === 'function' && agentModule.prototype && typeof agentModule.prototype.run === 'function') {
        const instance = new agentModule(options);
        result = await instance.run();
      } else {
        console.log('  [⚠] ' + agentName + ': no run() method found');
        healthTracker.recordExecution(agentKey, { ok: false, duration: Date.now() - startTime, error: 'no run() method' });
        bus.emit(bus.EVENTS.AGENT_EXECUTION_FAILED, { agent: agentKey, error: 'no run() method' });
        continue;
      }

      const duration = Date.now() - startTime;
      results[agentKey] = { ok: true, result };
      healthTracker.recordExecution(agentKey, { ok: true, duration: duration, status: 'completed' });
      bus.emit(bus.EVENTS.AGENT_EXECUTION_COMPLETED, { agent: agentKey, status: 'completed', duration: duration });

    } catch (err) {
      const duration = Date.now() - startTime;
      console.warn('  [⚠] ' + agentName + ': ' + err.message);
      results[agentKey] = { ok: false, error: err.message };
      healthTracker.recordExecution(agentKey, { ok: false, duration: duration, error: err.message });
      bus.emit(bus.EVENTS.AGENT_EXECUTION_FAILED, { agent: agentKey, error: err.message });
    }
  }
  return results;
}

// ─── Phase 0: Pre-flight ───────────────────────────────────────────────────

async function phase0Preflight(contextOptions) {
  bus.emit(bus.EVENTS.ORCHESTRATOR_STARTED);
  await registry.discover();

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 0: Pre-flight');
  console.log('══════════════════════════════════════════════\n');

  const results = { services: {}, environment: {} };

  // Infrastructure checks
  try { const h = await unifiedHealth.run(); results.services.unifiedHealth = { ok: true, summary: h.summary || 'ok' }; console.log('  [✓] Unified Health'); }
  catch (e) { results.services.unifiedHealth = { ok: false, error: e.message }; console.warn('  [⚠] Health:', e.message); }

  try { const o = await ollamaManager.ensureRunning(); results.services.ollama = { ok: true }; console.log('  [✓] Ollama'); }
  catch (e) { results.services.ollama = { ok: false, error: e.message }; console.warn('  [⚠] Ollama:', e.message); bus.emit(bus.EVENTS.OLLAMA_FAILED, { error: e.message }); }

  try { const c = await chromaManager.ensureRunning(); results.services.chroma = { ok: true }; console.log('  [✓] Chroma'); }
  catch (e) { results.services.chroma = { ok: false, error: e.message }; console.warn('  [⚠] Chroma:', e.message); bus.emit(bus.EVENTS.CHROMA_FAILED, { error: e.message }); }

  results.environment = {
    platform: (process.env.TEST_PLATFORM || 'WEB').toUpperCase(),
    browser: process.env.BROWSER || 'chromium',
    headless: process.env.HEADLESS !== 'false'
  };

  // Router-based preflight agents (mcpHealthCheck, EcosystemReadiness, Planner, SmartSelector)
  const preflightPlan = await router.buildPlan({
    ...contextOptions,
    onlyStage: 'preflight'
  });

  if (preflightPlan.plan.length > 0) {
    console.log(`  Executing ${preflightPlan.plan.length} preflight agents...`);
    const agentResults = await executeAgents(preflightPlan.plan, '0', contextOptions);
    results.agents = agentResults;
  }

  bus.emit(bus.EVENTS.ENVIRONMENT_READY, { platform: results.environment.platform });
  return results;
}

// ─── Phase 1: Execution ────────────────────────────────────────────────────

async function phase1Execution(contextOptions) {
  bus.emit(bus.EVENTS.PHASE_STARTED, { phase: 'execution' });

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 1: Platform Execution');
  console.log('══════════════════════════════════════════════\n');

  const platform = (contextOptions.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
  const isMobile = platform === 'ANDROID' || platform === 'IOS';
  const results = { platform, exitCode: null };

  // Appium for mobile
  if (isMobile) {
    const appiumEntry = registry.get('AppiumAgent');
    if (appiumEntry && typeof appiumEntry.module.startServerIfNeeded === 'function') {
      try {
        await appiumEntry.module.startServerIfNeeded();
        results.appiumStarted = true;
        bus.emit(bus.EVENTS.APPIUM_STARTED);
        console.log('  [✓] Appium ready');
      } catch (e) { console.warn('  [⚠] Appium:', e.message); }
    }
  }

  // Execute router-selected execution agents
  const execPlan = await router.buildPlan({
    ...contextOptions,
    onlyStage: 'execution'
  });

  if (execPlan.plan.length > 0) {
    console.log(`  Executing ${execPlan.plan.length} execution agents on ${platform}...`);
    const agentResults = await executeAgents(execPlan.plan, '1', contextOptions);
    results.agentResults = agentResults;

    // Extract exit code from TestExecutionAgent
    if (agentResults.TestExecutionAgent && agentResults.TestExecutionAgent.ok) {
      const execData = agentResults.TestExecutionAgent.result;
      results.exitCode = execData && execData.exitCode !== undefined ? execData.exitCode : 0;
      results.execResult = execData;
    } else if (agentResults.TestExecutionAgent && !agentResults.TestExecutionAgent.ok) {
      results.exitCode = 1;
      results.execError = agentResults.TestExecutionAgent.error;
    }
  }

  // Appium cleanup
  if (isMobile) {
    const appiumEntry = registry.get('AppiumAgent');
    if (appiumEntry && typeof appiumEntry.module.stopServerIfStartedByFramework === 'function') {
      try { await appiumEntry.module.stopServerIfStartedByFramework(); bus.emit(bus.EVENTS.APPIUM_STOPPED); }
      catch (e) { console.warn('  [⚠] Appium stop:', e.message); }
    }
  }

  bus.emit(bus.EVENTS.TEST_EXECUTION_COMPLETED, { platform, exitCode: results.exitCode });
  return results;
}

// ─── Phase 2: AI Analysis ──────────────────────────────────────────────────

async function phase2AIAnalysis(execPhase, contextOptions) {
  bus.emit(bus.EVENTS.PHASE_STARTED, { phase: 'analysis' });
  const platform = execPhase ? execPhase.platform : 'WEB';
  const hasFailures = execPhase && execPhase.exitCode !== 0;

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 2: AI Analysis Pipeline');
  console.log('══════════════════════════════════════════════\n');

  const results = {};

  // Ingestion
  try {
    spawnSync('node', [path.join('ai', 'local', 'localIngest.js')], { stdio: 'inherit', env: process.env });
    results.ingestion = { ok: true };
    console.log('  [✓] Vector store ingested');
    bus.emit(bus.EVENTS.VECTOR_STORE_INGESTED);
  } catch (e) { console.warn('  [⚠] Ingestion:', e.message); }

  // Canonicalize report
  try {
    await canonicalizeCucumberReport();
    results.canonicalReport = { ok: true };
    console.log('  [✓] Report canonicalized');
  } catch (e) { console.warn('  [⚠] Report:', e.message); }

  // Build analysis context and execute router-selected analysis agents
  const analysisContext = {
    ...contextOptions,
    platform,
    hasFailures,
    hasResults: hasFailures,
    hasLocatorFailures: hasFailures,
    exitCode: execPhase ? execPhase.exitCode : 0,
    onlyStage: 'analysis'
  };

  const analysisPlan = await router.buildPlan(analysisContext);
  if (analysisPlan.plan.length > 0) {
    console.log(`  Executing ${analysisPlan.plan.length} analysis agents...`);
    const agentResults = await executeAgents(analysisPlan.plan, '2', { platform, ...contextOptions });
    results.agents = agentResults;
  } else {
    console.log('  [−] No analysis agents selected by router');
  }

  bus.emit(bus.EVENTS.ANALYSIS_STARTED);
  return results;
}

// ─── Phase 3: Multi-Agent ──────────────────────────────────────────────────

async function phase3MultiAgent(execPhase, contextOptions) {
  bus.emit(bus.EVENTS.PHASE_STARTED, { phase: 'multi-agent' });

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 3: Multi-Agent Pipeline');
  console.log('══════════════════════════════════════════════\n');

  const platform = execPhase ? execPhase.platform : 'WEB';
  const hasFailures = execPhase && execPhase.exitCode !== 0;

  const multiContext = {
    ...contextOptions,
    platform,
    hasFailures,
    hasResults: hasFailures,
    exitCode: execPhase ? execPhase.exitCode : 0,
    onlyStage: 'multi-agent'
  };

  const multiPlan = await router.buildPlan(multiContext);
  if (multiPlan.plan.length > 0) {
    console.log(`  Executing ${multiPlan.plan.length} multi-agent pipeline agents...`);
    const agentResults = await executeAgents(multiPlan.plan, '3', { platform, ...contextOptions });
    return { agents: agentResults };
  }

  console.log('  [−] No multi-agent agents selected');
  return {};
}

// ─── Phase 4: Reporting ────────────────────────────────────────────────────

async function phase4Reporting(execPhase, contextOptions) {
  bus.emit(bus.EVENTS.PHASE_STARTED, { phase: 'reporting' });
  bus.emit(bus.EVENTS.REPORT_GENERATION_STARTED);

  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 4: Reporting');
  console.log('══════════════════════════════════════════════\n');

  const platform = execPhase ? execPhase.platform : 'WEB';
  const hasFailures = execPhase && execPhase.exitCode !== 0;

  const reportContext = {
    ...contextOptions,
    platform,
    hasFailures,
    exitCode: execPhase ? execPhase.exitCode : 0,
    onlyStage: 'reporting'
  };

  const reportPlan = await router.buildPlan(reportContext);
  const results = {};

  if (reportPlan.plan.length > 0) {
    console.log(`  Executing ${reportPlan.plan.length} reporting agents...`);
    const agentResults = await executeAgents(reportPlan.plan, '4', { platform, ...contextOptions });
    results.agents = agentResults;
  }

  // Dashboard generation (standalone utility)
  try {
    const dashResult = spawnSync('node', ['utils/runDashboard.js'], { stdio: 'inherit', env: process.env });
    results.dashboard = { ok: dashResult.status === 0 };
    console.log(`  [${results.dashboard.ok ? '✓' : '⚠'}] Dashboard generated`);
    bus.emit(bus.EVENTS.DASHBOARD_GENERATION_COMPLETED, { ok: results.dashboard.ok });
  } catch (e) { console.warn('  [⚠] Dashboard:', e.message); }

  // Telemetry
  const telemetry = {
    executedAt: timestamp(),
    platform,
    exitCode: execPhase ? execPhase.exitCode : 0,
    registry: registry.getStats()
  };
  const telemetryPath = path.join(REPORTS_AI_DIR, 'orchestrator-telemetry.json');
  fs.writeJsonSync(telemetryPath, telemetry, { spaces: 2 });

  bus.emit(bus.EVENTS.REPORT_GENERATION_COMPLETED);
  return results;
}

// ─── Phase 5: Cleanup ──────────────────────────────────────────────────────

async function phase5Cleanup() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Phase 5: Cleanup');
  console.log('══════════════════════════════════════════════\n');

  const appiumEntry = registry.get('AppiumAgent');
  if (appiumEntry && typeof appiumEntry.module.stopServerIfStartedByFramework === 'function') {
    try { await appiumEntry.module.stopServerIfStartedByFramework(); console.log('  [✓] Appium cleaned up'); }
    catch (e) { console.warn('  [⚠] Appium:', e.message); }
  }

  console.log('  [✓] Cleanup complete');
}

// ─── Helper: Canonicalize Cucumber Report ──────────────────────────────────

async function canonicalizeCucumberReport() {
  function findReport(dir) {
    if (!fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      let stat; try { stat = fs.statSync(full); } catch (ex) { continue; }
      if (stat.isDirectory()) {
        const flat = path.join(full, 'cucumber-report.json');
        if (fs.existsSync(flat)) return flat;
        const nested = path.join(full, 'json', 'cucumber-report.json');
        if (fs.existsSync(nested)) return nested;
        const deeper = findReport(full);
        if (deeper) return deeper;
      }
    }
    return null;
  }

  async function waitForValidJson(filePath, timeout = 30000, interval = 500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const raw = fs.readFileSync(filePath, 'utf8'); if (raw.trim() && JSON.parse(raw)) return true; }
      catch (e) { await new Promise(r => setTimeout(r, interval)); }
    }
    return false;
  }

  const found = findReport(path.join(ROOT, 'reports'));
  if (found) {
    const ok = await waitForValidJson(found);
    if (ok) {
      const dest = path.join(REPORTS_JSON_DIR, 'cucumber-report.json');
      fs.ensureDirSync(REPORTS_JSON_DIR);
      fs.copyFileSync(found, dest);
      return { source: found, dest };
    }
  }

  const topLevel = path.join(ROOT, 'reports', 'cucumber-report.json');
  if (fs.existsSync(topLevel)) {
    const dest = path.join(REPORTS_JSON_DIR, 'cucumber-report.json');
    fs.copyFileSync(topLevel, dest);
    return { source: topLevel, dest };
  }

  return null;
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────

async function orchestrate(options = {}) {
  const startTime = Date.now();
  ensureDirs();
  await registry.discover();

  const stats = registry.getStats();
  const platform = (options.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     Enterprise AI Automation Orchestrator            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Platform: ${platform}`);
  console.log(`  Mode:     ${process.env.CI ? 'CI' : 'Local'}`);
  console.log(`  Agents:   ${stats.totalAgents} discovered`);
  console.log(`  Dry run:  ${options.dryRun ? 'YES (plan only)' : 'NO'}`);
  console.log('');

  // Build the full execution plan for display
  const fullContext = {
    platform,
    hasFailures: false,     // Will be updated after execution
    isCI: process.env.CI === 'true',
    forceFull: options.forceFull || false
  };

  if (!options.dryRun) {
    const fullPlan = await router.buildPlan(fullContext);
    console.log(`  Execution plan: ${fullPlan.stats.planned} agents in ${Object.keys(fullPlan.plan.reduce((a,e)=>{a[e.stage]=1;return a;},{})).length} stages`);
    console.log('');
  }

  const orchestrationResult = {
    startedAt: timestamp(),
    completedAt: null,
    durationMs: 0,
    phases: {},
    overallStatus: 'running'
  };

  try {
    // Context options that will be updated as we go
    const contextOptions = {
      platform,
      isCI: process.env.CI === 'true',
      forceFull: options.forceFull || false,
      enableRetry: options.enableRetry !== false
    };

    // Phase 0: Pre-flight
    orchestrationResult.phases.preflight = await phase0Preflight(contextOptions);

    // Phase 1: Execution
    const execPhase = await phase1Execution(contextOptions);
    orchestrationResult.phases.execution = execPhase;

    // Update context with execution results
    const hasFailures = execPhase && execPhase.exitCode !== 0;
    contextOptions.hasFailures = hasFailures;
    contextOptions.hasResults = hasFailures || (execPhase && execPhase.execResult !== undefined);
    contextOptions.exitCode = execPhase ? execPhase.exitCode : 0;

    // Phase 2: AI Analysis (only runs if context demands it)
    const analysisPhase = options.skipAnalysis ? null : await phase2AIAnalysis(execPhase, contextOptions);
    orchestrationResult.phases.analysis = analysisPhase;

    // Phase 3: Multi-Agent
    const multiPhase = options.skipMultiAgent ? null : await phase3MultiAgent(execPhase, contextOptions);
    orchestrationResult.phases.multiAgent = multiPhase;

    // Phase 4: Reporting
    const reportPhase = options.skipReporting ? null : await phase4Reporting(execPhase, contextOptions);
    orchestrationResult.phases.reporting = reportPhase;

    // Phase 5: Cleanup
    await phase5Cleanup();

    orchestrationResult.overallStatus = (execPhase && execPhase.exitCode === 0) ? 'passed' : 'failed';
    orchestrationResult.exitCode = execPhase ? execPhase.exitCode : 0;

  } catch (err) {
    bus.emit(bus.EVENTS.ORCHESTRATOR_FAILED, { error: err.message });
    console.error('\n  [✗] Orchestrator fatal:', err.message);
    orchestrationResult.overallStatus = 'error';
    orchestrationResult.error = err.message;
  }

  orchestrationResult.completedAt = timestamp();
  orchestrationResult.durationMs = Date.now() - startTime;

  bus.emit(bus.EVENTS.ORCHESTRATOR_COMPLETED, {
    status: orchestrationResult.overallStatus,
    durationMs: orchestrationResult.durationMs
  });

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     Orchestration Complete                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Status:   ${orchestrationResult.overallStatus}`);
  console.log(`  Duration: ${orchestrationResult.durationMs}ms`);
  console.log(`  Phases:   ${Object.keys(orchestrationResult.phases).length} executed`);
  console.log('');

  return orchestrationResult;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--platform') { args.platform = argv[++i]; }
    else if (t === '--skip-analysis') { args.skipAnalysis = true; }
    else if (t === '--skip-multi-agent') { args.skipMultiAgent = true; }
    else if (t === '--skip-reporting') { args.skipReporting = true; }
    else if (t === '--dry-run') { args.dryRun = true; }
    else if (t === '--force-full') { args.forceFull = true; }
    else if (t === '--ci') { process.env.CI = 'true'; }
    else if (t === '--help' || t === '-h') { args.help = true; }
  }
  return args;
}

if (require.main === module) {
  const cliArgs = parseArgs(process.argv.slice(2));
  if (cliArgs.help) {
    console.log(`
Usage: node ai/orchestrator/unifiedOrchestrator.js [options]
Options:
  --platform <WEB|ANDROID|IOS|API>  Override test platform
  --skip-analysis                   Skip AI analysis pipeline
  --skip-multi-agent                Skip multi-agent pipeline
  --skip-reporting                  Skip reporting phase
  --dry-run                         Show execution plan only, don't execute
  --force-full                      Run all agents regardless of context
  --ci                              Run in CI mode
  --help, -h                        Show this help
`);
    process.exit(0);
  }

  if (cliArgs.dryRun) {
    registry.discover().then(async () => {
      const plan = await router.buildPlan({
        platform: cliArgs.platform || process.env.TEST_PLATFORM || 'WEB',
        isCI: process.env.CI === 'true',
        forceFull: cliArgs.forceFull || false
      });
      console.log(`\nDry Run: ${plan.stats.planned} agents selected (${plan.stats.skipped} skipped)\n`);
      for (const a of plan.plan) {
        const condStr = (a.metadata.conditions || []).map(c => typeof c === 'string' ? c : c.type).join(', ') || 'always';
        console.log(`  ${a.key.padEnd(32)} [${a.stage.padEnd(12)}] priority=${a.priority} when=${condStr}`);
      }
      console.log('');
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });
    return;
  }

  orchestrate(cliArgs).then(r => process.exit(r.exitCode || 0))
    .catch(e => { console.error('[Fatal]', e); process.exit(2); });
}

module.exports = { orchestrate };
