// APIAgent - Generates API test scenarios and validates API endpoints with Playwright request context
// SECURITY: All generated step definitions use request.newContext() — NEVER this.page.request.
// API tests MUST NEVER create or interact with any browser (Chromium, Firefox, WebKit).
const fs = require('fs-extra');
const path = require('path');
const { request } = require('@playwright/test');

module.exports = {
  run: async function run(input = {}) {
    console.log('[APIAgent] Analyzing and generating API tests');

    const apiSpecDir = input.apiSpecDir || path.join(process.cwd(), 'ai/input/api-specs');
    const outputDir = input.outputDir || path.join(process.cwd(), 'ai/generated-features');
    fs.ensureDirSync(outputDir);

    const specFiles = [];
    if (fs.existsSync(apiSpecDir)) {
      for (const f of fs.readdirSync(apiSpecDir)) {
        if (f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')) {
          specFiles.push(path.join(apiSpecDir, f));
        }
      }
    }

    let endpoints = specFiles.length > 0 ? parseSpecFiles(specFiles) : getDefaultEndpoints();

    // Generate API test feature file
    const outPath = path.join(outputDir, 'api-tests.feature');
    const lines = [];

    lines.push('@api @generated');
    lines.push('Feature: API Tests');
    lines.push('');
    lines.push('  Background:');
    lines.push('    Given I set API base URL from environment');
    lines.push('    And I set default request headers');
    lines.push('');

    let testCounter = 0;
    for (const ep of endpoints) {
      // Positive test
      testCounter++;
      lines.push('  @api-positive @api-' + ep.method.toLowerCase());
      lines.push('  Scenario: ' + ep.method + ' ' + ep.path + ' should return ' + (ep.expectedStatus || 200));
      lines.push('    When I send a ' + ep.method + ' request to "' + ep.path + '"');
      if (ep.body) {
        lines.push('    And I set request body: ' + JSON.stringify(ep.body));
      }
      lines.push('    Then the response status should be ' + (ep.expectedStatus || 200));
      lines.push('    And the response should contain valid JSON');
      lines.push('');

      // Negative test (unauthorized)
      testCounter++;
      lines.push('  @api-negative');
      lines.push('  Scenario: ' + ep.method + ' ' + ep.path + ' without auth should return 401');
      lines.push('    When I send a ' + ep.method + ' request to "' + ep.path + '" without auth');
      lines.push('    Then the response status should be 401');
      lines.push('');

      // Negative test (invalid payload) for POST/PUT/PATCH
      if ((ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') && ep.body) {
        testCounter++;
        lines.push('  @api-negative @api-boundary');
        lines.push('  Scenario: ' + ep.method + ' ' + ep.path + ' with invalid payload should return 400');
        lines.push('    When I send a ' + ep.method + ' request to "' + ep.path + '" with invalid payload');
        lines.push('    Then the response status should be 400');
        lines.push('');
      }
    }

    // Security tests
    lines.push('  @api-security');
    lines.push('  Scenario: API should reject malformed requests');
    lines.push('    When I send a request with malformed headers');
    lines.push('    Then the response status should be 400');
    lines.push('');

    lines.push('  @api-security');
    lines.push('  Scenario: API should have proper CORS headers');
    lines.push('    When I send an OPTIONS request to "/"');
    lines.push('    Then the response should have CORS headers');
    lines.push('');

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    // Generate step definitions for API tests
    // IMPORTANT: Uses request.newContext() — NEVER this.page.request.
    // API tests must NEVER depend on a browser Page instance.
    const stepDefPath = path.join(process.cwd(), 'step-definitions', 'api-steps.js');
    const stepLines = [];

    stepLines.push("const { Given, When, Then } = require('@cucumber/cucumber');");
    stepLines.push("const { expect, request } = require('@playwright/test');");
    stepLines.push('');
    stepLines.push('// API test context — NO browser, NO Page, NO BrowserContext');
    stepLines.push('// Uses Playwright APIRequestContext exclusively.');
    stepLines.push('let apiContext;');
    stepLines.push('let response;');
    stepLines.push('let responseBody;');
    stepLines.push('');
    stepLines.push("Given('I set API base URL from environment', async function () {");
    stepLines.push('  this.apiBaseUrl = process.env.API_BASE_URL || process.env.BASE_URL;');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("Given('I set default request headers', async function () {");
    stepLines.push('  // Create standalone APIRequestContext — no browser required');
    stepLines.push('  apiContext = await request.newContext({');
    stepLines.push('    baseURL: this.apiBaseUrl,');
    stepLines.push('    extraHTTPHeaders: {');
    stepLines.push("      'Content-Type': 'application/json',");
    stepLines.push("      'Accept': 'application/json'");
    stepLines.push('    }');
    stepLines.push('  });');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("When('I send a {word} request to {string}', async function (method, path) {");
    stepLines.push('  // Using apiContext.fetch() — no browser page involved');
    stepLines.push('  response = await apiContext.fetch(path, { method: method });');
    stepLines.push('  responseBody = await response.json();');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("When('I send a {word} request to {string} without auth', async function (method, path) {");
    stepLines.push('  response = await apiContext.fetch(path, {');
    stepLines.push('    method: method,');
    stepLines.push('    headers: { "Content-Type": "application/json" }');
    stepLines.push('  });');
    stepLines.push('  responseBody = await response.text();');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("When('I send a {word} request to {string} with invalid payload', async function (method, path) {");
    stepLines.push('  response = await apiContext.fetch(path, {');
    stepLines.push('    method: method,');
    stepLines.push('    data: { invalid: true, test: "" }');
    stepLines.push('  });');
    stepLines.push('  responseBody = await response.text();');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("Then('the response status should be {int}', async function (statusCode) {");
    stepLines.push('  expect(response.status()).toBe(statusCode);');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("Then('the response should contain valid JSON', async function () {");
    stepLines.push('  expect(() => JSON.parse(responseBody || response)).not.toThrow();');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("When('I send a request with malformed headers', async function () {");
    stepLines.push('  response = await apiContext.fetch(this.apiBaseUrl, {');
    stepLines.push('    headers: { "": "" }');
    stepLines.push('  });');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("When('I send an OPTIONS request to {string}', async function (path) {");
    stepLines.push('  response = await apiContext.fetch(path, { method: "OPTIONS" });');
    stepLines.push('});');
    stepLines.push('');
    stepLines.push("Then('the response should have CORS headers', async function () {");
    stepLines.push('  const headers = response.headers();');
    stepLines.push("  expect(headers['access-control-allow-origin']).toBeDefined();");
    stepLines.push('});');
    stepLines.push('');

    if (!fs.existsSync(stepDefPath)) {
      fs.writeFileSync(stepDefPath, stepLines.join('\n'), 'utf8');
    }

    // Generate report
    const reportPath = path.join(process.cwd(), 'reports/ai', 'api-test-report.md');
    const reportLines = [];
    reportLines.push('# API Test Generation Report');
    reportLines.push('');
    reportLines.push('Generated: ' + new Date().toISOString());
    reportLines.push('');
    reportLines.push('## Summary');
    reportLines.push('');
    reportLines.push('| Metric | Value |');
    reportLines.push('|---|---|');
    reportLines.push('| API Specifications Found | ' + specFiles.length + ' |');
    reportLines.push('| Endpoints Analyzed | ' + endpoints.length + ' |');
    reportLines.push('| Test Scenarios Generated | ' + testCounter + ' |');
    reportLines.push('| Feature File | ' + path.relative(process.cwd(), outPath) + ' |');
    reportLines.push('| Step Definitions | ' + path.relative(process.cwd(), stepDefPath) + ' |');
    reportLines.push('');
    reportLines.push('## Endpoints');
    reportLines.push('');
    reportLines.push('| Method | Path | Expected Status |');
    reportLines.push('|---|---|---|');
    for (const ep of endpoints) {
      reportLines.push('| ' + ep.method + ' | ' + ep.path + ' | ' + (ep.expectedStatus || 200) + ' |');
    }

    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      featureFile: path.relative(process.cwd(), outPath),
      endpoints: endpoints.length,
      testScenarios: testCounter
    };
  }
};

function parseSpecFiles(specFiles) {
  const endpoints = [];
  for (const file of specFiles) {
    try {
      const content = fs.readJsonSync(file);
      if (content.paths) {
        for (const [path, methods] of Object.entries(content.paths)) {
          for (const [method, details] of Object.entries(methods)) {
            if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
              const bodyExample = details.requestBody && details.requestBody.content && details.requestBody.content['application/json'] && (details.requestBody.content['application/json'].example || (details.requestBody.content['application/json'].schema && details.requestBody.content['application/json'].schema.example)) || null;
              endpoints.push({
                method: method.toUpperCase(),
                path: path,
                expectedStatus: (details.responses && Object.keys(details.responses)[0]) || 200,
                body: bodyExample
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[APIAgent] Could not parse spec file ' + file + ': ' + e.message);
    }
  }
  return endpoints;
}

function getDefaultEndpoints() {
  return [
    { method: 'GET', path: '/', expectedStatus: 200 },
    { method: 'GET', path: '/s?k=test', expectedStatus: 200 },
    { method: 'GET', path: '/gp/cart/view.html', expectedStatus: 200 },
    { method: 'GET', path: '/gp/sign-in.html', expectedStatus: 200 }
  ];
}
