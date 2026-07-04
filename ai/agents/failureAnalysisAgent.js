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
  return (summary.failures || []).map(function(failure) {
    return [
      failure.feature,
      failure.scenario,
      failure.failedStep,
      failure.error
    ].filter(Boolean).join(' ');
  }).join('\n');
}

// Classify a failure error message into a root-cause category
function classifyError(errorText) {
  const e = (errorText || '').toLowerCase();
  if (e.includes('timeout') || e.includes('timed out') || e.includes('waiting for')) return 'Timeout';
  if (e.includes('not found') || e.includes('no such element') || e.includes('cannot locate') || e.includes('selector') || e.includes('not available')) return 'Element Not Found';
  if (e.includes('could not add') || e.includes('could not find') || e.includes('unable to')) return 'Element Not Found';
  if (e.includes('assert') || e.includes('expected') || e.includes('to equal') || e.includes('to contain') || e.includes('to be')) return 'Assertion Failure';
  if (e.includes('network') || e.includes('etimedout') || e.includes('econnrefused') || e.includes('enotfound')) return 'Network Error';
  if (e.includes('navigation') || e.includes('page crash') || e.includes('detached')) return 'Navigation Error';
  if (e.includes('permission') || e.includes('access') || e.includes('denied') || e.includes('forbidden')) return 'Permission / Access Error';
  return 'Unknown';
}

// Local heuristic analysis — no external AI dependencies
agent.analyzeLocally = function analyzeLocally(summary) {
  var failures = summary.failures || [];
  if (!failures.length) {
    return { skipped: true, reason: 'No failed Cucumber scenarios were found.', failedScenarios: 0 };
  }

  var categorized = failures.map(function(f) {
    return {
      feature: f.feature || 'unknown',
      scenario: f.scenario || 'unknown',
      failedStep: f.failedStep || 'unknown',
      error: (f.error || '').substring(0, 500),
      category: classifyError(f.error || '')
    };
  });

  // Count by category
  var categoryCounts = {};
  for (var ci = 0; ci < categorized.length; ci++) {
    var cat = categorized[ci].category;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  var categories = Object.keys(categoryCounts).sort();
  var topCategory = categories.length > 0 ? categories.reduce(function(a, b) {
    return categoryCounts[a] >= categoryCounts[b] ? a : b;
  }) : 'None';

  // Build markdown report
  var md = '# Failure Analysis Report (Local — AI Unavailable)\n\n';
  md += '**Generated:** ' + new Date().toISOString() + '\n\n';
  md += '**Total Failures:** ' + failures.length + '\n';
  md += '**Primary Category:** ' + topCategory + '\n\n';

  md += '## Failure Distribution\n\n';
  md += '| Category | Count |\n|----------|-------|\n';
  for (var cj = 0; cj < categories.length; cj++) {
    md += '| ' + categories[cj] + ' | ' + categoryCounts[categories[cj]] + ' |\n';
  }
  md += '\n';

  md += '## Individual Failures\n\n';
  md += '| # | Feature | Scenario | Step | Category | Error (truncated) |\n|---|---------|----------|------|----------|-------------------|\n';
  for (var i = 0; i < categorized.length; i++) {
    var f = categorized[i];
    var shortError = f.error.length > 80 ? f.error.substring(0, 77) + '...' : f.error;
    md += '| ' + (i + 1) + ' | ' + f.feature + ' | ' + f.scenario + ' | ' + f.failedStep + ' | ' + f.category + ' | ' + shortError + ' |\n';
  }
  md += '\n';

  // Recommendations based on top category
  md += '## Recommendations\n\n';
  if (topCategory === 'Timeout') {
    md += '- Increase `timeout` in Playwright config or per-step.\n';
    md += '- Check network latency / server response times.\n';
    md += '- Add `waitForSelector` before interacting with slow-loading elements.\n';
  } else if (topCategory === 'Element Not Found') {
    md += '- Verify locator selectors are correct for the current page DOM.\n';
    md += '- Check if the page structure changed (new build/deployment).\n';
    md += '- Use more resilient selectors (aria labels, data-testid, text match).\n';
    md += '- Run locator-healing analysis for alternative selectors.\n';
    md += '- Ensure the page fully loaded before interacting with elements.\n';
  } else if (topCategory === 'Assertion Failure') {
    md += '- Verify test data matches expected values.\n';
    md += '- Check if application behavior changed.\n';
    md += '- Review test assertions for correctness.\n';
  } else if (topCategory === 'Network Error') {
    md += '- Check API / backend availability.\n';
    md += '- Verify network connectivity in test environment.\n';
    md += '- Add retry logic for flaky network calls.\n';
  } else if (topCategory === 'Navigation Error') {
    md += '- Verify page URLs and routes are correct.\n';
    md += '- Check for redirects or authentication requirements.\n';
    md += '- Ensure test environment is properly seeded.\n';
  } else {
    md += '- Review each failure individually for root cause.\n';
    md += '- Check logs and screenshots for more context.\n';
    md += '- Re-run with increased tracing/debug output.\n';
  }
  md += '\n---\n*Local analysis — no AI models were available. Pull the `nomic-embed-text` Ollama model for AI-powered RAG analysis.*\n';

  var outputPath = path.join(process.cwd(), 'reports/ai/failure-analysis.md');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, md);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    failedScenarios: failures.length,
    response: md,
    model: 'local-heuristic',
    usage: { mode: 'local-fallback' },
    categories: categoryCounts,
    primaryCategory: topCategory
  };
};

agent.analyzeWithRag = async function analyzeWithRag(input) {
  if (!input) input = {};
  var summary = normalizeInput(input);
  if (!summary.failures || !summary.failures.length) {
    return {
      skipped: true,
      reason: 'No failed Cucumber scenarios were found.',
      failedScenarios: 0
    };
  }

  var rag = new RagService();
  var query = buildQuery(summary);
  var result = await rag.generate({
    task: 'Analyze the current failed scenarios, identify likely root causes, and recommend concrete investigation or repair steps.',
    input: summary,
    topK: Number(process.env.FAILURE_RAG_TOP_K || 5),
    systemPrompt: agent.loadPrompt(),
    instructions: [
      '- Return Markdown with Summary, Current Failure Evidence, Similar Historical Evidence, Root Cause Assessment, and Recommendations.',
      '- Include confidence and the source path for every historical comparison.'
    ].join('\n'),
    retrieve: function(retrieval, topK) {
      return retrieval.searchFailures(query, topK);
    }
  });

  var outputPath = path.join(process.cwd(), 'reports/ai/failure-analysis.md');
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

agent.run = async function run(input) {
  if (!input) input = {};
  var summary = normalizeInput(input);

  // No failures → skip gracefully
  if (!summary.failures || !summary.failures.length) {
    return 'No failed Cucumber scenarios were found. Nothing to analyze.';
  }

  // Try RAG-powered analysis with AI fallback chain
  try {
    var result = await agent.analyzeWithRag(input);
    if (result && result.response) return result.response;
    if (result && result.reason) return result.reason;
    return result;
  } catch (ragErr) {
    console.warn('[failureAnalysisAgent] RAG analysis failed (' + ragErr.message + '), falling back to local heuristic analysis');
  }

  // Fallback: local heuristic analysis
  try {
    var localResult = agent.analyzeLocally(summary);
    if (localResult && localResult.response) return localResult.response;
    if (localResult && localResult.reason) return localResult.reason;
    return localResult;
  } catch (localErr) {
    console.warn('[failureAnalysisAgent] Local analysis also failed (' + localErr.message + ')');
    // Last-resort plain-text summary
    return '# Failure Analysis (Minimal)\n\n' +
      '**Failures:** ' + (summary.failures || []).length + '\n\n' +
      'AI analysis unavailable. View the cucumber report directly at `reports/json/cucumber-report.json`.\n';
  }
};

module.exports = agent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Failure Analysis Agent",
  "version": "1.0.0",
  "description": "RAG-based analysis of test failures with local heuristic fallback",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "analysis",
    "rag"
  ],
  "executionStage": "analysis",
  "priority": 80,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 1,
    "backoff": "none"
  },
  "strategy": "rag-strategy",
  "responsibilities": ["root-cause-analysis"],
  "owner": "RCAAgent",
  "lifecycle": "active"
};
