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
