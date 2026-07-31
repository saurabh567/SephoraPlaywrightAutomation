#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
/**
 * generateApiAiAnalysis.js
 *
 * Standalone utility that reads reports/api/api-summary.json
 * and generates reports/ai/api-analysis-report.md.
 *
 * Can be called independently after test:api:
 *   node utils/generateApiAiAnalysis.js
 *
 * Or via npm:
 *   npm run ai:api-analysis
 */


const ROOT = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(ROOT, 'reports/api/api-summary.json');
const OUTPUT_PATH = path.join(ROOT, 'reports/ai/api-analysis-report.md');

function generateAiAnalysis(summary: any) {
  const results = summary.results || [];
  const { totalAPIs: total, passed, failed, passRate, avgResponseTime, fastestAPI, slowestAPI } = summary;

  // Root cause analysis for failures
  const failedApis = results.filter((r: any) => !r.passed);
  const failureAnalysis = failedApis.map((r: any) => ({
    scenario: r.scenario,
    method: r.method,
    url: r.url,
    status: r.status,
    error: r.error || 'Unknown error',
    responseTime: r.responseTime
  }));

  // Response time analysis
  const slowThreshold = 5000;
  const slowApis = results.filter((r: any) => r.responseTime > slowThreshold);

  // Status code analysis
  const statusCounts: Record<string, any> = {};
  results.forEach((r: any) => {
    const key = r.status || 'error';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  const lines: any[] = [];
  lines.push('# API Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Execution Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Total APIs Executed | ${total} |`);
  lines.push(`| Passed | ${passed} |`);
  lines.push(`| Failed | ${failed} |`);
  lines.push(`| Pass % | ${passRate} |`);
  lines.push(`| Average Response Time | ${avgResponseTime} |`);
  lines.push(`| Fastest API | ${fastestAPI} |`);
  lines.push(`| Slowest API | ${slowestAPI} |`);
  lines.push('');
  lines.push('## Status Code Distribution');
  lines.push('');
  lines.push('| Status Code | Count |');
  lines.push('|---|---|');
  (Object.entries(statusCounts) as [string, any][]).forEach(([code, count]) => {
    lines.push(`| ${code} | ${count} |`);
  });
  lines.push('');
  lines.push('## Response Time Analysis');
  lines.push('');
  if (slowApis.length > 0) {
    lines.push('⚠️ The following APIs exceeded the slow threshold (5000ms):');
    lines.push('');
    slowApis.forEach((r: any) => {
      lines.push(`- **${r.scenario}** (${r.method} ${r.url}): ${r.responseTime}ms`);
    });
  } else {
    lines.push('✅ All APIs responded within acceptable time limits.');
  }
  lines.push('');
  lines.push('## Failed APIs & Root Cause Analysis');
  lines.push('');
  if (failureAnalysis.length > 0) {
    failureAnalysis.forEach((r: any) => {
      lines.push(`### ❌ ${r.scenario}`);
      lines.push(`- **Method:** ${r.method}`);
      lines.push(`- **URL:** ${r.url}`);
      lines.push(`- **Status:** ${r.status}`);
      lines.push(`- **Error:** ${r.error}`);
      lines.push(`- **Response Time:** ${r.responseTime}ms`);
      lines.push('');
      lines.push('**Possible Root Causes:**');
      lines.push('- API endpoint may be unavailable or rate-limited.');
      lines.push('- Network connectivity issue during execution.');
      lines.push('- Request payload may not match expected schema.');
      lines.push('- Authentication/authorization headers missing.');
      lines.push('');
    });
  } else {
    lines.push('✅ No API failures detected. All endpoints responded correctly.');
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. **Monitor Slow Endpoints:** Set up alerting for endpoints exceeding 5000ms response time.');
  lines.push('2. **Increase Test Coverage:** Add negative and edge-case scenarios for each endpoint.');
  lines.push('3. **Data-Driven Testing:** Expand test-data/api/apiData.json with more payload variations.');
  lines.push('4. **CI/CD Integration:** Run API tests as a gate before deployment to production.');
  lines.push('5. **Versioning Strategy:** Ensure API version is pinned to avoid breaking changes.');
  lines.push('6. **Security Headers:** Verify all endpoints return proper security headers (CORS, CSP, etc.).');

  return lines.join('\n');
}

function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  API AI Analysis Generator');
  console.log('══════════════════════════════════════════════\n');

  // Read the summary JSON
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`❌ API summary not found at: ${SUMMARY_PATH}`);
    console.error('   Run "npm run test:api" first to generate test results.');
    process.exit(1);
  }

  let summary;
  try {
    summary = fs.readJsonSync(SUMMARY_PATH);
  } catch (err: any) {
    console.error(`❌ Failed to parse ${SUMMARY_PATH}: ${err.message}`);
    process.exit(1);
  }

  // Ensure output directory
  fs.ensureDirSync(path.dirname(OUTPUT_PATH));

  // Generate and write the analysis report
  const markdown = generateAiAnalysis(summary);
  fs.writeFileSync(OUTPUT_PATH, markdown, 'utf8');

  console.log(`  ✅ AI analysis report generated`);
  console.log(`  📄 ${OUTPUT_PATH}\n`);

  // Print summary
  console.log('  Execution Summary:');
  console.log(`    Total: ${summary.totalAPIs}  Passed: ${summary.passed}  Failed: ${summary.failed}  Pass %: ${summary.passRate}`);
  console.log(`    Avg Response: ${summary.avgResponseTime}  Fastest: ${summary.fastestAPI}  Slowest: ${summary.slowestAPI}`);
  console.log('');

  return 0;
}

if (require.main === module) {
  process.exit(main());
}

export { generateAiAnalysis };
export default { generateAiAnalysis: generateAiAnalysis };
