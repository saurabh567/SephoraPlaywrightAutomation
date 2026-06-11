const fs = require('fs-extra');
const path = require('path');
const BaseAgent = require('./baseAgent');
const RagService = require('../rag/ragService');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

const agent = new BaseAgent({
  name: 'Locator Healing Agent',
  role: 'Recommend stable alternative locators using current failures and retrieved framework locator evidence.',
  promptFile: 'locator-healing.md',
  outputType: 'Locator healing recommendation'
});

function readFailureInput(input = {}) {
  if (input.failures?.length) return input.failures;
  const explicitPath = path.join(process.cwd(), 'ai/input/failed-locators.json');
  if (fs.existsSync(explicitPath)) {
    const data = fs.readJsonSync(explicitPath);
    if (Array.isArray(data) && data.length) return data;
  }
  return readCucumberSummary(input.reportDir || process.env.REPORT_DIR || 'reports').failures || [];
}

function buildQuery(failures) {
  return failures.map((failure) => [
    failure.locator,
    failure.feature,
    failure.scenario,
    failure.failedStep,
    failure.error
  ].filter(Boolean).join(' ')).join('\n');
}

agent.suggestWithRag = async function suggestWithRag(input = {}) {
  const failures = readFailureInput(input);
  if (!failures.length) {
    return { skipped: true, reason: 'No locator failure input was found.' };
  }

  const query = buildQuery(failures);
  const rag = new RagService();
  const result = await rag.generate({
    task: 'Recommend replacement Playwright or Appium locators for the current failures without modifying source files.',
    input: { failures, mode: 'recommendation-only' },
    topK: Number(process.env.LOCATOR_RAG_TOP_K || 8),
    systemPrompt: agent.loadPrompt(),
    instructions: [
      '- Return Markdown with Failure Evidence and a ranked locator recommendation table.',
      '- For each suggestion include locator syntax, source file, stability rationale, confidence, and risk.',
      '- Never claim the locator was tested or fixed.'
    ].join('\n'),
    retrieve: async (retrieval, topK) => {
      const [locators, pageObjects] = await Promise.all([
        retrieval.searchLocators(query, topK),
        retrieval.searchPageObjects(query, Math.max(3, Math.ceil(topK / 2)))
      ]);
      return [...locators, ...pageObjects]
        .sort((left, right) => (right.similarityScore || 0) - (left.similarityScore || 0))
        .slice(0, topK);
    }
  });

  const outputPath = path.join(process.cwd(), 'reports/ai/locator-healing.md');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, result.content);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    response: result.content,
    retrievalEvidence: result.promptEvidence,
    model: result.model,
    usage: result.usage
  };
};

agent.suggestWithVectorDb = agent.suggestWithRag;
agent.run = async function run(input = {}) {
  const result = await agent.suggestWithRag(input);
  return result.response || result.reason;
};

module.exports = agent;
