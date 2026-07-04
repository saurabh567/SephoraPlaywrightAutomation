// ReportAgent - Generates comprehensive test execution reports by aggregating data from multiple sources
const fs = require('fs-extra');
const path = require('path');
const AIDashboardAgent = require("./AIDashboardAgent");
const ConsolidatedReportAgent = require("./ConsolidatedReportAgent");
module.exports = {
  run: async function run(input = {}) {
    console.log("[ReportAgent] Generating execution report");

    // Strategy Pattern delegation
    const mode = input.mode || "basic";
    if (mode === "dashboard") {
      console.log("[ReportAgent] Delegating to dashboard strategy (AIDashboardAgent)");
      try { return await AIDashboardAgent.run(input); }
      catch (err) { console.warn("[ReportAgent] Dashboard strategy failed:", err.message); }
    }
    if (mode === "consolidated") {
      console.log("[ReportAgent] Delegating to consolidated strategy (ConsolidatedReportAgent)");
      try { return await new ConsolidatedReportAgent(input).run(); }
      catch (err) { console.warn("[ReportAgent] Consolidated strategy failed:", err.message); }
    }
    if (mode === "summary") {
      console.log("[ReportAgent] Delegating to summary strategy (reportSummarizationAgent)");
      try { return await reportSummarizationAgent.run(input); }
      catch (err) { console.warn("[ReportAgent] Summary strategy failed:", err.message); }
    }

    // Default: basic execution report (original implementation)

    console.log('[ReportAgent] Generating execution report');

    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
      sources: {},
      platform: {},
      failures: [],
      duration: 0
    };

    // 1. Cucumber JSON report
    const cucumberPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    if (fs.existsSync(cucumberPath)) {
      try {
        const report = fs.readJsonSync(cucumberPath);
        const features = Array.isArray(report) ? report : [];
        const allScenarios = features.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'));
        const passed = allScenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'passed'));
        const failed = allScenarios.filter(s => (s.steps || []).some(st => st.result?.status === 'failed'));
        const skipped = allScenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'skipped' || st.result?.status === 'undefined'));

        reportData.summary.total = allScenarios.length;
        reportData.summary.passed = passed.length;
        reportData.summary.failed = failed.length;
        reportData.summary.skipped = skipped.length;
        reportData.summary.passRate = allScenarios.length > 0 ? Number(((passed.length / allScenarios.length) * 100).toFixed(2)) : 0;
        reportData.sources.cucumber = { features: features.length, scenarios: allScenarios.length };

        // Calculate duration
        reportData.duration = features.reduce((acc, f) => {
          return acc + (f.elements || []).reduce((elAcc, el) => {
            return elAcc + (el.steps || []).reduce((stAcc, st) => {
              return stAcc + (st.result?.duration || 0);
            }, 0);
          }, 0);
        }, 0);

        // Collect failures
        for (const f of failed) {
          const failedStep = (f.steps || []).find(st => st.result?.status === 'failed');
          const feature = features.find(feat => (feat.elements || []).includes(f));
          reportData.failures.push({
            scenario: f.name,
            feature: feature?.name || 'unknown',
            step: failedStep?.name || '',
            error: failedStep?.result?.error_message || ''
          });
        }
      } catch (e) {
        console.warn('[ReportAgent] Error parsing cucumber report:', e.message);
      }
    }

    // 2. AI analysis reports
    const reportSources = {
      'failure-analysis': 'reports/ai/failure-analysis.md',
      'root-cause': 'reports/ai/root-cause.md',
      'locator-healing': 'reports/ai/locator-healing-report.md',
      'impact-analysis': 'reports/ai/impact-analysis.md',
      'code-review': 'reports/ai/code-review.md',
      'visual-validation': 'reports/ai/visual-validation.md',
      'release-decision': 'reports/ai/release-decision.md',
      'pipeline-healing': 'reports/ai/pipeline-healing.md',
      'flaky-tests': 'reports/ai/flaky-tests.md'
    };

    for (const [key, relPath] of Object.entries(reportSources)) {
      const absPath = path.join(process.cwd(), relPath);
      reportData.sources[key] = fs.existsSync(absPath) ? 'available' : 'not found';
    }

    // 3. Build summary report
    const outPath = path.join(process.cwd(), 'reports/ai', 'execution-report.md');
    fs.ensureDirSync(path.dirname(outPath));

    const lines = [];
    lines.push('# AI Execution Report');
    lines.push('');
    lines.push(`Generated: ${reportData.timestamp}`);
    lines.push('');
    lines.push('## Test Execution Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Scenarios | ${reportData.summary.total} |`);
    lines.push(`| Passed | ${reportData.summary.passed} |`);
    lines.push(`| Failed | ${reportData.summary.failed} |`);
    lines.push(`| Skipped | ${reportData.summary.skipped} |`);
    lines.push(`| Pass Rate | ${reportData.summary.passRate}% |`);
    lines.push(`| Duration | ${(reportData.duration / 1e9).toFixed(2)}s |`);
    lines.push('');
    lines.push('## AI Analysis Sources');
    lines.push('');
    lines.push('| Source | Status |');
    lines.push('|---|---|');
    for (const [key, status] of Object.entries(reportData.sources)) {
      lines.push(`| ${key} | ${status} |`);
    }
    lines.push('');

    if (reportData.failures.length > 0) {
      lines.push('## Failure Details');
      lines.push('');
      for (const f of reportData.failures) {
        lines.push(`- **${f.scenario}** (${f.feature}): ${f.error.slice(0, 200)}`);
      }
      lines.push('');
    }

    lines.push('## Conclusion');
    lines.push('');
    if (reportData.summary.failed === 0) {
      lines.push('All tests passed. No failures detected.');
    } else {
      lines.push(`${reportData.summary.failed} test(s) failed. Review failure details and AI analysis reports above.`);
    }

    lines.push('');
    lines.push('---');
    lines.push('*Report generated by ReportAgent*');

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      summary: reportData.summary,
      failureCount: reportData.failures.length
    };
  }
};


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Report Agent",
  "version": "1.0.0",
  "description": "Generates comprehensive execution reports from multiple sources",
  "dependencies": ["TestExecutionAgent","failureAnalysisAgent","RCAAgent","locatorHealingAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "reporting"
  ],
  "executionStage": "reporting",
  "priority": 80,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "strategy": "owner",
  "responsibilities": ["reporting"],
  "strategies": ["AIDashboardAgent","ConsolidatedReportAgent"],
  "lifecycle": "active"
};
