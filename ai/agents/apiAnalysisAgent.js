#!/usr/bin/env node

/**
 * AI API Analysis Agent
 * ======================
 * Reads API test results from reports/api/api-summary.json,
 * analyzes pass/fail metrics, classifies issues, identifies
 * root causes, and generates an AI-powered analysis report.
 *
 * Usage:
 *   node ai/agents/apiAnalysisAgent.js
 *   node ai/index.js --agent ApiAnalysisAgent
 *
 * Output:
 *   reports/ai/api-analysis-report.md
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SUMMARY_PATH = path.join(ROOT, 'reports/api/api-summary.json');
const AI_REPORT_DIR = path.join(ROOT, 'reports/ai');
const AI_REPORT_PATH = path.join(AI_REPORT_DIR, 'api-analysis-report.md');

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------
const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// ---------------------------------------------------------------------------
// Issue classifications
// ---------------------------------------------------------------------------
const ISSUES = {
  API_FAILURE: {
    id: 'api_failure',
    label: 'API Test Failure',
    severity: 'critical',
    description: 'One or more API test scenarios failed',
    recommendation: 'Check the API endpoint availability, request payload, authentication, and response validation.',
  },
  SLOW_RESPONSE: {
    id: 'slow_response',
    label: 'Slow API Response',
    severity: 'high',
    description: 'API response times exceed acceptable thresholds',
    recommendation: 'Investigate server-side performance, implement caching, optimize database queries, or scale resources.',
  },
  STATUS_ERROR: {
    id: 'status_error',
    label: 'Unexpected HTTP Status',
    severity: 'high',
    description: 'API returned an unexpected HTTP status code',
    recommendation: 'Verify the API endpoint contract, check for recent changes to the API, validate request format.',
  },
  MISSING_FIELD: {
    id: 'missing_field',
    label: 'Missing Response Field',
    severity: 'medium',
    description: 'Response body is missing expected fields',
    recommendation: 'Review API response schema, update test assertions to match current API contract.',
  },
  DATA_MISMATCH: {
    id: 'data_mismatch',
    label: 'Response Data Mismatch',
    severity: 'medium',
    description: 'Response field value does not match expected value',
    recommendation: 'Verify test data aligns with API expectations, check for data transformation or encoding issues.',
  },
  NORMAL: {
    id: 'normal',
    label: 'All APIs Healthy',
    severity: 'info',
    description: 'All API tests passed within acceptable thresholds',
    recommendation: 'Continue monitoring; no action required.',
  },
};

// ---------------------------------------------------------------------------
// Classify issues from results
// ---------------------------------------------------------------------------
function classifyIssues(results, summary) {
  const issues = [];

  // 1. Failed APIs
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    for (const f of failed) {
      issues.push({
        ...ISSUES.API_FAILURE,
        id: `api_failure_${f.method}_${Date.now()}`,
        scenario: f.scenario,
        method: f.method,
        url: f.url,
        actual: f.status,
        expected: '2xx or valid 4xx',
        error: f.error || `Unexpected status ${f.status}`,
        responseTime: f.responseTime,
        details: `API "${f.scenario}" (${f.method} ${f.url}) failed with status ${f.status}. Error: ${f.error || 'N/A'}`,
      });
    }
  }

  // 2. Slow responses (>5000ms)
  const slowThreshold = 5000;
  const slow = results.filter(r => r.responseTime > slowThreshold);
  if (slow.length > 0) {
    for (const s of slow) {
      issues.push({
        ...ISSUES.SLOW_RESPONSE,
        id: `slow_response_${s.method}_${Date.now()}`,
        scenario: s.scenario,
        method: s.method,
        url: s.url,
        actual: s.responseTime,
        threshold: slowThreshold,
        responseTime: s.responseTime,
        details: `API "${s.scenario}" responded in ${s.responseTime}ms (threshold: ${slowThreshold}ms)`,
      });
    }
  }

  // 3. Unexpected status codes (not 2xx and not expected 4xx for negative tests)
  const unexpectedStatus = results.filter(r =>
    !r.passed && r.status >= 400 && r.status !== 404 && r.status !== 400 && r.status !== 422
  );
  if (unexpectedStatus.length > 0) {
    for (const u of unexpectedStatus) {
      issues.push({
        ...ISSUES.STATUS_ERROR,
        id: `status_error_${u.method}_${Date.now()}`,
        scenario: u.scenario,
        method: u.method,
        url: u.url,
        actual: u.status,
        responseTime: u.responseTime,
        details: `API "${u.scenario}" returned status ${u.status}`,
      });
    }
  }

  if (issues.length === 0) {
    issues.push(ISSUES.NORMAL);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Compute health score
// ---------------------------------------------------------------------------
function computeHealthScore(results) {
  if (results.length === 0) return 100;
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const baseScore = (passed / total) * 100;

  // Penalize for slow responses
  const slowCount = results.filter(r => r.responseTime > 5000).length;
  const slowPenalty = Math.min(slowCount * 5, 20);

  return Math.max(0, Math.round(baseScore - slowPenalty));
}

// ---------------------------------------------------------------------------
// Generate analysis report
// ---------------------------------------------------------------------------
async function generateReport(summary, issues) {
  const now = new Date().toISOString();
  const results = summary.results || [];
  const total = summary.totalAPIs || results.length;
  const passed = summary.passed || results.filter(r => r.passed).length;
  const failed = summary.failed || results.filter(r => !r.passed).length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  const healthScore = computeHealthScore(results);

  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasHigh = issues.some(i => i.severity === 'high');
  const hasMedium = issues.some(i => i.severity === 'medium');
  const allNormal = issues.length === 1 && issues[0].id === 'normal';

  let overallStatus;
  if (allNormal) overallStatus = '✅ HEALTHY';
  else if (hasCritical) overallStatus = '❌ CRITICAL';
  else if (hasHigh) overallStatus = '⚠️  DEGRADED';
  else overallStatus = '⚠️  WARNING';

  // Status code distribution
  const statusCounts = {};
  results.forEach(r => {
    const key = r.status || 'error';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  // Method distribution
  const methodCounts = {};
  results.forEach(r => {
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
  });

  const lines = [];
  lines.push('# 🤖 AI API Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Overall Status:** ${overallStatus}`);
  lines.push(`**Health Score:** ${healthScore}/100`);
  lines.push(`**Data Source:** reports/api/api-summary.json`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 📋 Execution Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total APIs Executed | ${total} |`);
  lines.push(`| Passed | ${passed} |`);
  lines.push(`| Failed | ${failed} |`);
  lines.push(`| Pass % | ${passRate}% |`);
  lines.push(`| Health Score | ${healthScore}/100 |`);
  lines.push(`| Average Response Time | ${summary.avgResponseTime || 'N/A'} |`);
  lines.push(`| Fastest API | ${summary.fastestAPI || 'N/A'} |`);
  lines.push(`| Slowest API | ${summary.slowestAPI || 'N/A'} |`);
  lines.push(`| Execution Duration | ${summary.executionDuration || 'N/A'} |`);
  lines.push('');
  lines.push('## 📊 HTTP Method Coverage');
  lines.push('');
  lines.push('| Method | Count |');
  lines.push('|--------|-------|');
  Object.entries(methodCounts).sort().forEach(([method, count]) => {
    lines.push(`| ${method} | ${count} |`);
  });
  lines.push('');
  lines.push('## 🔢 Status Code Distribution');
  lines.push('');
  lines.push('| Status Code | Count | Interpretation |');
  lines.push('|-------------|-------|----------------|');
  Object.entries(statusCounts).sort(([a], [b]) => a - b).forEach(([code, count]) => {
    const codeNum = parseInt(code);
    let interp = codeNum >= 200 && codeNum < 300 ? '✅ Success' :
                 codeNum === 400 ? '⚠️ Bad Request' :
                 codeNum === 404 ? '⚠️ Not Found (valid negative)' :
                 codeNum >= 400 && codeNum < 500 ? '❌ Client Error' :
                 codeNum >= 500 ? '❌ Server Error' : '—';
    lines.push(`| ${code} | ${count} | ${interp} |`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🔍 Detected Issues');
  lines.push('');

  if (allNormal) {
    lines.push('✅ **No issues detected.** All API endpoints responded correctly within acceptable time limits.');
    lines.push('');
  } else {
    const bySeverity = { critical: [], high: [], medium: [], info: [] };
    issues.forEach(i => { bySeverity[i.severity] = bySeverity[i.severity] || []; bySeverity[i.severity].push(i); });

    if (bySeverity.critical.length > 0) {
      lines.push('### 🔴 Critical Issues');
      lines.push('');
      for (const issue of bySeverity.critical) {
        lines.push(`- **${issue.scenario}** (${issue.method} ${issue.url})`);
        lines.push(`  - **Error:** ${issue.error || issue.details}`);
        lines.push(`  - **Status:** ${issue.actual}`);
        lines.push(`  - **Response Time:** ${issue.responseTime}ms`);
        lines.push(`  - **Recommendation:** ${issue.recommendation}`);
        lines.push('');
      }
    }

    if (bySeverity.high.length > 0) {
      lines.push('### 🟠 High Severity');
      lines.push('');
      for (const issue of bySeverity.high) {
        lines.push(`- **${issue.scenario}** (${issue.method} ${issue.url})`);
        lines.push(`  - **Detail:** ${issue.details}`);
        lines.push(`  - **Recommendation:** ${issue.recommendation}`);
        lines.push('');
      }
    }

    if (bySeverity.medium.length > 0) {
      lines.push('### 🟡 Medium Severity');
      lines.push('');
      for (const issue of bySeverity.medium) {
        lines.push(`- **${issue.scenario}** (${issue.method} ${issue.url})`);
        lines.push(`  - **Detail:** ${issue.details}`);
        lines.push(`  - **Recommendation:** ${issue.recommendation}`);
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## 🧠 Root Cause Analysis');
  lines.push('');

  const failedApis = results.filter(r => !r.passed);
  const slow = results.filter(r => r.responseTime > 5000);

  if (failedApis.length === 0 && slow.length === 0) {
    lines.push('✅ **No failures detected.** All API endpoints responded as expected.');
    lines.push('');
  } else {
    if (failedApis.length > 0) {
      lines.push('### ❌ Failed API Analysis');
      lines.push('');
      for (const f of failedApis) {
        lines.push(`**${f.scenario}** (${f.method} ${f.url})`);
        lines.push('');
        lines.push('| Attribute | Value |');
        lines.push('|-----------|-------|');
        lines.push(`| HTTP Status | ${f.status} |`);
        lines.push(`| Response Time | ${f.responseTime}ms |`);
        lines.push(`| Error | ${f.error || 'N/A'} |`);
        lines.push('');
        lines.push('**Probable Root Causes:**');
        lines.push('- API endpoint may be unavailable or experiencing downtime');
        if (f.status === 404) lines.push('- Resource not found — verify the resource ID or path');
        if (f.status === 400 || f.status === 422) lines.push('- Request payload validation failed — check request body schema');
        if (f.status === 500) lines.push('- Server-side error — check server logs for exceptions');
        if (f.status === 429) lines.push('- Rate limiting — reduce request frequency or add retry logic');
        if (f.status === 401 || f.status === 403) lines.push('- Authentication/authorization issue — check API keys or tokens');
        if (f.status === 0 || !f.status) lines.push('- Network error — check connectivity, DNS, or firewall');
        lines.push('');
        lines.push('**Suggested Fix:**');
        if (f.status === 404) lines.push('- Use a valid resource ID or verify the endpoint path in the test data');
        else if (f.status >= 500) lines.push('- Report to API team, check server health, retry after server recovers');
        else if (f.status >= 400) lines.push('- Update the request payload or headers to match API contract');
        else lines.push('- Review the test step, verify API availability, and check for infrastructure issues');
        lines.push('');
      }
    }

    if (slow.length > 0 && failedApis.length === 0) {
      lines.push('### ⏱️ Slow API Analysis');
      lines.push('');
      for (const s of slow) {
        lines.push(`- **${s.scenario}** (${s.method} ${s.url}): ${s.responseTime}ms`);
      }
      lines.push('');
      lines.push('**Probable Root Causes:**');
      lines.push('- Server under heavy load or insufficient resources');
      lines.push('- Network latency between client and server');
      lines.push('- Database query performance issues');
      lines.push('- Lack of caching for frequently accessed endpoints');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## 📈 Response Time Analysis');
  lines.push('');

  if (results.length > 0) {
    const times = results.map(r => r.responseTime);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const sorted = [...times].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Average | ${avg}ms |`);
    lines.push(`| Minimum | ${min}ms |`);
    lines.push(`| Maximum | ${max}ms |`);
    lines.push(`| P50 (Median) | ${p50}ms |`);
    lines.push(`| P90 | ${p90}ms |`);
    lines.push(`| P95 | ${p95}ms |`);
    lines.push('');
    lines.push(`**Assessment:** ${max > 5000 ? '⚠️ Some endpoints exceeded the 5000ms threshold.' : '✅ All endpoints responded within acceptable time limits.'}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 💡 Recommendations');
  lines.push('');
  lines.push('1. **Increase Test Coverage:** Add edge-case and boundary scenarios for each endpoint.');
  lines.push('2. **Data-Driven Testing:** Expand test-data/api/apiData.json with more payload variations.');
  lines.push('3. **CI/CD Integration:** Run API tests as a quality gate before deployment.');
  lines.push('4. **Monitor Slow Endpoints:** Set up alerting for endpoints exceeding 5000ms response time.');
  lines.push('5. **Version Contract:** Pin API version in test configuration to avoid breaking changes.');
  lines.push('6. **Security Headers:** Verify all endpoints return proper security headers (CORS, CSP, etc.).');
  lines.push('7. **Regular Review:** Periodically review API test coverage to align with evolving API contracts.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated by AI API Analysis Agent*`);
  lines.push(`*Agent: apiAnalysisAgent.js*`);

  const content = lines.join('\n');
  fs.ensureDirSync(AI_REPORT_DIR);
  fs.writeFileSync(AI_REPORT_PATH, content);
  console.log(`📄 AI API Analysis Report: ${AI_REPORT_PATH}`);

  return content;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run(input = {}) {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AI API Analysis Agent                       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const summaryPath = input.summaryPath || SUMMARY_PATH;
  if (!fs.existsSync(summaryPath)) {
    const msg = `API summary not found at ${summaryPath}. Run "npm run test:api" first.`;
    console.error(`❌ ${msg}`);
    return { ok: false, error: msg };
  }

  let summary;
  try {
    summary = fs.readJsonSync(summaryPath);
  } catch (err) {
    const msg = `Failed to parse ${summaryPath}: ${err.message}`;
    console.error(`❌ ${msg}`);
    return { ok: false, error: msg };
  }

  const results = summary.results || [];
  console.log(`✅ Loaded ${results.length} API results`);

  // Classify issues
  const issues = classifyIssues(results, summary);
  const failed = issues.filter(i => i.severity === 'critical').length;
  const warnings = issues.filter(i => i.severity === 'high' || i.severity === 'medium').length;
  console.log(`✅ Analysis complete: ${failed} failures, ${warnings} warnings`);

  // Generate report
  const content = await generateReport(summary, issues);

  return {
    ok: true,
    outputPath: path.relative(ROOT, AI_REPORT_PATH),
    totalAPIs: summary.totalAPIs || results.length,
    passed: summary.passed || results.filter(r => r.passed).length,
    failed: summary.failed || results.filter(r => !r.passed).length,
    healthScore: computeHealthScore(results),
    issues: issues.length,
    criticalCount: issues.filter(i => i.severity === 'critical').length,
    warningCount: issues.filter(i => i.severity === 'high' || i.severity === 'medium').length,
  };
}

// Standalone execution
if (require.main === module) {
  run().then(result => {
    if (result.ok) {
      console.log(`\n${C.green}✅ API Analysis Agent completed successfully${C.reset}`);
      console.log(`   Report: ${result.outputPath}`);
      process.exit(0);
    } else {
      console.error(`\n${C.red}❌ API Analysis Agent failed: ${result.error}${C.reset}`);
      process.exit(1);
    }
  }).catch(err => {
    console.error(`\n${C.red}❌ ${err.message}${C.reset}`);
    process.exit(1);
  });
}

class ApiAnalysisAgentWrapper {
  async run(input) {
    return run(input);
  }
}
module.exports = ApiAnalysisAgentWrapper;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "API Analysis Agent",
  "version": "1.0.0",
  "description": "Reads API test results, analyzes pass/fail metrics, generates AI analysis report",
  "dependencies": ["APIAgent"],
  "platforms": [
    "API"
  ],
  "tags": [
    "api",
    "analysis"
  ],
  "executionStage": "analysis",
  "priority": 60,
  "conditions": [
    {
      "type": "platform",
      "value": "api"
    },
    {
      "type": "hasResults"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
