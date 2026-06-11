const fs = require('fs-extra');
const path = require('path');
const IngestionService = require('../vector-db/ingestionService');
const failureAnalysisAgent = require('../agents/failureAnalysisAgent');
const locatorHealingAgent = require('../agents/locatorHealingAgent');
const executionMemoryAgent = require('../agents/executionMemoryAgent');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

async function run(input = {}) {
  const reportDir = input.reportDir || process.env.REPORT_DIR || 'reports';
  const summary = {
    ...readCucumberSummary(reportDir),
    reportDir,
    runId: input.runId || `${Date.now()}`,
    executedAt: new Date().toISOString(),
    browser: process.env.BROWSER || 'chromium',
    environment: process.env.ENV || 'dev'
  };

  if (!summary.exists) {
    throw new Error(`Cucumber JSON report was not found at ${summary.reportPath}.`);
  }

  console.log('[AI] Ingesting framework sources and runtime artifacts into ChromaDB');
  const ingestion = await new IngestionService().ingestAll();
  const memoryEntry = await executionMemoryAgent.run(summary);

  let failureAnalysis = { skipped: true, reason: 'No failed scenarios.' };
  let locatorHealing = { skipped: true, reason: 'No failed scenarios.' };

  if (summary.failures.length > 0) {
    console.log('[AI] Running FailureAnalysisAgent with retrieved ChromaDB context');
    failureAnalysis = await failureAnalysisAgent.analyzeWithRag({ executionSummary: summary });
    console.log('[AI] Running LocatorHealingAgent with retrieved ChromaDB context');
    locatorHealing = await locatorHealingAgent.suggestWithRag({
      failures: summary.failures,
      reportDir
    });
  }

  const evidence = {
    runId: summary.runId,
    executedAt: summary.executedAt,
    reportPath: summary.reportPath,
    failedScenarios: summary.failedScenarios,
    ingestion,
    failureAnalysis,
    locatorHealing,
    memoryEntry
  };
  const evidencePath = path.join(process.cwd(), 'reports/ai/ai-execution-evidence.json');
  fs.ensureDirSync(path.dirname(evidencePath));
  fs.writeJsonSync(evidencePath, evidence, { spaces: 2 });

  return {
    evidencePath: path.relative(process.cwd(), evidencePath),
    failureAnalysisPath: failureAnalysis.outputPath,
    locatorHealingPath: locatorHealing.outputPath,
    summary
  };
}

if (require.main === module) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`[AI] Post-execution RAG failed: ${error.stack || error.message}`);
      process.exit(1);
    });
}

module.exports = { run };
