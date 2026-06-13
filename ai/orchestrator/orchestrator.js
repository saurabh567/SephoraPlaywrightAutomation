#!/usr/bin/env node
// Orchestrator: start services, run tests, run analysis agents, produce reports.
const ollamaManager = require('../health/ollamaManager');
const chromaManager = require('../vector-db/chromaServerManager');
const unifiedHealth = require('../health/unifiedHealth');
const TestExecutionAgent = require('../agents/TestExecutionAgent');
const FailureAnalysisAgent = require('../agents/failureAnalysisAgent');
const RootCauseAnalysisAgent = require('../agents/rootCauseAnalysisAgent');
const LocatorHealingAgent = require('../agents/locatorHealingAgent');
const RetryAndFixAgent = require('../agents/selfHealingAutomationAgent');
const ReportSummarizationAgent = require('../agents/reportSummarizationAgent');
const PRPreparationAgent = require('../agents/prPreparationAgent');

async function run() {
  console.log('[Orchestrator] ensuring Ollama and Chroma...');
  try {
    await ollamaManager.ensureRunning();
  } catch (e) { console.warn('[Orchestrator] ollama ensureRunning warning:', e.message); }
  try {
    await chromaManager.ensureRunning();
  } catch (e) { console.warn('[Orchestrator] chroma ensureRunning warning:', e.message); }

  console.log('[Orchestrator] performing vector health check...');
  try { await unifiedHealth(); } catch (e) { console.warn('[Orchestrator] unifiedHealth warning:', e.message); }

  console.log('[Orchestrator] executing tests via TestExecutionAgent...');
  const execResult = await TestExecutionAgent.run(); // { failures, artifacts }

  if (!execResult || !execResult.failures || execResult.failures.length === 0) {
    console.log('[Orchestrator] No failures detected. Summarizing...');
    await ReportSummarizationAgent.run(execResult || {});
    return;
  }

  console.log('[Orchestrator] Failures detected. Running analysis agents...');
  const analysis = await FailureAnalysisAgent.analyze(execResult);
  const rootCause = await RootCauseAnalysisAgent.analyze(analysis);
  const heals = await LocatorHealingAgent.attemptHeal(rootCause, execResult);
  const retry = await RetryAndFixAgent.run(heals, execResult);
  await ReportSummarizationAgent.run({ execResult, analysis, rootCause, heals, retry });
  await PRPreparationAgent.prepare({ execResult, analysis, rootCause, heals, retry });
}

if (require.main === module) {
  run().catch(e => {
    console.error('[Orchestrator] fatal error', e.stack || e);
    process.exit(2);
  });
}

module.exports = run;
