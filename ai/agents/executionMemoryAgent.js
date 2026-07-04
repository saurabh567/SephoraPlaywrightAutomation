// Execution memory agent stores every test run summary for trend analysis.
// Reads from execution-state.json and cucumber-report.json so the AI can
// remember previous executions even when the orchestrator passes minimal context.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

class ExecutionMemoryAgent {
  constructor() {
    this.name = 'Execution Memory Agent';
    this.historyPath = path.join(config.paths.root, 'ai/memory/execution-history.json');
    this.executionStatePath = path.join(config.paths.root, 'ai/memory/execution-state.json');
    this.cucumberReportPath = path.join(config.paths.root, 'reports/json/cucumber-report.json');
  }

  ensureHistory() {
    fs.ensureDirSync(path.dirname(this.historyPath));
    if (!fs.existsSync(this.historyPath)) {
      fs.writeJsonSync(this.historyPath, [], { spaces: 2 });
      return;
    }
    const raw = fs.readFileSync(this.historyPath, 'utf8').trim();
    if (!raw) {
      fs.writeJsonSync(this.historyPath, [], { spaces: 2 });
    }
  }

  safeReadJson(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (raw) return JSON.parse(raw);
      }
    } catch (_) { /* ignore corrupt files */ }
    return null;
  }

  buildEntryFromExecutionState() {
    const state = this.safeReadJson(this.executionStatePath);
    if (!state) return null;

    const currentRun = state.currentRun || null;
    const runs = Array.isArray(state.runs) ? state.runs : [];
    // Use currentRun if available, otherwise the most recent run
    const run = currentRun || (runs.length > 0 ? runs[runs.length - 1] : null);
    if (!run) return null;

    // Extract scenario counts from cucumber report if available
    let totalScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;
    let skippedScenarios = 0;
    const failedScenarioNames = [];

    const cucumberReport = this.safeReadJson(this.cucumberReportPath);
    if (Array.isArray(cucumberReport)) {
      for (const feature of cucumberReport) {
        const elements = feature.elements || [];
        for (const element of elements) {
          if (element.type === 'scenario' || element.keyword === 'Scenario' || element.keyword === 'Scenario Outline') {
            totalScenarios++;
            const steps = element.steps || [];
            let hasFailed = false;
            let isSkipped = false;
            for (const step of steps) {
              if (step.result && step.result.status === 'failed') hasFailed = true;
              if (step.result && step.result.status === 'skipped') isSkipped = true;
            }
            if (hasFailed) {
              failedScenarios++;
              failedScenarioNames.push(element.name || 'Unknown');
            } else if (isSkipped) {
              skippedScenarios++;
            } else {
              passedScenarios++;
            }
          }
        }
      }
    }

    // Fallback: if cucumber report wasn't available, use execution state errors
    if (totalScenarios === 0) {
      const errors = run.errors || [];
      const exitCode = run.exitCode !== undefined ? run.exitCode : 0;
      passedScenarios = exitCode === 0 ? 1 : 0;
      failedScenarios = errors.length > 0 ? errors.length : (exitCode !== 0 ? 1 : 0);
      totalScenarios = passedScenarios + failedScenarios;
      for (const err of errors) {
        failedScenarioNames.push(err.stderr || 'Execution error (see logs)');
      }
    }

    const passRate = totalScenarios > 0 ? Math.round((passedScenarios / totalScenarios) * 10000) / 100 : 0;

    return {
      runId: run.runId || ('run-' + Date.now()),
      executedAt: run.completedAt || run.startedAt || new Date().toISOString(),
      browser: run.browser || 'chromium',
      environment: run.platform || 'WEB',
      platform: run.platform || 'WEB',
      reportDir: 'reports/web',
      totalScenarios: totalScenarios,
      passedScenarios: passedScenarios,
      failedScenarios: failedScenarios,
      skippedScenarios: skippedScenarios,
      passRate: passRate,
      failedScenarioNames: failedScenarioNames,
      status: run.status || 'unknown',
      exitCode: run.exitCode !== undefined ? run.exitCode : 0
    };
  }

  async run(context) {
    this.ensureHistory();

    // Try to build entry from execution state / cucumber report
    const entry = this.buildEntryFromExecutionState();

    if (!entry) {
      // Fallback: write a minimal placeholder so the pipeline isn't blocked
      const fallback = {
        runId: 'run-' + Date.now(),
        executedAt: new Date().toISOString(),
        browser: (context && context.platform) || 'unknown',
        environment: 'unknown',
        platform: (context && context.platform) || 'unknown',
        reportDir: 'reports/web',
        totalScenarios: 0,
        passedScenarios: 0,
        failedScenarios: 0,
        skippedScenarios: 0,
        passRate: 0,
        failedScenarioNames: [],
        status: 'no-data',
        exitCode: 0,
        note: 'No execution state or cucumber report available yet'
      };
      const history = fs.readJsonSync(this.historyPath);
      history.push(fallback);
      fs.writeJsonSync(this.historyPath, history, { spaces: 2 });
      return fallback;
    }

    const history = fs.readJsonSync(this.historyPath);
    history.push(entry);
    fs.writeJsonSync(this.historyPath, history, { spaces: 2 });
    return entry;
  }
}

module.exports = new ExecutionMemoryAgent();


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Execution Memory Agent",
  "version": "1.0.0",
  "description": "Persistent storage of test run summaries for trend analysis",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "memory",
    "storage"
  ],
  "executionStage": "analysis",
  "priority": 85,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
