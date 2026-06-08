// Runs post-test AI agents after Cucumber execution and writes runtime AI artifacts.
const fs = require('fs-extra');
const path = require('path');
const agents = require('../agents');
const config = require('../config/ai.config');
const { readCucumberSummary } = require('../tools/cucumberReportReader');

function mdEscape(value = '') {
  return String(value).replace(/\|/g, '\\|');
}

function buildFailureAnalysis(summary, aiOutput) {
  const lines = [
    '# Failure Analysis',
    '',
    `- Run ID: ${summary.runId}`,
    `- Executed At: ${summary.executedAt}`,
    `- Browser: ${summary.browser}`,
    `- Environment: ${summary.environment}`,
    `- Report Directory: ${summary.reportDir}`,
    `- Failed Scenarios: ${summary.failedScenarios}`,
    ''
  ];

  if (!summary.exists) {
    lines.push(`Cucumber JSON report was not found at ${summary.reportPath}.`);
  } else if (summary.failures.length === 0) {
    lines.push('No failed scenarios were found.');
  } else {
    lines.push('| Feature | Scenario | Failed Step | Error |');
    lines.push('|---|---|---|---|');
    for (const failure of summary.failures) {
      lines.push(
        `| ${mdEscape(failure.feature)} | ${mdEscape(failure.scenario)} | ${mdEscape(failure.failedStep)} | ${mdEscape(failure.error.split('\n')[0])} |`
      );
    }
  }

  lines.push('', '## AI Analysis', '', aiOutput);
  return lines.join('\n');
}

function buildExecutionSummary(summary, aiOutput, memoryEntry) {
  return [
    '# Execution Summary',
    '',
    `- Run ID: ${summary.runId}`,
    `- Executed At: ${summary.executedAt}`,
    `- Browser: ${summary.browser}`,
    `- Environment: ${summary.environment}`,
    `- Total Scenarios: ${summary.totalScenarios}`,
    `- Passed Scenarios: ${summary.passedScenarios}`,
    `- Failed Scenarios: ${summary.failedScenarios}`,
    `- Skipped Scenarios: ${summary.skippedScenarios}`,
    `- Pass Rate: ${summary.passRate}%`,
    '',
    '## Execution Memory Entry',
    '',
    '```json',
    JSON.stringify(memoryEntry, null, 2),
    '```',
    '',
    '## AI Summary',
    '',
    aiOutput
  ].join('\n');
}

function buildLocatorHealingSuggestions(summary, aiOutput) {
  const failedLocatorsInput = summary.failures.map((failure) => ({
    feature: failure.feature,
    scenario: failure.scenario,
    failedStep: failure.failedStep,
    error: failure.error
  }));

  return [
    '# Locator Healing Suggestions',
    '',
    `- Run ID: ${summary.runId}`,
    `- Mode: dry-run`,
    `- Failed Scenarios Analyzed: ${summary.failedScenarios}`,
    '',
    '## Failure Input',
    '',
    '```json',
    JSON.stringify(failedLocatorsInput, null, 2),
    '```',
    '',
    '## Agent Suggestions',
    '',
    aiOutput
  ].join('\n');
}

function buildMcpHealthCheck(health) {
  const lines = [
    '# MCP Health Check',
    '',
    `- Checked At: ${health.checkedAt}`,
    `- Mode: ${health.mode}`,
    `- Config Path: ${health.configPath}`,
    `- Config Exists: ${health.configExists}`,
    `- Summary: ${health.summary}`,
    '',
    '| MCP Server | Status | Connectivity | Purpose |',
    '|---|---|---|---|'
  ];

  for (const server of health.servers) {
    lines.push(
      `| ${mdEscape(server.name)} | ${mdEscape(server.status)} | ${mdEscape(server.connectivity)} | ${mdEscape(server.purpose)} |`
    );
  }

  return lines.join('\n');
}

async function runAgent(label, callback) {
  console.log(`[AI] Running ${label}`);
  try {
    return await callback();
  } catch (error) {
    return [
      `AI agent ${label} failed.`,
      '',
      '```text',
      error.stack || error.message,
      '```'
    ].join('\n');
  }
}

async function run(input = {}) {
  console.log('[AI] Starting Agentic AI layer');

  const reportDir = input.reportDir || process.env.REPORT_DIR || 'reports';
  const summary = {
    ...readCucumberSummary(reportDir),
    runId: input.runId || `${Date.now()}`,
    executedAt: new Date().toISOString(),
    browser: process.env.BROWSER || 'chromium',
    environment: process.env.ENV || 'dev',
    reportDir
  };

  fs.ensureDirSync(path.join(config.paths.root, 'ai/output'));
  fs.ensureDirSync(path.join(config.paths.root, 'ai/memory'));

  const failureAiOutput = await runAgent('FailureAnalysisAgent', () =>
    agents.failureAnalysis.run({ executionSummary: summary })
  );
  const reportAiOutput = await runAgent('ReportSummaryAgent', () =>
    agents.reportSummarization.run({ executionSummary: summary })
  );
  const memoryEntry = await runAgent('ExecutionMemoryAgent', () => agents.executionMemory.run(summary));
  const locatorAiOutput = await runAgent('LocatorHealingAgent', () =>
    agents.locatorHealing.run({
      dryRun: true,
      executionSummary: summary,
      failures: summary.failures
    })
  );
  const mcpHealth = await runAgent('MCPHealthCheckAgent', () => agents.mcpHealthCheck.run());

  const failureAnalysis = buildFailureAnalysis(summary, failureAiOutput);
  const executionSummary = buildExecutionSummary(summary, reportAiOutput, memoryEntry);
  const locatorHealingSuggestions = buildLocatorHealingSuggestions(summary, locatorAiOutput);
  const mcpHealthCheck = typeof mcpHealth === 'string' ? mcpHealth : buildMcpHealthCheck(mcpHealth);

  fs.writeFileSync(path.join(config.paths.root, 'ai/output/failure-analysis.md'), failureAnalysis);
  fs.writeFileSync(path.join(config.paths.root, 'ai/output/execution-summary.md'), executionSummary);
  fs.writeFileSync(path.join(config.paths.root, 'ai/output/locator-healing-suggestions.md'), locatorHealingSuggestions);
  fs.writeFileSync(path.join(config.paths.root, 'ai/output/mcp-health-check.md'), mcpHealthCheck);

  console.log('[AI] AI execution completed');

  return {
    failureAnalysisPath: 'ai/output/failure-analysis.md',
    executionSummaryPath: 'ai/output/execution-summary.md',
    locatorHealingSuggestionsPath: 'ai/output/locator-healing-suggestions.md',
    mcpHealthCheckPath: 'ai/output/mcp-health-check.md',
    executionHistoryPath: 'ai/memory/execution-history.json',
    summary
  };
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('Post-execution AI agents failed.');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
