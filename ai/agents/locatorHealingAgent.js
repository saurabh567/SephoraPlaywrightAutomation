const BaseAgent = require('./baseAgent');
const fs = require('fs-extra');
const path = require('path');
const RetrievalService = require('../vector-db/retrievalService');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

const agent = new BaseAgent({
  name: 'Locator Healing Agent',
  role: 'Analyze broken locators and suggest stable Playwright locator replacements.',
  promptFile: 'locator-healing.md',
  outputType: 'Locator healing recommendation'
});

function firstLine(value = '') {
  return String(value).split('\n')[0] || '';
}

function readFailedLocatorInput() {
  const failedLocatorsPath = path.join(process.cwd(), 'ai/input/failed-locators.json');
  if (fs.existsSync(failedLocatorsPath)) {
    try {
      return fs.readJsonSync(failedLocatorsPath);
    } catch (error) {
      return [];
    }
  }

  const summary = readCucumberSummary(process.env.REPORT_DIR || 'reports');
  return summary.failures || [];
}

function buildQuery(failedInput) {
  const items = Array.isArray(failedInput) ? failedInput : [failedInput];
  return items
    .map((item) => `${item.locator || ''} ${item.failedStep || ''} ${item.scenario || ''} ${item.error || ''}`)
    .join('\n');
}

function buildMarkdown(failedInput, similarLocators) {
  const items = Array.isArray(failedInput) ? failedInput : [failedInput];
  const lines = [
    '# Locator Healing Suggestions',
    '',
    `Generated At: ${new Date().toISOString()}`,
    'Mode: dry-run only. No source files were changed.',
    '',
    '## Failed Locator Input',
    '',
    '```json',
    JSON.stringify(items, null, 2),
    '```',
    '',
    '## Suggested Alternatives From Vector DB',
    '',
    '| Score | Source | Existing Locator Context | Suggested Action |',
    '|---|---|---|---|'
  ];

  if (!similarLocators.length) {
    lines.push('|  |  | No similar locators found | Run `npm run vector:ingest` to index page objects and locators |');
  } else {
    for (const match of similarLocators) {
      lines.push(
        `| ${match.score ?? ''} | ${match.metadata?.sourcePath || ''} | ${firstLine(match.document).replace(/\|/g, '\\|')} | Prefer role/text/test-id locators or page-object locator already used in this source |`
      );
    }
  }

  lines.push(
    '',
    '## Important',
    '',
    'This agent only suggests locator improvements. Review the suggestion manually before changing page objects or step definitions.'
  );

  return lines.join('\n');
}

agent.suggestWithVectorDb = async function suggestWithVectorDb() {
  console.log('[AI] Running LocatorHealingAgent with Vector DB context');
  const failedInput = readFailedLocatorInput();
  const retrieval = new RetrievalService();
  const similarLocators = await retrieval.searchLocators(buildQuery(failedInput), 8);
  const output = buildMarkdown(failedInput, similarLocators);
  const outputPath = path.join(process.cwd(), 'reports/ai/locator-healing-suggestions.md');

  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, output);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    similarLocatorCount: similarLocators.length
  };
};

module.exports = agent;
