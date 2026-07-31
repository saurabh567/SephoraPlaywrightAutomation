#!/usr/bin/env node
import ollamaManager from '../health/ollamaManager';
import chromaManager from '../vector-db/chromaServerManager';
import { run as unifiedHealth } from '../health/unifiedHealth';
import TestExecutionAgent, { run as testExecutionRun } from '../agents/TestExecutionAgent';
import FailureAnalysisAgent from '../agents/failureAnalysisAgent';
import RootCauseAnalysisAgent from '../agents/RCAAgent';
import LocatorHealingAgent from '../agents/locatorHealingAgent';
import RetryAndFixAgent from '../agents/selfHealingAutomationAgent';
import ReportSummarizationAgent from '../agents/reportSummarizationAgent';
import PRPreparationAgent from '../agents/prPreparationAgent';
// Orchestrator: start services, run tests, run analysis agents, produce reports.

async function run() {
  console.log('[Orchestrator] ensuring Ollama and Chroma...');
  try {
    await ollamaManager.ensureRunning();
  } catch (e: any) { console.warn('[Orchestrator] ollama ensureRunning warning:', e.message); }
  try {
    await chromaManager.ensureRunning();
  } catch (e: any) { console.warn('[Orchestrator] chroma ensureRunning warning:', e.message); }

  console.log('[Orchestrator] performing vector health check...');
  try { await unifiedHealth(); } catch (e: any) { console.warn('[Orchestrator] unifiedHealth warning:', e.message); }

  console.log('[Orchestrator] executing tests via TestExecutionAgent...');
  const execResult: any = await testExecutionRun(); // { failures, artifacts }

  if (!execResult || !execResult.failures || execResult.failures.length === 0) {
    console.log('[Orchestrator] No failures detected. Summarizing...');
    await ReportSummarizationAgent.run(execResult || {});
    return;
  }

  console.log('[Orchestrator] Failures detected. Running analysis agents...');
  const analysis = await FailureAnalysisAgent.analyze(execResult);
  const rootCause = await RootCauseAnalysisAgent.run(analysis);
  const heals = await LocatorHealingAgent.attemptHeal(rootCause, execResult);
  const retry = await new RetryAndFixAgent().run();
  await ReportSummarizationAgent.run({ execResult, analysis, rootCause, heals, retry });
  await PRPreparationAgent.preparePR({ execResult, analysis, rootCause, heals, retry });
}

if (require.main === module) {
  run().catch(e => {
    console.error('[Orchestrator] fatal error', e.stack || e);
    process.exit(2);
  });
}

export default run;
