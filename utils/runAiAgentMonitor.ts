#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
/**
 * runAiAgentMonitor.js
 *
 * INTEGRATION HOOK — AI Agent Monitor Launcher
 *
 * This script wraps the ENTIRE test execution with AI Agent monitoring.
 * It is designed to be called BEFORE and AFTER the actual test execution
 * via the enterpriseExecutionPipeline.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │   1. AgentMonitor.initialize()                      │
 *   │      → Discovers ALL AI agents via AgentRegistry    │
 *   │      → Creates execution snapshots for each agent   │
 *   │                                                     │
 *   │   2. AgentMonitor.start()                           │
 *   │      → Subscribes to EventBus lifecycle events      │
 *   │      → Tracks every state transition in real-time   │
 *   │                                                     │
 *   │   3. [Actual test execution happens here]           │
 *   │      → Enterprise Execution Pipeline runs           │
 *   │      → All platforms execute (API, Web, Mobile...)  │
 *   │                                                     │
 *   │   4. AgentMonitor.stop()                            │
 *   │      → Finalizes all agent snapshots               │
 *   │      → Persists trace to agent-monitor-trace.json   │
 *   │                                                     │
 *   │   5. generateAiAgentReport.main()                   │
 *   │      → Generates HTML, JSON, MD, CSV, PDF reports   │
 *   └─────────────────────────────────────────────────────┘
 *
 * Integration point:
 *   Called from runCucumberWithAi.js BEFORE/after the pipeline.
 *   Also callable standalone for ad-hoc monitoring reports.
 *
 * Usage:
 *   node utils/runAiAgentMonitor.js            # Run monitor only (generate report)
 *   AI_MONITOR=true node utils/runCucumberWithAi.js  # Auto-enables monitor
 *
 * Output:
 *   reports/ai/ai-agent-execution-summary.html
 *   reports/ai/ai-agent-execution-summary.json
 *   reports/ai/ai-agent-execution-summary.md
 *   reports/ai/ai-agent-execution-summary.csv
 *   reports/ai/ai-agent-execution-summary.pdf
 */


const ROOT = process.cwd();

// ─── Module Loader (lazy) ──────────────────────────────────────────────────

function loadMonitor() {
  try {
    return require('../ai/core/AgentMonitor');
  } catch (err: any) {
    console.error('[AiAgentMonitor] Failed to load AgentMonitor:', err.message);
    return null;
  }
}

function loadEventBus() {
  try {
    return require('../ai/core/EventBus');
  } catch (err: any) {
    console.error('[AiAgentMonitor] Failed to load EventBus:', err.message);
    return null;
  }
}

async function loadReportGenerator() {
  try {
    return require('./generateAiAgentReport');
  } catch (err: any) {
    console.error('[AiAgentMonitor] Failed to load report generator:', err.message);
    return null;
  }
}

// ─── Monitor Integration ───────────────────────────────────────────────────

class AiAgentMonitorIntegration {
  [key: string]: any;
  constructor() {
    this.monitor = null;
    this.eventBus = null;
    this._initialized = false;
    this._started = false;
    this._stopped = false;
  }

  /**
   * Initialize the AI Agent Monitor.
   * Must be called before any test execution.
   */
  async initialize() {
    if (this._initialized) return;

    console.log('\n══════════════════════════════════════════════');
    console.log('  🤖 AI Agent Monitoring System');
    console.log('  Enterprise AI Agent Execution Tracker');
    console.log('══════════════════════════════════════════════\n');

    this.eventBus = loadEventBus();
    if (!this.eventBus) {
      console.error('  ❌ EventBus not available. Monitoring disabled.');
      return false;
    }

    this.monitor = loadMonitor();
    if (!this.monitor) {
      console.error('  ❌ AgentMonitor not available. Monitoring disabled.');
      return false;
    }

    try {
      await this.monitor.initialize();
      this._initialized = true;
      console.log('  ✅ AI Agent Monitor initialized successfully\n');
      return true;
    } catch (err: any) {
      console.error('  ❌ Failed to initialize AI Agent Monitor:', err.message);
      return false;
    }
  }

  /**
   * Start monitoring.
   */
  start() {
    if (!this._initialized || !this.monitor) return false;
    if (this._started) return true;

    try {
      this.monitor.start();
      this._started = true;
      return true;
    } catch (err: any) {
      console.error('  ❌ Failed to start monitoring:', err.message);
      return false;
    }
  }

  /**
   * Stop monitoring and generate reports.
   */
  async stop() {
    if (!this._started || !this.monitor) return;
    if (this._stopped) return;

    try {
      await this.monitor.stop();
      this._stopped = true;

      // Generate reports
      console.log('  📊 Generating AI Agent reports...\n');
      const reportGen = await loadReportGenerator();
      if (reportGen) {
        await reportGen.main();
      } else {
        console.error('  ⚠ Report generator not available.');
      }

      console.log('\n  📂 Open the report:');
      console.log('     reports/ai/ai-agent-execution-summary.html');
      console.log('');

      return true;
    } catch (err: any) {
      console.error('  ❌ Failed to stop monitor:', err.message);
      return false;
    }
  }

  /**
   * Get the execution summary.
   */
  getSummary() {
    if (!this.monitor) return null;
    return this.monitor.getSummary();
  }
}

// ─── Standalone Execution ──────────────────────────────────────────────────

async function main() {
  const integration = new AiAgentMonitorIntegration();

  const initialized = await integration.initialize();
  if (!initialized) {
    console.error('[AiAgentMonitor] Failed to initialize. Exiting.');
    process.exit(1);
  }

  integration.start();

  // Generate reports only (no test execution)
  await integration.stop();

  const summary = integration.getSummary();
  if (summary) {
    console.log('\n  📊 Execution Summary:');
    console.log(`     Total Agents: ${summary.summary.totalAgents}`);
    console.log(`     Executed:     ${summary.summary.executed}`);
    console.log(`     Skipped:      ${summary.summary.skipped}`);
    console.log(`     Failed:       ${summary.summary.failed}`);
    console.log(`     Idle:         ${summary.summary.idle}`);
    console.log(`     Status:       ${summary.summary.overallStatus}`);
    console.log(`     Duration:     ${summary.summary.totalDurationFormatted}`);
    console.log(`     AI Health:    ${summary.aiHealthScore !== undefined ? summary.aiHealthScore.toFixed(1) : 'N/A'}%`);
    console.log('');
  }

  return summary;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(err => {
    console.error('[AiAgentMonitor] Fatal:', err.message);
    process.exit(1);
  });
}

export { AiAgentMonitorIntegration, main };
export default { AiAgentMonitorIntegration, main };
