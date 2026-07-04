// Execution memory agent stores every test run summary for trend analysis.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

class ExecutionMemoryAgent {
  constructor() {
    this.name = 'Execution Memory Agent';
    this.historyPath = path.join(config.paths.root, 'ai/memory/execution-history.json');
  }

  ensureHistory() {
    fs.ensureFileSync(this.historyPath);
    if (!fs.readFileSync(this.historyPath, 'utf8').trim()) {
      fs.writeJsonSync(this.historyPath, [], { spaces: 2 });
    }
  }

  async run(executionSummary) {
    this.ensureHistory();
    const history = fs.readJsonSync(this.historyPath);
    const entry = {
      runId: executionSummary.runId,
      executedAt: executionSummary.executedAt,
      browser: executionSummary.browser,
      environment: executionSummary.environment,
      reportDir: executionSummary.reportDir,
      totalScenarios: executionSummary.totalScenarios,
      passedScenarios: executionSummary.passedScenarios,
      failedScenarios: executionSummary.failedScenarios,
      skippedScenarios: executionSummary.skippedScenarios,
      passRate: executionSummary.passRate,
      failedScenarioNames: executionSummary.failures.map((failure) => failure.scenario)
    };

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
