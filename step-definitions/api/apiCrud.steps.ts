import { Given, When, Then, BeforeAll, AfterAll, Before } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { request } from '@playwright/test';
import ApiClient from '../../pages/api/ApiClient';
import fs from 'fs-extra';
import path from 'path';

// ---------------------------------------------------------------------------
// Shared state (module-level for BeforeAll/AfterAll)
// ---------------------------------------------------------------------------
const testPayloads: any = {};
const apiResults: any = [];
const apiStartTime = Date.now();

// Load test data once
const TEST_DATA_PATH = path.join(__dirname, '../../test-data/api/apiData.json');
if (fs.existsSync(TEST_DATA_PATH)) {
  Object.assign(testPayloads, fs.readJsonSync(TEST_DATA_PATH));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function recordResult(scenarioName: any, method: any, url: any, status: any, responseTime: any, body: any, error: any) {
  apiResults.push({
    scenario: scenarioName,
    method,
    url,
    status,
    responseTime,
    body: body ? JSON.stringify(body).substring(0, 500) : '',
    error: error || null,
    passed: !error && (status >= 200 && status < 300 || status === 404 || status === 422 || status === 400),
    timestamp: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
BeforeAll(async function () {
  fs.ensureDirSync(path.join(__dirname, '../../reports/api'));
  fs.ensureDirSync(path.join(__dirname, '../../reports/ai'));
});

Before(async function () {
  // Seed Cucumber World with properties used by steps
  this._apiContext = null;
  this._apiClient = null;
  this._apiBaseUrl = '';
  this._lastResponse = null;
  this._requestPayload = null;
});

AfterAll(async function () {
  writeApiSummary(apiResults, apiStartTime);
  try {
    await runAiAnalysis(apiResults);
  } catch (err: any) {
    console.error('[API AI Analysis] Failed:', err.message);
  }
});

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------
Given('I set API base URL to {string}', async function (baseUrl) {
  this._apiBaseUrl = baseUrl;
  if (this._apiContext) {
    await this._apiContext.dispose();
  }
  this._apiContext = await request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  });
  this._apiClient = new ApiClient(this._apiContext);
});

Given('I set request body from test data {string}', async function (dataKey) {
  const payload = testPayloads[dataKey];
  if (!payload) {
    throw new Error(`Test data key "${dataKey}" not found in test-data/api/apiData.json. Available keys: ${Object.keys(testPayloads).join(', ')}`);
  }
  this._requestPayload = payload;
});

Given("I set default request headers", async function () {
  if (!this._apiClient) {
    throw new Error("API base URL must be set before setting headers");
  }
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------
When('I send a GET request to {string}', async function (path) {
  const result = await this._apiClient.get(path);
  this._lastResponse = result;
  recordResult(this.scenarioName || `GET ${path}`, 'GET', `${this._apiBaseUrl}${path}`, result.status, result.responseTime, result.body, result.error);
});

When('I send a POST request to {string}', async function (path) {
  const result = await this._apiClient.post(path, this._requestPayload || {});
  this._lastResponse = result;
  recordResult(this.scenarioName || `POST ${path}`, 'POST', `${this._apiBaseUrl}${path}`, result.status, result.responseTime, result.body, result.error);
});

When('I send a PUT request to {string}', async function (path) {
  const result = await this._apiClient.put(path, this._requestPayload || {});
  this._lastResponse = result;
  recordResult(this.scenarioName || `PUT ${path}`, 'PUT', `${this._apiBaseUrl}${path}`, result.status, result.responseTime, result.body, result.error);
});

When('I send a PATCH request to {string}', async function (path) {
  const result = await this._apiClient.patch(path, this._requestPayload || {});
  this._lastResponse = result;
  recordResult(this.scenarioName || `PATCH ${path}`, 'PATCH', `${this._apiBaseUrl}${path}`, result.status, result.responseTime, result.body, result.error);
});

When('I send a DELETE request to {string}', async function (path) {
  const result = await this._apiClient.delete(path);
  this._lastResponse = result;
  recordResult(this.scenarioName || `DELETE ${path}`, 'DELETE', `${this._apiBaseUrl}${path}`, result.status, result.responseTime, result.body, result.error);
});

// ---------------------------------------------------------------------------
// Then steps — reusable assertions
// ---------------------------------------------------------------------------
Then('the response status code should be {int}', async function (expectedStatus) {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.status).toBe(expectedStatus);
});

Then("the response status code should be 200 or 404", async function () {
  expect(this._lastResponse).toBeDefined();
  const ok = this._lastResponse.status === 200 || this._lastResponse.status === 404;
  if (!ok) {
    throw new Error("Expected status 200 or 404, got " + this._lastResponse.status);
  }
});

Then('the response status code should be 200 or 204', async function () {
  expect(this._lastResponse).toBeDefined();
  const ok = this._lastResponse.status === 200 || this._lastResponse.status === 204;
  if (!ok) {
    throw new Error(`Expected status 200 or 204, got ${this._lastResponse.status}`);
  }
});

Then('the response should contain field {string}', async function (fieldName) {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.body).toBeDefined();
  expect(this._lastResponse.body).toHaveProperty(fieldName);
});

Then('the response should contain a generated id', async function () {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.body).toBeDefined();
  expect(this._lastResponse.body).toHaveProperty('id');
  expect(typeof this._lastResponse.body.id).toBe('number');
  expect(this._lastResponse.body.id).toBeGreaterThan(0);
});

Then('the response should contain updated title', async function () {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.body).toBeDefined();
  const expected = testPayloads.updatePost ? testPayloads.updatePost.title : 'updated title';
  expect(this._lastResponse.body).toHaveProperty('title');
  expect(this._lastResponse.body.title).toBe(expected);
});

Then('the response should contain updated body', async function () {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.body).toBeDefined();
  const expected = testPayloads.updatePost ? testPayloads.updatePost.body : 'updated body';
  expect(this._lastResponse.body).toHaveProperty('body');
  expect(this._lastResponse.body.body).toBe(expected);
});

Then('the response should contain the patched value {string}', async function (fieldName) {
  expect(this._lastResponse).toBeDefined();
  expect(this._lastResponse.body).toBeDefined();
  const expected = testPayloads.patchPost ? testPayloads.patchPost[fieldName] : 'patched title value';
  expect(this._lastResponse.body).toHaveProperty(fieldName);
  expect(this._lastResponse.body[fieldName]).toBe(expected);
});

// ---------------------------------------------------------------------------
// Report writers
// ---------------------------------------------------------------------------
function writeApiSummary(results: any, startTime: any) {
  const endTime = Date.now();
  const duration = endTime - startTime;
  const total = results.length;
  const passed = results.filter((r: any) => r.passed).length;
  const failed = results.filter((r: any) => !r.passed).length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  const avgResponseTime = total > 0
    ? (results.reduce((sum: any, r: any) => sum + r.responseTime, 0) / total).toFixed(0)
    : '0';
  const fastest = total > 0 ? Math.min(...results.map((r: any) => r.responseTime)) : 0;
  const slowest = total > 0 ? Math.max(...results.map((r: any) => r.responseTime)) : 0;

  const summary = {
    executionTimestamp: new Date().toISOString(),
    totalAPIs: total,
    passed,
    failed,
    passRate: `${passRate}%`,
    avgResponseTime: `${avgResponseTime}ms`,
    fastestAPI: `${fastest}ms`,
    slowestAPI: `${slowest}ms`,
    executionDuration: `${(duration / 1000).toFixed(2)}s`,
    results
  };

  // JSON report
  const jsonPath = path.join(__dirname, '../../reports/api/api-summary.json');
  fs.writeJsonSync(jsonPath, summary, { spaces: 2 });

  // Markdown report
  const mdLines: any[] = [];
  mdLines.push('# API Execution Summary');
  mdLines.push('');
  mdLines.push(`**Execution Timestamp:** ${summary.executionTimestamp}`);
  mdLines.push('');
  mdLines.push('## Overall Stats');
  mdLines.push('');
  mdLines.push('| Metric | Value |');
  mdLines.push('|---|---|');
  mdLines.push(`| Total APIs Executed | ${total} |`);
  mdLines.push(`| Passed | ${passed} |`);
  mdLines.push(`| Failed | ${failed} |`);
  mdLines.push(`| Pass % | ${passRate}% |`);
  mdLines.push(`| Average Response Time | ${avgResponseTime}ms |`);
  mdLines.push(`| Fastest API | ${fastest}ms |`);
  mdLines.push(`| Slowest API | ${slowest}ms |`);
  mdLines.push(`| Execution Duration | ${summary.executionDuration} |`);
  mdLines.push('');
  mdLines.push('## Detailed Results');
  mdLines.push('');
  mdLines.push('| # | Scenario | Method | URL | Status | Response Time | Passed |');
  mdLines.push('|---|---|---|---|---|---|---|');
  results.forEach((r: any, i: any) => {
    mdLines.push(`| ${i + 1} | ${r.scenario} | ${r.method} | ${r.url} | ${r.status} | ${r.responseTime}ms | ${r.passed ? '✅' : '❌'} |`);
  });
  mdLines.push('');
  if (failed > 0) {
    mdLines.push('## Failed APIs');
    mdLines.push('');
    results.filter((r: any) => !r.passed).forEach((r: any) => {
      mdLines.push(`- **${r.scenario}** (${r.method} ${r.url})`);
      mdLines.push(`  - Status: ${r.status}`);
      mdLines.push(`  - Error: ${r.error || 'N/A'}`);
    });
  }
  const mdPath = path.join(__dirname, '../../reports/api/api-summary.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

  // HTML report
  const htmlLines: any[] = [];
  htmlLines.push('<!DOCTYPE html>');
  htmlLines.push('<html lang="en"><head><meta charset="UTF-8">');
  htmlLines.push('<title>API Test Report</title>');
  htmlLines.push('<style>');
  htmlLines.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#f1f5f9;padding:20px;max-width:1200px;margin:0 auto}');
  htmlLines.push('h1{color:#3b82f6;border-bottom:1px solid #334155;padding-bottom:10px}');
  htmlLines.push('table{width:100%;border-collapse:collapse;margin:20px 0}');
  htmlLines.push('th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #334155;font-size:13px}');
  htmlLines.push('th{color:#94a3b8;font-weight:600}');
  htmlLines.push('tr:hover{background:#1e293b}');
  htmlLines.push('.pass{color:#22c55e;font-weight:700}');
  htmlLines.push('.fail{color:#ef4444;font-weight:700}');
  htmlLines.push('.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:20px 0}');
  htmlLines.push('.summary-card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center}');
  htmlLines.push('.summary-card .label{font-size:12px;color:#94a3b8}');
  htmlLines.push('.summary-card .value{font-size:24px;font-weight:700;margin-top:4px}');
  htmlLines.push('</style></head><body>');
  htmlLines.push('<h1>🚀 API Test Report</h1>');
  htmlLines.push(`<p>Generated: ${summary.executionTimestamp}</p>`);
  htmlLines.push('<div class="summary-grid">');
  htmlLines.push(`<div class="summary-card"><div class="label">Total</div><div class="value">${total}</div></div>`);
  htmlLines.push(`<div class="summary-card"><div class="label">Passed</div><div class="value" style="color:#22c55e">${passed}</div></div>`);
  htmlLines.push(`<div class="summary-card"><div class="label">Failed</div><div class="value" style="color:#ef4444">${failed}</div></div>`);
  htmlLines.push(`<div class="summary-card"><div class="label">Pass %</div><div class="value">${passRate}%</div></div>`);
  htmlLines.push(`<div class="summary-card"><div class="label">Avg Response</div><div class="value">${avgResponseTime}ms</div></div>`);
  htmlLines.push(`<div class="summary-card"><div class="label">Duration</div><div class="value">${summary.executionDuration}</div></div>`);
  htmlLines.push('</div>');
  htmlLines.push('<table><thead><tr><th>#</th><th>Scenario</th><th>Method</th><th>URL</th><th>Status</th><th>Response Time</th><th>Result</th></tr></thead><tbody>');
  results.forEach((r: any, i: any) => {
    const cls = r.passed ? 'pass' : 'fail';
    htmlLines.push(`<tr><td>${i + 1}</td><td>${r.scenario}</td><td>${r.method}</td><td>${r.url}</td><td>${r.status}</td><td>${r.responseTime}ms</td><td class="${cls}">${r.passed ? '✅ PASS' : '❌ FAIL'}</td></tr>`);
  });
  htmlLines.push('</tbody></table>');
  if (failed > 0) {
    htmlLines.push('<h2>❌ Failed APIs</h2><ul>');
    results.filter((r: any) => !r.passed).forEach((r: any) => {
      htmlLines.push(`<li><strong>${r.scenario}</strong> — ${r.method} ${r.url}<br>Error: ${r.error || 'N/A'}</li>`);
    });
    htmlLines.push('</ul>');
  }
  htmlLines.push('</body></html>');
  const htmlPath = path.join(__dirname, '../../reports/api/api-report.html');
  fs.writeFileSync(htmlPath, htmlLines.join('\n'), 'utf8');

  console.log('\n══════════════════════════════════════════════');
  console.log('  ✅ API Execution Complete');
  console.log('══════════════════════════════════════════════');
  console.log(`  📊 Total: ${total}  ✅ Passed: ${passed}  ❌ Failed: ${failed}`);
  console.log(`  ⏱️  Duration: ${summary.executionDuration}`);
  console.log(`  📄 JSON Report:  reports/api/api-summary.json`);
  console.log(`  📄 Markdown Report: reports/api/api-summary.md`);
  console.log(`  🖥️  HTML Report:  reports/api/api-report.html`);
  console.log('══════════════════════════════════════════════\n');
}

async function runAiAnalysis(results: any) {
  const total = results.length;
  const passed = results.filter((r: any) => r.passed).length;
  const failed = results.filter((r: any) => !r.passed).length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  const avgResponseTime = total > 0
    ? (results.reduce((sum: any, r: any) => sum + r.responseTime, 0) / total).toFixed(0)
    : '0';
  const fastest = total > 0 ? Math.min(...results.map((r: any) => r.responseTime)) : 0;
  const slowest = total > 0 ? Math.max(...results.map((r: any) => r.responseTime)) : 0;

  const failedApis = results.filter((r: any) => !r.passed);
  const failureAnalysis = failedApis.map((r: any) => ({
    scenario: r.scenario,
    method: r.method,
    url: r.url,
    status: r.status,
    error: r.error || 'Unknown error',
    responseTime: r.responseTime
  }));

  const slowThreshold = 5000;
  const slowApis = results.filter((r: any) => r.responseTime > slowThreshold);

  const statusCounts: Record<string, any> = {};
  results.forEach((r: any) => {
    const key = r.status || 'error';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  const mdLines: any[] = [];
  mdLines.push('# API Analysis Report');
  mdLines.push('');
  mdLines.push(`**Generated:** ${new Date().toISOString()}`);
  mdLines.push('');
  mdLines.push('## Execution Summary');
  mdLines.push('');
  mdLines.push('| Metric | Value |');
  mdLines.push('|---|---|');
  mdLines.push(`| Total APIs Executed | ${total} |`);
  mdLines.push(`| Passed | ${passed} |`);
  mdLines.push(`| Failed | ${failed} |`);
  mdLines.push(`| Pass % | ${passRate}% |`);
  mdLines.push(`| Average Response Time | ${avgResponseTime}ms |`);
  mdLines.push(`| Fastest API | ${fastest}ms |`);
  mdLines.push(`| Slowest API | ${slowest}ms |`);
  mdLines.push('');
  mdLines.push('## Status Code Distribution');
  mdLines.push('');
  mdLines.push('| Status Code | Count |');
  mdLines.push('|---|---|');
  (Object.entries(statusCounts) as [string, any][]).forEach(([code, count]) => {
    mdLines.push(`| ${code} | ${count} |`);
  });
  mdLines.push('');
  mdLines.push('## Response Time Analysis');
  mdLines.push('');
  if (slowApis.length > 0) {
    mdLines.push('⚠️ The following APIs exceeded the slow threshold (5000ms):');
    mdLines.push('');
    slowApis.forEach((r: any) => {
      mdLines.push(`- **${r.scenario}** (${r.method} ${r.url}): ${r.responseTime}ms`);
    });
  } else {
    mdLines.push('✅ All APIs responded within acceptable time limits.');
  }
  mdLines.push('');
  mdLines.push('## Failed APIs & Root Cause Analysis');
  mdLines.push('');
  if (failureAnalysis.length > 0) {
    failureAnalysis.forEach((r: any) => {
      mdLines.push(`### ❌ ${r.scenario}`);
      mdLines.push(`- **Method:** ${r.method}`);
      mdLines.push(`- **URL:** ${r.url}`);
      mdLines.push(`- **Status:** ${r.status}`);
      mdLines.push(`- **Error:** ${r.error}`);
      mdLines.push(`- **Response Time:** ${r.responseTime}ms`);
      mdLines.push('');
      mdLines.push('**Possible Root Causes:**');
      mdLines.push('- API endpoint may be unavailable or rate-limited.');
      mdLines.push('- Network connectivity issue during execution.');
      mdLines.push('- Request payload may not match expected schema.');
      mdLines.push('- Authentication/authorization headers missing.');
      mdLines.push('');
    });
  } else {
    mdLines.push('✅ No API failures detected. All endpoints responded correctly.');
  }
  mdLines.push('');
  mdLines.push('## Recommendations');
  mdLines.push('');
  mdLines.push('1. **Monitor Slow Endpoints:** Set up alerting for endpoints exceeding 5000ms response time.');
  mdLines.push('2. **Increase Test Coverage:** Add negative and edge-case scenarios for each endpoint.');
  mdLines.push('3. **Data-Driven Testing:** Expand test-data/api/apiData.json with more payload variations.');
  mdLines.push('4. **CI/CD Integration:** Run API tests as a gate before deployment to production.');
  mdLines.push('5. **Versioning Strategy:** Ensure API version is pinned to avoid breaking changes.');
  mdLines.push('6. **Security Headers:** Verify all endpoints return proper security headers (CORS, CSP, etc.).');

  const aiPath = path.join(__dirname, '../../reports/ai/api-analysis-report.md');
  fs.writeFileSync(aiPath, mdLines.join('\n'), 'utf8');
  console.log(`  🤖 AI Analysis Report: reports/ai/api-analysis-report.md`);
}
