const BaseAgent = require('./baseAgent');
const fs = require('fs-extra');
const path = require('path');
const RetrievalService = require('../vector-db/retrievalService');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

const agent = new BaseAgent({
  name: 'Failure Analysis Agent',
  role: 'Analyze Cucumber/Playwright failures from logs, screenshots, traces, and reports.',
  promptFile: 'failure-analysis.md',
  outputType: 'Failure analysis report'
});

function firstLine(value = '') {
  return String(value).split('\n')[0] || '';
}

function buildFailureQuery(summary) {
  if (!summary.failures || summary.failures.length === 0) {
    return 'No failed Cucumber scenarios found in latest report.';
  }

  return summary.failures
    .map((failure) => `${failure.feature} ${failure.scenario} ${failure.failedStep} ${firstLine(failure.error)}`)
    .join('\n');
}

function buildMarkdown(summary, similarFailures) {
  const lines = [
    '# Failure Analysis Summary',
    '',
    `Generated At: ${new Date().toISOString()}`,
    `Report Directory: ${summary.reportDir || 'reports'}`,
    '',
    '## Current Execution',
    '',
    `- Total Scenarios: ${summary.totalScenarios || 0}`,
    `- Passed Scenarios: ${summary.passedScenarios || 0}`,
    `- Failed Scenarios: ${summary.failedScenarios || 0}`,
    ''
  ];

  if (!summary.exists) {
    lines.push('Cucumber JSON report was not found. Run tests first, then run this agent again.', '');
  } else if (!summary.failures || summary.failures.length === 0) {
    lines.push('No failed scenarios were found in the latest Cucumber JSON report.', '');
  } else {
    lines.push('## Failed Scenarios', '', '| Feature | Scenario | Failed Step | Error |', '|---|---|---|---|');
    for (const failure of summary.failures) {
      lines.push(
        `| ${failure.feature} | ${failure.scenario} | ${failure.failedStep} | ${firstLine(failure.error).replace(/\|/g, '\\|')} |`
      );
    }
    lines.push('');
  }

  lines.push('## Similar Past Failures From Vector DB', '');
  if (!similarFailures.length) {
    lines.push('No similar failures were found. Run `npm run vector:ingest` after a few executions to build history.', '');
  } else {
    lines.push('| Score | Source | Type | Preview |', '|---|---|---|---|');
    for (const match of similarFailures) {
      lines.push(
        `| ${match.score ?? ''} | ${match.metadata?.sourcePath || ''} | ${match.metadata?.type || ''} | ${firstLine(match.document).replace(/\|/g, '\\|')} |`
      );
    }
    lines.push('');
  }

  lines.push(
    '## Root Cause Summary',
    '',
    summary.failedScenarios > 0
      ? 'The latest failed scenarios should be compared with the similar historical failures above. Start by checking locator changes, page state changes, environment redirects, timeout conditions, and missing test data.'
      : 'No failure root cause is required because the latest report has no failed scenarios.',
    '',
    '## Suggested Fix',
    '',
    '- Re-run the failed scenario in headed mode.',
    '- Check the latest screenshot and trace under `reports/`.',
    '- Compare the failed step with similar failures returned from the Vector DB.',
    '- If the failure is locator related, run `npm run ai:heal-locators` for dry-run locator suggestions.'
  );

  return lines.join('\n');
}

agent.analyzeWithVectorDb = async function analyzeWithVectorDb(input = {}) {
  console.log('[AI] Running FailureAnalysisAgent with Vector DB context');
  const reportDir = input.reportDir || process.env.REPORT_DIR || 'reports';
  const summary = {
    ...readCucumberSummary(reportDir),
    reportDir
  };

  const retrieval = new RetrievalService();
  const similarFailures = await retrieval.searchFailures(buildFailureQuery(summary), 5);
  const output = buildMarkdown(summary, similarFailures);
  const outputPath = path.join(process.cwd(), 'reports/ai/failure-analysis-summary.md');

  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, output);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    failedScenarios: summary.failedScenarios,
    similarFailureCount: similarFailures.length
  };
};

module.exports = agent;
