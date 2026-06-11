const fs = require('fs-extra');
const path = require('path');
const BaseAgent = require('./baseAgent');
const RagService = require('../rag/ragService');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

const agent = new BaseAgent({
  name: 'Failure Analysis Agent',
  role: 'Analyze Cucumber and Playwright failures using retrieved historical evidence.',
  promptFile: 'failure-analysis.md',
  outputType: 'Failure analysis report'
});

function normalizeInput(input = {}) {
  if (input.executionSummary) return input.executionSummary;
  if (input.failures) return input;
  const reportDir = input.reportDir || process.env.REPORT_DIR || 'reports';
  return { ...readCucumberSummary(reportDir), reportDir };
}

function buildQuery(summary) {
  return (summary.failures || []).map((failure) => [
    failure.feature,
    failure.scenario,
    failure.failedStep,
    failure.error
  ].filter(Boolean).join(' ')).join('\n');
}

agent.analyzeWithRag = async function analyzeWithRag(input = {}) {
  const summary = normalizeInput(input);
  if (!summary.failures?.length) {
    return {
      skipped: true,
      reason: 'No failed Cucumber scenarios were found.',
      failedScenarios: 0
    };
  }

  const rag = new RagService();
  const query = buildQuery(summary);
  const result = await rag.generate({
    task: 'Analyze the current failed scenarios, identify likely root causes, and recommend concrete investigation or repair steps.',
    input: summary,
    topK: Number(process.env.FAILURE_RAG_TOP_K || 5),
    systemPrompt: agent.loadPrompt(),
    instructions: [
      '- Return Markdown with Summary, Current Failure Evidence, Similar Historical Evidence, Root Cause Assessment, and Recommendations.',
      '- Include confidence and the source path for every historical comparison.'
    ].join('\n'),
    retrieve: (retrieval, topK) => retrieval.searchFailures(query, topK)
  });

  const outputPath = path.join(process.cwd(), 'reports/ai/failure-analysis.md');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, result.content);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    failedScenarios: summary.failures.length,
    response: result.content,
    retrievalEvidence: result.promptEvidence,
    model: result.model,
    usage: result.usage
  };
};

agent.analyzeWithVectorDb = agent.analyzeWithRag;
agent.run = async function run(input = {}) {
  const result = await agent.analyzeWithRag(input);
  return result.response || result.reason;
};

module.exports = agent;
