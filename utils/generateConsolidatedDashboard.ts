#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
/**
 * generateConsolidatedDashboard.js
 *
 * Standalone consolidated dashboard generator.
 * Reads all existing report files safely and generates ONE consolidated
 * client-ready report at reports/dashboard/index.html.
 *
 * Does NOT depend on any other module in the framework.
 * All existing dashboard/report logic remains untouched.
 *
 * Outputs:
 *   reports/dashboard/index.html         – Executive command center dashboard
 *   reports/dashboard/dashboard-data.json – Structured data for further processing
 *   reports/dashboard/consolidated-summary.md – Markdown summary
 *
 * Usage:
 *   node utils/generateConsolidatedDashboard.js
 *   npm run report:dashboard
 */


// ──────────────────────────── CONFIG ────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'reports', 'dashboard');
const ASSETS = path.join(OUT, 'assets');

const PATHS = {
  webCucumberJson:   path.join(ROOT, 'reports', 'web', 'cucumber-report.json'),
  webHtmlReport:     path.join(ROOT, 'reports', 'web', 'cucumber-html-report.html'),
  webEnv:            path.join(ROOT, 'reports', 'web', 'environment.properties'),
  webScreenshots:    path.join(ROOT, 'reports', 'web', 'screenshots'),
  webVideos:         path.join(ROOT, 'reports', 'web', 'videos'),
  webTraces:         path.join(ROOT, 'reports', 'web', 'traces'),

  androidCucumberJson: path.join(ROOT, 'reports', 'android', 'cucumber-report.json'),
  androidEnv:        path.join(ROOT, 'reports', 'android', 'environment.properties'),
  androidScreenshots: path.join(ROOT, 'reports', 'android', 'screenshots'),
  androidVideos:     path.join(ROOT, 'reports', 'android', 'videos'),

  iosCucumberJson:   path.join(ROOT, 'reports', 'ios', 'cucumber-report.json'),
  iosEnv:            path.join(ROOT, 'reports', 'ios', 'environment.properties'),
  iosscreenshots:    path.join(ROOT, 'reports', 'ios', 'screenshots'),
  iosvideos:         path.join(ROOT, 'reports', 'ios', 'videos'),

  apiSummaryJson:    path.join(ROOT, 'reports', 'api', 'api-summary.json'),
  apiSummaryMd:      path.join(ROOT, 'reports', 'api', 'api-summary.md'),
  apiCucumberJson:   path.join(ROOT, 'reports', 'api', 'cucumber-report.json'),

  aiApiAnalysis:     path.join(ROOT, 'reports', 'ai', 'api-analysis-report.md'),
  aiSummaryReport:   path.join(ROOT, 'reports', 'ai', 'ai-summary-report.md'),
  aiJmeterPerf:      path.join(ROOT, 'reports', 'ai', 'jmeter-performance-report.md'),

  perfSummaryDir:    path.join(ROOT, 'reports', 'jmeter', 'summary'),
  perfJtlDir:        path.join(ROOT, 'reports', 'jmeter', 'jtl'),
  perfHtmlDir:       path.join(ROOT, 'reports', 'jmeter', 'html'),


  aiOutput:          path.join(ROOT, 'ai', 'output'),
  locatorHistory:    path.join(ROOT, 'ai', 'memory', 'locator-history'),
  healingReport:     path.join(ROOT, 'reports', 'ai', 'locator-healing-report.md'),

  featuresDir:       path.join(ROOT, 'features'),
  pipelieneReports:  path.join(ROOT, 'reports', 'pipeline'),
};

// ──────────────────────────── HELPERS ────────────────────────────

function safeReadJSON(filePath: any) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (_: any) { /* ignore */ }
  return null;
}

function safeReadFile(filePath: any) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (_: any) { /* ignore */ }
  return '';
}

function safeReaddir(dirPath: any) {
  try {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath);
    }
  } catch (_: any) { /* ignore */ }
  return [];
}

function readEnvProperties(filePath: any) {
  const content = safeReadFile(filePath);
  const props: Record<string, any> = {};
  content.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.+)$/);
    if (m) props[m[1].trim()] = m[2].trim();
  });
  return props;
}

function nowISO() { return new Date().toISOString(); }
function nowFmt() {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function plural(n: any, s: any) { return n === 1 ? s : s + 's'; }

function fmtDuration(ms: any) {
  if (!ms || ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + 's';
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return min + 'm ' + s + 's';
}

function escHtml(str: any) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ──────────────────────────── EXECUTION STATUS HELPERS ────────────────────────────

function safeReadExecutionStatus() {
  const statusPath = path.join(OUT, 'execution-status.json');
  try {
    if (fs.existsSync(statusPath)) {
      const raw = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      if (Array.isArray(raw)) return raw;
    }
  } catch (_: any) { /* ignore parse errors */ }
  return [];
}

function findSuiteStatus(statusArr: any, suiteName: any) {
  if (!Array.isArray(statusArr)) return null;
  return statusArr.find(s => s.suiteName && s.suiteName.toLowerCase().indexOf(suiteName.toLowerCase()) !== -1) || null;
}

function scanAndroidReportPaths() {
  const found: Record<string, any> = {};
  found.androidDir = fs.existsSync(path.join(ROOT, 'reports', 'android'));
  found.htmlAndroid = fs.existsSync(path.join(ROOT, 'reports', 'html', 'android'));
  found.jsonAndroid = fs.existsSync(path.join(ROOT, 'reports', 'json', 'android'));
  found.lifecycleSummary = fs.existsSync(path.join(ROOT, 'reports', 'ai', 'android-execution-lifecycle-summary.md'));
  return found;
}

function scanIOSReportPaths() {
  const found: Record<string, any> = {};
  found.iosDir = fs.existsSync(path.join(ROOT, 'reports', 'ios'));
  found.htmlIOS = fs.existsSync(path.join(ROOT, 'reports', 'html', 'ios'));
  found.jsonIOS = fs.existsSync(path.join(ROOT, 'reports', 'json', 'ios'));
  found.lifecycleSummary = fs.existsSync(path.join(ROOT, 'reports', 'ai', 'ios-execution-lifecycle-summary.md'));
  return found;
}

function readLifecycleSummary(filePath: any) {
  const content = safeReadFile(filePath);
  if (!content) return null;
  return { available: true, content: content.substring(0, 2000) };
}

// ──────────────────────────── COLLECTORS ────────────────────────────

function collectWebData() {
  const data = safeReadJSON(PATHS.webCucumberJson);
  const env = readEnvProperties(PATHS.webEnv);
  const screenshots = safeReaddir(PATHS.webScreenshots);
  const videos = safeReaddir(PATHS.webVideos);
  const traces = safeReaddir(PATHS.webTraces);

  if (!data) {
    return {
      available: false,
      status: 'Not executed',
      features: [] as any[],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
      failedScenarios: [] as any[],
      env,
      screenshots, videos, traces,
    };
  }

  const features: any = [];
  let total = 0, passed = 0, failed = 0, skipped = 0, totalDurationMs = 0;
  const failedScenarios: any = [];
  const scenarioDetails: any = [];

  (data || []).forEach((feature: any) => {
    const fName = feature.name || feature.feature || 'Unknown Feature';
    const fScenarios: any = [];
    let fPassed = 0, fFailed = 0, fSkipped = 0;

    (feature.elements || []).forEach((sc: any) => {
      const steps = sc.steps || [];
      const hasFail = steps.some((s: any) => s.result && s.result.status === 'failed');
      const allPass = steps.every((s: any) => s.result && s.result.status === 'passed');
      const status = hasFail ? 'failed' : allPass ? 'passed' : 'skipped';
      const dur = steps.reduce((s: any, step: any) => s + ((step.result && step.result.duration) || 0), 0);

      total++;
      totalDurationMs += dur;
      if (status === 'passed') { passed++; fPassed++; }
      else if (status === 'failed') { failed++; fFailed++; failedScenarios.push({ feature: fName, name: sc.name, status, duration: Math.round(dur / 1e6), tags: (sc.tags || []).map((t: any) => t.name || t) }); }
      else { skipped++; fSkipped++; }

      fScenarios.push({
        name: sc.name,
        status,
        duration: Math.round(dur / 1e6),
        tags: (sc.tags || []).map((t: any) => t.name || t),
      });

      scenarioDetails.push({
        feature: fName,
        name: sc.name,
        status,
        duration: Math.round(dur / 1e6),
        tags: (sc.tags || []).map((t: any) => t.name || t),
        steps: steps.map((s: any) => ({
          keyword: s.keyword,
          name: s.name,
          status: s.result ? s.result.status : 'unknown',
        })),
      });
    });

    features.push({
      name: fName,
      uri: feature.uri || '',
      scenarios: fScenarios,
      passed: fPassed, failed: fFailed, skipped: fSkipped, total: fScenarios.length,
      passRate: fScenarios.length > 0 ? Math.round((fPassed / fScenarios.length) * 100) : 0,
    });
  });

  return {
    available: true,
    status: 'Completed',
    features,
    summary: {
      total, passed, failed, skipped,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      totalDurationMs: Math.round(totalDurationMs / 1e6),
    },
    failedScenarios,
    scenarioDetails,
    env,
    webHtmlReport: fs.existsSync(PATHS.webHtmlReport) ? PATHS.webHtmlReport : null,
    screenshots, videos, traces,
  };
}

function collectAndroidData(execStatus: any, lifecycleSummary: any) {
  const data = safeReadJSON(PATHS.androidCucumberJson);
  const env = readEnvProperties(PATHS.androidEnv);
  const screenshots = safeReaddir(PATHS.androidScreenshots);
  const videos = safeReaddir(PATHS.androidVideos);
  const reportPaths = scanAndroidReportPaths();
  const lsContent = lifecycleSummary || readLifecycleSummary(path.join(ROOT, 'reports', 'ai', 'android-execution-lifecycle-summary.md'));

  // Check execution status from orchestrator
  let execInfo = null;
  if (execStatus) {
    execInfo = {
      status: execStatus.status || 'UNKNOWN',
      command: execStatus.command || '',
      duration: execStatus.durationFormatted || '',
      errorMessage: execStatus.errorMessage || null,
      reportPath: execStatus.reportPath || '',
    };
  }

  if (!data) {
    // No cucumber JSON - check if execution actually ran
    if (execInfo && (execInfo.status === 'PASSED' || execInfo.status === 'FAILED')) {
      // Check what reports ARE available
      var lifecycleExist = reportPaths.lifecycleSummary || (lsContent && lsContent.available);
      var androidSummaryExist = fs.existsSync(path.join(ROOT, 'reports', 'android', 'android-summary.md'));

      var reportMsg = 'Execution completed but no cucumber report was generated.';
      var reportStatus = 'Cucumber report not generated';
      var extraReports: any[] = [];
      if (lifecycleExist) extraReports.push('Lifecycle summary');
      if (androidSummaryExist) extraReports.push('Android summary');

      if (extraReports.length > 0) {
        reportMsg = 'Cucumber report not generated. Other reports available: ' + extraReports.join(', ') + '.';
        reportStatus = 'Partial report available (' + extraReports.join(', ') + ')';
      }

      return {
        available: false,
        status: reportStatus,
        execInfo: execInfo,
        reportPaths: reportPaths,
        lifecycleSummary: lsContent,
        env: env,
        screenshots: screenshots,
        videos: videos,
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
        failedScenarios: [] as any[],
        _reportMissing: true,
        _reportStatus: reportStatus,
        _execMessage: reportMsg,
        _lifecycleAvailable: lifecycleExist,
        _androidSummaryAvailable: androidSummaryExist,
      };
    }
    return {
      available: false, status: 'Not executed',
      reportPaths: reportPaths,
      lifecycleSummary: lsContent,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
      failedScenarios: [] as any[], env, screenshots, videos,
      execInfo: execInfo,
    };
  }

  let total = 0, passed = 0, failed = 0, skipped = 0;
  const failedScenarios: any = [];

  (data || []).forEach((feature: any) => {
    (feature.elements || []).forEach((sc: any) => {
      const steps = sc.steps || [];
      const hasFail = steps.some((s: any) => s.result && s.result.status === 'failed');
      const allPass = steps.every((s: any) => s.result && s.result.status === 'passed');
      const status = hasFail ? 'failed' : allPass ? 'passed' : 'skipped';
      total++;
      if (status === 'passed') passed++;
      else if (status === 'failed') { failed++; failedScenarios.push({ feature: feature.name, name: sc.name, status }); }
      else skipped++;
    });
  });

  return {
    available: true, status: 'Completed',
    summary: { total, passed, failed, skipped, passRate: total > 0 ? Math.round((passed / total) * 100) : 0 },
    failedScenarios, env, screenshots, videos,
    reportPaths: reportPaths,
    lifecycleSummary: lsContent,
    execInfo: execInfo,
  };
}

function collectiOSData(execStatus: any, lifecycleSummary: any) {
  const data = safeReadJSON(PATHS.iosCucumberJson);
  const env = readEnvProperties(PATHS.iosEnv);
  const screenshots = safeReaddir(PATHS.iosscreenshots);
  const videos = safeReaddir(PATHS.iosvideos);
  const reportPaths = scanIOSReportPaths();
  const lsContent = lifecycleSummary || readLifecycleSummary(path.join(ROOT, 'reports', 'ai', 'ios-execution-lifecycle-summary.md'));

  let execInfo = null;
  if (execStatus) {
    execInfo = {
      status: execStatus.status || 'UNKNOWN',
      command: execStatus.command || '',
      duration: execStatus.durationFormatted || '',
      errorMessage: execStatus.errorMessage || null,
      reportPath: execStatus.reportPath || '',
    };
  }

  if (!data) {
    if (execInfo && (execInfo.status === 'PASSED' || execInfo.status === 'FAILED')) {
      // Check what reports ARE available from execution-status.json fields
      var simLaunched = execStatus ? (execStatus.simulatorLaunched || false) : false;
      var actualExecStarted = execStatus ? (execStatus.actualExecutionStarted || false) : false;
      var testReportGenerated = execStatus ? (execStatus.testReportGenerated || false) : false;
      var lifecycleExist = reportPaths.lifecycleSummary || (lsContent && lsContent.available);
      var iosSummaryExist = fs.existsSync(path.join(ROOT, 'reports', 'ios', 'ios-summary.md'));

      var reportMsg = 'iOS execution completed but no test report was generated.';
      var reportStatus = 'No test result';

      // Determine the right message based on actual state
      if (simLaunched && !actualExecStarted) {
        reportMsg = 'Simulator launched, but iOS test execution did not start. Tests were skipped.';
        reportStatus = 'Simulator only — tests did not execute';
      } else if (actualExecStarted && !testReportGenerated) {
        reportMsg = 'iOS tests started but did not complete successfully. No test report was generated.';
        reportStatus = 'Tests started but did not finish';
      } else if (!simLaunched) {
        reportMsg = 'iOS simulator failed to launch. Test execution could not start.';
        reportStatus = 'Simulator did not launch';
      }


      // If summary exists, note it
      if (iosSummaryExist) {
        reportMsg = 'Detailed Cucumber report not generated. Fallback summary available.';
        reportStatus = 'Fallback summary available';
      }

      // If simulator launched but nothing else, that's the primary message
        reportMsg = 'Simulator launched, but iOS test execution did not start. Only simulator lifecycle ran.';
        reportStatus = 'Simulator only — no tests executed';

      return {
        available: false,
        status: reportStatus,
        execInfo: execInfo,
        reportPaths: reportPaths,
        lifecycleSummary: lsContent,
        env: env,
        screenshots: screenshots,
        videos: videos,
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
        failedScenarios: [] as any[],
        _reportMissing: true,
        _reportStatus: reportStatus,
        _execMessage: reportMsg,
        _simulatorLaunched: simLaunched,
        _actualExecutionStarted: actualExecStarted,
        _testReportGenerated: testReportGenerated,
        _lifecycleAvailable: lifecycleExist,
        _iosSummaryAvailable: iosSummaryExist,
      };
    }
    return {
      available: false, status: 'Not executed',
      reportPaths: reportPaths,
      lifecycleSummary: lsContent,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
      failedScenarios: [] as any[], env, screenshots, videos,
      execInfo: execInfo,
    };
  }

  let total = 0, passed = 0, failed = 0, skipped = 0;
  const failedScenarios: any = [];

  (data || []).forEach((feature: any) => {
    (feature.elements || []).forEach((sc: any) => {
      const steps = sc.steps || [];
      const hasFail = steps.some((s: any) => s.result && s.result.status === 'failed');
      const allPass = steps.every((s: any) => s.result && s.result.status === 'passed');
      const status = hasFail ? 'failed' : allPass ? 'passed' : 'skipped';
      total++;
      if (status === 'passed') passed++;
      else if (status === 'failed') { failed++; failedScenarios.push({ feature: feature.name, name: sc.name, status }); }
      else skipped++;
    });
  });

  return {
    available: true, status: 'Completed',
    summary: { total, passed, failed, skipped, passRate: total > 0 ? Math.round((passed / total) * 100) : 0 },
    failedScenarios, env, screenshots, videos,
    reportPaths: reportPaths,
    lifecycleSummary: lsContent,
    execInfo: execInfo,
  };
}

function collectAPIData() {
  const summary = safeReadJSON(PATHS.apiSummaryJson);
  const apiSummaryMd = safeReadFile(PATHS.apiSummaryMd);
  const aiApiAnalysis = safeReadFile(PATHS.aiApiAnalysis);
  const apiCucumber = safeReadJSON(PATHS.apiCucumberJson);

  if (!summary && !apiCucumber) {
    return { available: false, status: 'Not executed', results: [] as any[], summary: { total: 0, passed: 0, failed: 0, passRate: 0 } };
  }

  const results = (summary && summary.results) || [];
  const total = (summary && summary.totalAPIs) || (results.length) || 0;
  const passed = (summary && summary.passed) || results.filter((r: any) => r.passed).length || 0;
  const failed = (summary && summary.failed) || results.filter((r: any) => !r.passed).length || 0;
  const passRate = summary && summary.passRate ? summary.passRate : (total > 0 ? Math.round((passed / total) * 10000) / 100 + '%' : '0%');

  return {
    available: true,
    status: 'Completed',
    summary: { total, passed, failed, passRate: parseFloat(passRate) || 0 },
    results,
    avgResponseTime: summary ? summary.avgResponseTime : null,
    fastestAPI: summary ? summary.fastestAPI : null,
    slowestAPI: summary ? summary.slowestAPI : null,
    executionDuration: summary ? summary.executionDuration : null,
    executionTimestamp: summary ? summary.executionTimestamp : null,
    summaryMd: apiSummaryMd,
    aiAnalysis: aiApiAnalysis,
  };
}

function collectPerformanceData() {
  // Try reading JMeter summary JSON
  const summaryFiles = safeReaddir(PATHS.perfSummaryDir).filter(f => f.endsWith('.json'));
  let summaryData: any = null;
  summaryFiles.forEach(f => {
    const d = safeReadJSON(path.join(PATHS.perfSummaryDir, f));
    if (d) summaryData = { ...summaryData, ...d };
  });

  // Try parsing JTL files
  const jtlFiles = safeReaddir(PATHS.perfJtlDir).filter(f => f.endsWith('.jtl') || f.endsWith('.csv'));
  let jtlData = null;

  if (jtlFiles.length > 0) {
    const content = safeReadFile(path.join(PATHS.perfJtlDir, jtlFiles[0]));
    if (content) {
      const lines = content.trim().split('\n');
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map(l => {
          const vals = l.split(',');
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => { obj[h.trim()] = vals[i] ? vals[i].trim() : ''; });
          return obj;
        });

        const times = rows.map(r => parseFloat(r.elapsed || r.timeStamp || 0)).filter(v => !isNaN(v) && v > 0);
        const errors = rows.filter(r => r.success === 'false' || (r.responseCode && parseInt(r.responseCode) >= 400));
        const sorted = [...times].sort((a, b) => a - b);
        const len = sorted.length;

        jtlData = {
          totalRequests: rows.length,
          failures: errors.length,
          errorRate: rows.length > 0 ? Math.round((errors.length / rows.length) * 10000) / 100 : 0,
          avgResponseTime: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
          min: times.length > 0 ? Math.min(...times) : 0,
          max: times.length > 0 ? Math.max(...times) : 0,
          p90: len > 0 ? sorted[Math.floor(len * 0.9)] : 0,
          p95: len > 0 ? sorted[Math.floor(len * 0.95)] : 0,
          throughput: 0,
        };
      }
    }
  }

  const hasHTML = safeReaddir(PATHS.perfHtmlDir).length > 0;
  const aiPerfReport = safeReadFile(PATHS.aiJmeterPerf);

  if (!summaryData && !jtlData && !hasHTML) {
    return { available: false, status: 'Not executed' };
  }

  return {
    available: true,
    status: 'Completed',
    summaryData,
    jtlData,
    hasHTML,
    aiPerfReport,
  };
}

function collectAIData() {
  const aiDir = PATHS.aiOutput;
  if (!fs.existsSync(aiDir)) {
    return { available: false, status: 'Not available' };
  }

  const files = safeReaddir(aiDir);
  const postTestSummary = safeReadFile(path.join(aiDir, 'ai-post-test-summary.md'));
  const codeReview = safeReadFile(path.join(aiDir, 'code-review-report.md'));
  const selfHealing = safeReadFile(path.join(aiDir, 'self-healing-suggestions.md'));
  const jenkinsAnalysis = safeReadFile(path.join(aiDir, 'jenkins-failure-analysis.md'));
  const testExecutionSummary = safeReadJSON(path.join(aiDir, 'test-execution-summary.json'));
  const aiSummaryReport = safeReadFile(PATHS.aiSummaryReport);

  return {
    available: true,
    status: 'Available',
    files,
    postTestSummary,
    codeReview,
    selfHealing,
    jenkinsAnalysis,
    testExecutionSummary,
    aiSummaryReport,
  };
}

function collectSelfHealingData() {
  const healingReport = safeReadFile(PATHS.healingReport);
  const locatorDir = PATHS.locatorHistory;
  const locatorFiles = safeReaddir(locatorDir);

  if (!healingReport && locatorFiles.length === 0) {
    return { available: false, status: 'Not available' };
  }

  // Parse locator history files
  const locatorEntries: any = [];
  locatorFiles.forEach(f => {
    const data = safeReadJSON(path.join(locatorDir, f));
    if (data) {
      if (Array.isArray(data)) {
        data.forEach(d => locatorEntries.push(d));
      } else {
        locatorEntries.push(data);
      }
    }
  });

  const totalFailures = locatorEntries.length;
  const healed = locatorEntries.filter((e: any) => e.healed || e.autoApplied || (e.status && e.status === 'healed')).length;
  const healingSuccess = totalFailures > 0 ? Math.round((healed / totalFailures) * 100) : 0;

  return {
    available: true,
    status: 'Available',
    totalFailures,
    healed,
    healingSuccess,
    entries: locatorEntries.slice(0, 50), // cap at 50
    report: healingReport,
  };
}

function collectFlakyData(webData: any) {
  // Flaky detection: scenarios that were retried or have inconsistent results
  const flakyScenarios: any = [];
  if (webData && webData.available && webData.scenarioDetails) {
    const seen: Record<string, any> = {};
    webData.scenarioDetails.forEach((sc: any) => {
      if (seen[sc.name]) {
        if (seen[sc.name] !== sc.status) {
          flakyScenarios.push(sc);
        }
      }
      seen[sc.name] = sc.status;
    });
  }
  return {
    count: flakyScenarios.length,
    percentage: webData && webData.summary.total > 0 ? Math.round((flakyScenarios.length / webData.summary.total) * 100) : 0,
    scenarios: flakyScenarios,
  };
}

function collectRootCauseData(webData: any, apiData: any, androidData: any, iosData: any) {
  const categories = {
    locator: 0, assertion: 0, timeout: 0, testData: 0,
    environment: 0, api: 0, mobileDevice: 0, performance: 0, unknown: 0,
  };

  const webFailed = webData && webData.failedScenarios ? webData.failedScenarios : [] as any[];
  const apiFailed = apiData && apiData.results ? apiData.results.filter((r: any) => !r.passed) : [] as any[];
  const androidFailed = androidData && androidData.failedScenarios ? androidData.failedScenarios : [] as any[];
  const iosFailed = iosData && iosData.failedScenarios ? iosData.failedScenarios : [] as any[];

  const totalFailures = webFailed.length + apiFailed.length + androidFailed.length + iosFailed.length;

  // Simple heuristic categorization
  webFailed.forEach((s: any) => {
    const name = (s.name || '').toLowerCase();
    if (name.includes('locator') || name.includes('element') || name.includes('selector')) categories.locator++;
    else if (name.includes('assert') || name.includes('expect')) categories.assertion++;
    else if (name.includes('timeout') || name.includes('wait')) categories.timeout++;
    else if (name.includes('data') || name.includes('test data')) categories.testData++;
    else if (name.includes('env') || name.includes('environment')) categories.environment++;
    else categories.unknown++;
  });

  apiFailed.forEach(() => categories.api++);
  androidFailed.forEach(() => categories.mobileDevice++);
  iosFailed.forEach(() => categories.mobileDevice++);

  return {
    totalFailures,
    categories,
    distribution: categories,
  };
}


// ──────────────────────────── QUICK LINKS ────────────────────────────

function buildQuickLinks() {
  const links: any[] = [];

  // API reports
  const apiReportHtml = path.join(ROOT, 'reports', 'api', 'api-report.html');
  if (fs.existsSync(apiReportHtml)) links.push({ label: 'API Test Report', url: path.relative(OUT, apiReportHtml), icon: '📡' });

  const apiSummaryMd = path.join(ROOT, 'reports', 'api', 'api-summary.md');
  if (fs.existsSync(apiSummaryMd)) links.push({ label: 'API Summary (Markdown)', url: path.relative(OUT, apiSummaryMd), icon: '📝' });

  const apiAnalysisMd = path.join(ROOT, 'reports', 'ai', 'api-analysis-report.md');
  if (fs.existsSync(apiAnalysisMd)) links.push({ label: 'AI API Analysis', url: path.relative(OUT, apiAnalysisMd), icon: '🤖' });

  const aiSummaryReport = path.join(ROOT, 'reports', 'ai', 'ai-summary-report.md');
  if (fs.existsSync(aiSummaryReport)) links.push({ label: 'AI Summary Report', url: path.relative(OUT, aiSummaryReport), icon: '🧠' });

  const jmeterPerfReport = path.join(ROOT, 'reports', 'ai', 'jmeter-performance-report.md');
  if (fs.existsSync(jmeterPerfReport)) links.push({ label: 'JMeter Performance Report', url: path.relative(OUT, jmeterPerfReport), icon: '⚡' });


  const screenshotsDir = path.join(ROOT, 'reports', 'screenshots');
  if (fs.existsSync(screenshotsDir)) links.push({ label: 'Screenshots', url: path.relative(OUT, screenshotsDir), icon: '🖼️' });

  const videosDir = path.join(ROOT, 'reports', 'videos');
  if (fs.existsSync(videosDir)) links.push({ label: 'Videos', url: path.relative(OUT, videosDir), icon: '🎬' });

  const tracesDir = path.join(ROOT, 'reports', 'traces');
  if (fs.existsSync(tracesDir)) links.push({ label: 'Traces', url: path.relative(OUT, tracesDir), icon: '🔍' });

  // Fallback: always include root-level reports if dirs exist
  const reportsDir = path.join(ROOT, 'reports');
  if (fs.existsSync(reportsDir)) links.push({ label: 'All Reports', url: path.relative(OUT, reportsDir), icon: '📁' });

  return links;
}

// ──────────────────────────── DATA AGGREGATION ────────────────────────────

function generateDashboardData() {
  const execStatusArr = safeReadExecutionStatus();
  const webData = collectWebData();
  const androidExecStatus = findSuiteStatus(execStatusArr, 'Android');
  const androidData = collectAndroidData(androidExecStatus, null);
  const androidLifecycle = readLifecycleSummary(path.join(ROOT, 'reports', 'ai', 'android-execution-lifecycle-summary.md'));
  const iosExecStatus = findSuiteStatus(execStatusArr, 'iOS');
  const iosData = collectiOSData(iosExecStatus, null);
  const iosLifecycle = readLifecycleSummary(path.join(ROOT, 'reports', 'ai', 'ios-execution-lifecycle-summary.md'));
  const apiData = collectAPIData();
  const perfData = collectPerformanceData();
  const aiData = collectAIData();
  const healingData = collectSelfHealingData();
  const flakyData = collectFlakyData(webData);
  const rootCauseData = collectRootCauseData(webData, apiData, androidData, iosData);

  // Executive summary
  const allSuites = [
    { name: 'Web', data: webData },
    { name: 'Android', data: androidData },
    { name: 'iOS', data: iosData },
    { name: 'API', data: apiData },
    { name: 'Performance', data: perfData },
  ];

  let grandTotal = 0, grandPassed = 0, grandFailed = 0, grandSkipped = 0;
  let suitesExecuted = 0, suitesPassed = 0, suitesFailed = 0;
  let totalDurationMs = 0;

  allSuites.forEach(s => {
    const sData: any = s.data;
    if (sData && sData.available) {
      suitesExecuted++;
      if (sData.summary) {
        grandTotal += sData.summary.total || 0;
        grandPassed += sData.summary.passed || 0;
        grandFailed += sData.summary.failed || 0;
        grandSkipped += sData.summary.skipped || 0;
        if (sData.summary.failed === 0) suitesPassed++;
        else suitesFailed++;
      }
    }
  });

  if (webData && webData.summary) totalDurationMs += webData.summary.totalDurationMs || 0;
  if (perfData && perfData.jtlData) totalDurationMs += perfData.jtlData.avgResponseTime || 0;

  const passPercent = grandTotal > 0 ? Math.round((grandPassed / grandTotal) * 100) : 0;

  // Build number / run ID
  const gitBranch = safeReadFile(path.join(ROOT, '.git', 'HEAD')).replace('ref: refs/heads/', '').trim() || 'unknown';
  const buildNumber = process.env.BUILD_NUMBER || process.env.RUN_ID || gitBranch;

  // Release Gate
  let releaseDecision = 'GO';
  let releaseReason = 'All critical suites passed successfully';
  const criticalFailures = grandFailed > 0 || (apiData && apiData.summary && apiData.summary.failed > 0);

  if (criticalFailures) {
    releaseDecision = 'NO-GO';
    releaseReason = 'Critical test failures detected';
  } else if (perfData && perfData.jtlData && perfData.jtlData.errorRate > 5) {
    releaseDecision = 'WARNING';
    releaseReason = 'Performance error rate exceeds threshold';
  } else if (passPercent < 80) {
    releaseDecision = 'NO-GO';
    releaseReason = 'Pass percentage below 80% threshold';
  } else if (passPercent < 95) {
    releaseDecision = 'WARNING';
    releaseReason = 'Pass percentage below 95% — minor issues detected';
  }

  // Production Readiness Score
  let score = 0;
  score += Math.min(30, passPercent * 0.3); // pass rate contribution
  score += apiData && apiData.summary && apiData.summary.passRate > 0 ? Math.min(15, Number(apiData.summary.passRate) * 0.15) : 5;
  score += androidData && androidData.available ? 10 : 0;
  score += iosData && iosData.available ? 10 : 0;
  score += perfData && perfData.available ? 10 : 5;
  score += Math.max(0, 10 - flakyData.percentage * 0.1);
  score += healingData && healingData.available ? Math.min(10, (healingData.healingSuccess || 0) * 0.1) : 0;
  score -= grandFailed * 2;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let qualityStatus = 'Not Ready';
  if (score >= 90) qualityStatus = 'Excellent';
  else if (score >= 75) qualityStatus = 'Good';
  else if (score >= 50) qualityStatus = 'Needs Attention';

  const dashboard = {
    generatedAt: nowISO(),
    generatedAtFmt: nowFmt(),
    projectName: 'Amazon Web & Mobile Playwright Automation',
    version: '2.0.0',

    executiveSummary: {
      total: grandTotal,
      passed: grandPassed,
      failed: grandFailed,
      skipped: grandSkipped,
      passPercent,
      totalDuration: fmtDuration(totalDurationMs),
      environment: process.env.ENV || process.env.ENVIRONMENT || 'dev',
      platform: 'Web + Mobile + API + Performance',
      browser: webData && webData.env ? webData.env.BROWSER || 'chromium' : 'N/A',
      buildNumber,
      gitBranch,
      executionDate: nowFmt(),
      suitesExecuted,
      suitesPassed,
      suitesFailed,
      releaseDecision,
      releaseReason,
      productionReadiness: { score, qualityStatus },
    },

    web: webData,
    android: androidData,
    ios: iosData,
    api: apiData,
    performance: perfData,
    ai: aiData,
    selfHealing: healingData,
    flaky: flakyData,
    rootCause: rootCauseData,
    aiAnalysis: aiData,
    flakyTests: flakyData,
    testImpact: {
      available: false,
      status: 'Not available',
      impactedCount: 0,
      impactedTests: [] as any[],
      affectedAreas: [] as any[],
      message: 'Test impact analysis requires full test execution to compute. Run full suite to generate.',
    },
    releaseGatekeeper: {
      decision: (typeof releaseDecision !== 'undefined' ? releaseDecision : 'PENDING'),
      reason: (typeof releaseReason !== 'undefined' ? releaseReason : 'Insufficient data'),
      passPercent: passPercent || 0,
      totalFailures: grandFailed || 0,
      criticalFailures: grandFailed > 0,
      apiStable: apiData && apiData.summary && apiData.summary.passRate >= 90,
      androidCompleted: androidData && androidData.available,
      iosCompleted: iosData && iosData.available,
      performanceStable: perfData && perfData.available && (!perfData.jtlData || perfData.jtlData.errorRate <= 5),
      flakyAcceptable: flakyData && flakyData.percentage <= 10,
      selfHealingOk: healingData && healingData.available && (healingData.healingSuccess || 0) >= 80,
    },
    productionReadiness: {
      score: (typeof score !== 'undefined' ? score : 0),
      qualityStatus: (typeof qualityStatus !== 'undefined' ? qualityStatus : 'Not Ready'),
      maxScore: 100,
    },
    quickLinks: buildQuickLinks(),
    executionStatus: readExecutionStatus(),
  };

  return dashboard;
}

function readExecutionStatus() {
  const statusPath = path.join(OUT, 'execution-status.json');
  var suites: any[] = [];
  var androidCleanupStatus = null;
  var androidCleanupMessage = null;
  var androidCleanupDuration = null;
  var iosCleanupStatus = null;
  var iosCleanupMessage = null;
  var iosCleanupDuration = null;
  try {
    if (fs.existsSync(statusPath)) {
      var raw = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      if (Array.isArray(raw)) {
        suites = raw;
        // Extract Android cleanup from multiple possible key paths
        var androidEntry = null;
        for (var si = 0; si < raw.length; si++) {
          if (raw[si].suiteName && raw[si].suiteName.toLowerCase().indexOf('android automation') !== -1) {
            androidEntry = raw[si];
            break;
          }
        }
        if (androidEntry) {
          androidCleanupStatus = androidEntry.androidCleanupStatus || (androidEntry.cleanup && androidEntry.cleanup.status) || (androidEntry.cleanupStatus) || (androidEntry.emulatorCleanupStatus) || null;
          androidCleanupMessage = androidEntry.androidCleanupMessage || (androidEntry.cleanup && androidEntry.cleanup.message) || (androidEntry.cleanupMessage) || null;
          androidCleanupDuration = androidEntry.androidCleanupDuration || (androidEntry.cleanup && androidEntry.cleanup.duration) || (androidEntry.cleanupDuration) || null;
        }
        // Extract iOS cleanup from multiple possible key paths
        var iosEntry = null;
        for (var si = 0; si < raw.length; si++) {
          if (raw[si].suiteName && raw[si].suiteName.toLowerCase().indexOf('ios automation') !== -1) {
            iosEntry = raw[si];
            break;
          }
        }
        if (iosEntry) {
          iosCleanupStatus = iosEntry.iosCleanupStatus || (iosEntry.cleanup && iosEntry.cleanup.status) || (iosEntry.cleanupStatus) || (iosEntry.simulatorCleanupStatus) || null;
          iosCleanupMessage = iosEntry.iosCleanupMessage || (iosEntry.cleanup && iosEntry.cleanup.message) || (iosEntry.cleanupMessage) || null;
          iosCleanupDuration = iosEntry.iosCleanupDuration || (iosEntry.cleanup && iosEntry.cleanup.duration) || (iosEntry.cleanupDuration) || null;
        }
      }
    }
  } catch (_: any) { /* ignore */ }
  return {
    available: suites.length > 0,
    suites: suites,
    totalSuites: suites.length,
    androidCleanupStatus: androidCleanupStatus,
    androidCleanupMessage: androidCleanupMessage,
    androidCleanupDuration: androidCleanupDuration,
    iosCleanupStatus: iosCleanupStatus,
    iosCleanupMessage: iosCleanupMessage,
    iosCleanupDuration: iosCleanupDuration,
  };
}

// ──────────────────────────── HTML GENERATION ────────────────────────────

function generateHTML(data: any) {
  const e = data.executiveSummary;
  const w = data.web;
  const a = data.android;
  const i = data.ios;
  const api = data.api;
  const perf = data.performance;
  const ai = data.ai;
  const sh = data.selfHealing;
  const flaky = data.flaky;
  const rc = data.rootCause;
  const es = data.executionStatus;

  // Helper: card row
  function cardRow(label: any, value: any, color: any = "") {
    const vStyle = color ? ` style="color:${color}"` : '';
    return `<div class="card-row"><span class="label">${escHtml(label)}</span><span class="value"${vStyle}>${value}</span></div>`;
  }

  // Helper: badge
  function badge(text: any, type: any) {
    return `<span class="badge badge-${type}">${escHtml(text)}</span>`;
  }

  // Helper: feature table rows
  function featureRows(features: any) {
    if (!features || features.length === 0) return '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No features available</td></tr>';
    return features.map((f: any) => {
      const pct = f.total > 0 ? Math.round((f.passed / f.total) * 100) : 0;
      return `<tr>
        <td><strong>${escHtml(f.name || f.feature || 'Unknown')}</strong></td>
        <td>${f.total}</td>
        <td>${badge(f.passed, 'pass')}</td>
        <td>${badge(f.failed, 'fail')}</td>
        <td>${f.skipped}</td>
        <td>${pct}%</td>
      </tr>`;
    }).join('\n');
  }

  // Helper: failed scenarios table
  function failedRows(list: any) {
    if (!list || list.length === 0) return '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No failures</td></tr>';
    return list.map((s: any) => `<tr>
      <td>${escHtml(s.feature || '')}</td>
      <td>${escHtml(s.name)}</td>
      <td>${badge('FAILED', 'fail')}</td>
    </tr>`).join('\n');
  }

  // API results rows
  function apiResultRows(results: any) {
    if (!results || results.length === 0) return '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No API results</td></tr>';
    return results.map((r: any) => {
      const res = r.passed ? badge('PASS', 'pass') : badge('FAIL', 'fail');
      return `<tr>
        <td>${escHtml(r.method || r.scenario || '')}</td>
        <td>${escHtml(r.url || '')}</td>
        <td>${r.status || ''}</td>
        <td>${r.responseTime || 0}ms</td>
        <td>${res}</td>
        <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.error || r.body || '').substring(0, 100)}</td>
      </tr>`;
    }).join('\n');
  }

  // Self-healing entries
  function healingRows(entries: any) {
    if (!entries || entries.length === 0) return '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No self-healing data</td></tr>';
    return entries.map((e: any) => {
      const conf = e.confidence || e.confidenceScore || 0;
      const applied = e.autoApplied || e.healed ? badge('Auto-Applied', 'pass') : badge('Manual Review', 'skip');
      return `<tr>
        <td style="font-size:11px">${escHtml(e.oldLocator || e.old || e.locator || '')}</td>
        <td style="font-size:11px">${escHtml(e.suggestedLocator || e.suggested || e.newLocator || '')}</td>
        <td>${conf}%</td>
        <td>${applied}</td>
      </tr>`;
    }).join('\n');
  }

  // Flaky rows
  function flakyRows(list: any) {
    if (!list || list.length === 0) return '<tr><td colspan="2" style="text-align:center;color:var(--text-muted)">No flaky tests detected</td></tr>';
    return list.map((s: any) => `<tr>
      <td>${escHtml(s.feature || '')}</td>
      <td>${escHtml(s.name)}</td>
    </tr>`).join('\n');
  }

  // Test impact: changed files
  function getChangedFiles() {
    try {
      const { execSync } = require('child_process');
      const out = execSync('git diff --name-only HEAD~1', { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (!out) return 'No recent changes detected';
      return out.split('\n').map((f: any) => `<div style="font-size:12px;padding:2px 0;color:var(--text-secondary)">📄 ${escHtml(f)}</div>`).join('');
    } catch (_: any) { return 'Git changes not available'; }
  }

  // Quick links
  const quickLinks: any[] = [];

  // Base paths relative to project root
  const rel = (p: any) => { try { return path.relative(ROOT, p).replace(/^reports\//, 'reports/'); } catch (_: any) { return p; } };

  const webHtml = PATHS.webHtmlReport;
  if (fs.existsSync(webHtml)) quickLinks.push({ icon: '🌐', label: 'Web Cucumber Report', path: path.relative(OUT, webHtml) });


  const apiHtml = PATHS.apiSummaryJson.replace('.json', '-report.html');
  if (fs.existsSync(apiHtml)) quickLinks.push({ icon: '🔌', label: 'API Test Report', path: path.relative(OUT, apiHtml) });

  const aiApi = PATHS.aiApiAnalysis;
  if (fs.existsSync(aiApi)) quickLinks.push({ icon: '🤖', label: 'API AI Analysis', path: path.relative(OUT, aiApi) });

  const perfHtmlIndex = path.join(PATHS.perfHtmlDir, 'index.html');
  if (fs.existsSync(perfHtmlIndex)) quickLinks.push({ icon: '⚡', label: 'JMeter Report', path: path.relative(OUT, perfHtmlIndex) });

  if (fs.existsSync(PATHS.aiSummaryReport)) quickLinks.push({ icon: '🤖', label: 'AI Summary Report', path: path.relative(OUT, PATHS.aiSummaryReport) });

  if (fs.existsSync(PATHS.healingReport)) quickLinks.push({ icon: '🩹', label: 'Self-Healing Report', path: path.relative(OUT, PATHS.healingReport) });

  const screenshotsDir = path.join(ROOT, 'reports', 'web', 'screenshots');
  if (fs.existsSync(screenshotsDir)) quickLinks.push({ icon: '📸', label: 'Screenshots Folder', path: path.relative(OUT, screenshotsDir) });

  const videosDir = path.join(ROOT, 'reports', 'web', 'videos');
  if (fs.existsSync(videosDir)) quickLinks.push({ icon: '🎥', label: 'Videos Folder', path: path.relative(OUT, videosDir) });

  const tracesDir = path.join(ROOT, 'reports', 'web', 'traces');
  if (fs.existsSync(tracesDir)) quickLinks.push({ icon: '🔍', label: 'Traces Folder', path: path.relative(OUT, tracesDir) });

  // If no links, add disabled ones
  if (quickLinks.length === 0) {
    quickLinks.push({ icon: '📄', label: 'No detailed reports available', path: '#', disabled: true });
  }

  const linksHtml = quickLinks.map(l => {
    const disabled = l.disabled ? ' disabled' : '';
    const href = l.disabled ? '#' : l.path;
    return `<a href="${href}" class="link-btn${disabled}" target="_blank"><span class="btn-icon">${l.icon}</span> ${escHtml(l.label)}</a>`;
  }).join('\n');

  // Score ring SVG
  const score = e.productionReadiness.score;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  let scoreColor = '#ef4444';
  if (score >= 90) scoreColor = '#22c55e';
  else if (score >= 75) scoreColor = '#3b82f6';
  else if (score >= 50) scoreColor = '#eab308';

  const scoreRing = `
    <div class="score-ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="var(--border-color)" stroke-width="8"/>
        <circle cx="60" cy="60" r="45" fill="none" stroke="${scoreColor}" stroke-width="8"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90, 60, 60)" style="transition: stroke-dashoffset 1.5s ease"/>
      </svg>
      <div class="score-text" style="color:${scoreColor}">${score}</div>
    </div>
    <div class="score-label">${escHtml(e.productionReadiness.qualityStatus)}</div>`;

  // Pass/fail chart data
  const total = e.total;
  const passed = e.passed;
  const failed = e.failed;
  const skipped = e.skipped;

  // Platform summary data for charts
  const platforms = [
    { name: 'Web', total: w && w.summary ? w.summary.total : 0, passed: w && w.summary ? w.summary.passed : 0, failed: w && w.summary ? w.summary.failed : 0 },
    { name: 'Android', total: a && a.summary ? a.summary.total : 0, passed: a && a.summary ? a.summary.passed : 0, failed: a && a.summary ? a.summary.failed : 0 },
    { name: 'iOS', total: i && i.summary ? i.summary.total : 0, passed: i && i.summary ? i.summary.passed : 0, failed: i && i.summary ? i.summary.failed : 0 },
    { name: 'API', total: api && api.summary ? api.summary.total : 0, passed: api && api.summary ? api.summary.passed : 0, failed: api && api.summary ? api.summary.failed : 0 },
  ];

  // Feature data for charts (web)
  const webFeatures = w && w.features ? w.features : [] as any[];
  const featureNames = JSON.stringify(webFeatures.map((f: any) => f.name));
  const featurePassed = JSON.stringify(webFeatures.map((f: any) => f.passed));
  const featureFailed = JSON.stringify(webFeatures.map((f: any) => f.failed));

  // RC category data
  const rcCategories = rc && rc.categories ? rc.categories : { locator: 0, assertion: 0, timeout: 0, testData: 0, environment: 0, api: 0, mobileDevice: 0, performance: 0, unknown: 0 };

  // Release card class
  let releaseCardClass = 'release-card conditional';
  if (e.releaseDecision === 'GO') releaseCardClass = 'release-card go';
  else if (e.releaseDecision === 'NO-GO') releaseCardClass = 'release-card nogo';

  // Android/iOS env details
  const androidEnv = a && a.env ? a.env : {} as Record<string, any>;
  const iosEnv = i && i.env ? i.env : {} as Record<string, any>;


  // Helper: Android missing report HTML
  function androidReportMissingHTML(aData: any) {
    const ei = aData && aData.execInfo ? aData.execInfo : null;
    const rp = aData && aData.reportPaths ? aData.reportPaths : {} as Record<string, any>;
    const ls = aData && aData.lifecycleSummary ? aData.lifecycleSummary : null;
    const msg = aData && aData._execMessage ? aData._execMessage : 'Execution completed but no cucumber report was generated.';
    const reportStatus = aData && aData._reportStatus ? aData._reportStatus : 'Cucumber report not generated';
    const hasLifecycle = rp.lifecycleSummary || (ls && ls.available);
    const hasAndroidSummary = (aData && aData._androidSummaryAvailable);
    const lsPathRel = 'reports/ai/android-execution-lifecycle-summary.md';
    var clStatus = es ? (es.androidCleanupStatus || null) : null;
    var clMessage = es ? (es.androidCleanupMessage || null) : null;
    var clDuration = es ? (es.androidCleanupDuration || null) : null;
    var execBadgeClass = 'badge-info';
    var reportBadgeClass = 'badge-warning';
    var reportBadgeText = reportStatus;

    // Determine final Android result and badge
    var finalResult = '';
    var finalBadgeClass = 'badge-info';
    if (ei && ei.status === 'PASSED') execBadgeClass = 'badge-pass';
    else if (ei && ei.status === 'FAILED') execBadgeClass = 'badge-fail';

    if (reportBadgeText && reportBadgeText.includes('Cucumber report not generated')) {
      reportBadgeClass = 'badge-info';
      finalResult = 'INCOMPLETE - Execution completed, no reports generated';
      finalBadgeClass = 'badge-warning';
    } else if (ei && ei.status === 'PASSED') {
      finalResult = 'PARTIAL - Execution completed, some reports available';
      finalBadgeClass = 'badge-warning';
    } else {
      finalResult = 'INCOMPLETE - Execution had issues';
      finalBadgeClass = 'badge-warning';
    }

    let card = '<div class="card anim" style="border-left:3px solid var(--yellow)">';
    card += '<div class="card-title">📱 Android Automation — Execution Summary</div>';
    card += '<div class="card-row"><span class="lbl">Final Android Result</span><span class="vl"><span class="badge ' + finalBadgeClass + '">' + escHtml(finalResult) + '</span></span></div>';
    card += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;padding:8px 12px;background:rgba(234,179,8,0.08);border-radius:6px">⚠️ ' + escHtml(msg) + '</div>';
    if (ei) {
      card += '<div class="card-row"><span class="lbl">Execution Status</span><span class="vl"><span class="' + execBadgeClass + '">' + escHtml(ei.status) + '</span></span></div>';
      if (ei.command) card += '<div class="card-row"><span class="lbl">Command Executed</span><span class="vl" style="font-size:11px;color:var(--cyan)">' + escHtml(ei.command) + '</span></div>';
      if (ei.duration) card += '<div class="card-row"><span class="lbl">Duration</span><span class="vl">' + escHtml(ei.duration) + '</span></div>';
      if (ei.errorMessage) card += '<div class="card-row"><span class="lbl">Error/Notes</span><span class="vl" style="font-size:11px;color:var(--red)">' + escHtml(ei.errorMessage.substring(0, 200)) + '</span></div>';
    }
    card += '<div class="card-row"><span class="lbl">Test Report Status</span><span class="vl"><span class="badge ' + reportBadgeClass + '">' + escHtml(reportBadgeText) + '</span></span></div>';
    card += '<div class="card-row"><span class="lbl">Cucumber Report</span><span class="vl" style="color:var(--red)">Not generated</span></div>';
    // Device / emulator status
    var devName = (aData && aData.env && (aData.env.DEVICE_NAME || aData.env.deviceName)) || 'N/A';
    card += '<div class="card-row"><span class="lbl">Device / Emulator</span><span class="vl" style="color:var(--cyan)">' + escHtml(devName) + '</span></div>';
    if (hasAndroidSummary) card += '<div class="card-row"><span class="lbl">Android Summary</span><span class="vl"><span class="badge badge-pass">Summary found</span></span></div>';
    if (hasLifecycle) {
      card += '<div class="card-row"><span class="lbl">Lifecycle Summary</span><span class="vl"><a href="' + lsPathRel + '" target="_blank" style="color:var(--blue)">View &rarr;</a></span></div>';
    }
    if (rp.androidDir) card += '<div class="card-row"><span class="lbl">Android Directory</span><span class="vl" style="color:var(--green)">Found</span></div>';
    // Cleanup status
    if (clStatus) {
      var cls = clStatus === 'PASSED' ? 'badge-pass' : clStatus === 'FAILED' ? 'badge-fail' : 'badge-info';
      card += '<div class="card-row"><span class="lbl">Cleanup Status</span><span class="vl"><span class="' + cls + '">' + escHtml(clStatus) + '</span></span></div>';
      if (clDuration) card += '<div class="card-row"><span class="lbl">Cleanup Duration</span><span class="vl">' + escHtml(clDuration) + '</span></div>';
    } else {
      card += '<div class="card-row"><span class="lbl">Cleanup Status</span><span class="vl" style="color:var(--text-muted)">Not available</span></div>';
    }
    card += '</div>';
    return card;
  }

  // Helper: iOS missing report HTML
  function iosReportMissingHTML(iData: any) {
    const ei = iData && iData.execInfo ? iData.execInfo : null;
    const rp = iData && iData.reportPaths ? iData.reportPaths : {} as Record<string, any>;
    const ls = iData && iData.lifecycleSummary ? iData.lifecycleSummary : null;
    const msg = iData && iData._execMessage ? iData._execMessage : 'iOS execution completed but no test report was generated.';
    const reportStatus = iData && iData._reportStatus ? iData._reportStatus : 'No test result';
    const hasLifecycle = rp.lifecycleSummary || (ls && ls.available);
    const simLaunched = iData && iData._simulatorLaunched;
    const actualExecStarted = iData && iData._actualExecutionStarted;
    const lsPathRel = 'reports/ai/ios-execution-lifecycle-summary.md';
    var clStatus = es ? (es.iosCleanupStatus || null) : null;
    var clMessage = es ? (es.iosCleanupMessage || null) : null;
    var clDuration = es ? (es.iosCleanupDuration || null) : null;
    var execBadgeClass = 'badge-info';
    var reportBadgeClass = 'badge-warning';
    var reportBadgeText = reportStatus;
    var finalResult = '';
    var finalBadgeClass = 'badge-info';
    if (ei && ei.status === 'PASSED') execBadgeClass = 'badge-pass';
    else if (ei && ei.status === 'FAILED') execBadgeClass = 'badge-fail';

    // Determine final iOS result
    if (!simLaunched) {
      finalResult = 'FAILED - Simulator did not launch';
      finalBadgeClass = 'badge-fail';
      reportBadgeClass = 'badge-fail';
    } else if (simLaunched && !actualExecStarted) {
      finalResult = 'INCOMPLETE - Simulator launched but testcases did not execute';
      finalBadgeClass = 'badge-warning';
      reportBadgeClass = 'badge-fail';
      finalResult = 'INCOMPLETE - Tests started but no reports generated';
      finalBadgeClass = 'badge-warning';
      finalBadgeClass = 'badge-warning';
      reportBadgeClass = 'badge-info';
    } else {
      finalResult = 'INCOMPLETE - No test results available';
      finalBadgeClass = 'badge-warning';
    }

    if (!simLaunched) {
      reportBadgeClass = 'badge-fail';
    }

    let card = '<div class="card anim" style="border-left:3px solid var(--yellow)">';
    card += '<div class="card-title">🍎 iOS Automation — Execution Summary</div>';
    card += '<div class="card-row"><span class="lbl">Final iOS Result</span><span class="vl"><span class="badge ' + finalBadgeClass + '">' + escHtml(finalResult) + '</span></span></div>';
    card += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;padding:8px 12px;background:rgba(234,179,8,0.08);border-radius:6px">⚠️ ' + escHtml(msg) + '</div>';
    if (ei) {
      card += '<div class="card-row"><span class="lbl">Execution Status</span><span class="vl"><span class="' + execBadgeClass + '">' + escHtml(ei.status) + '</span></span></div>';
      if (ei.command) card += '<div class="card-row"><span class="lbl">Command Executed</span><span class="vl" style="font-size:11px;color:var(--cyan)">' + escHtml(ei.command) + '</span></div>';
      if (ei.duration) card += '<div class="card-row"><span class="lbl">Duration</span><span class="vl">' + escHtml(ei.duration) + '</span></div>';
      if (ei.errorMessage) card += '<div class="card-row"><span class="lbl">Error/Notes</span><span class="vl" style="font-size:11px;color:var(--red)">' + escHtml(ei.errorMessage.substring(0, 200)) + '</span></div>';
    }
    card += '<div class="card-row"><span class="lbl">Test Report Status</span><span class="vl"><span class="badge ' + reportBadgeClass + '">' + escHtml(reportBadgeText) + '</span></span></div>';
    // Simulator and execution status
    card += '<div class="card-row"><span class="lbl">Simulator Launch Status</span><span class="vl"><span class="badge ' + (simLaunched ? 'badge-pass' : 'badge-fail') + '">' + (simLaunched ? 'Launched' : 'Not launched') + '</span></span></div>';
    card += '<div class="card-row"><span class="lbl">Actual Test Execution</span><span class="vl"><span class="badge ' + (actualExecStarted ? 'badge-pass' : 'badge-warning') + '">' + (actualExecStarted ? 'Started' : 'Not started') + '</span></span></div>';
    card += '<div class="card-row"><span class="lbl">Cucumber Report</span><span class="vl" style="color:var(--red)">Not generated</span></div>';
    // Report availability
    var devName = (iData && iData.env && (iData.env.DEVICE_NAME || iData.env.deviceName)) || 'N/A';
    card += '<div class="card-row"><span class="lbl">Simulator</span><span class="vl" style="color:var(--cyan)">' + escHtml(devName) + '</span></div>';
    if (hasLifecycle) {
      card += '<div class="card-row"><span class="lbl">Lifecycle Summary</span><span class="vl"><a href="' + lsPathRel + '" target="_blank" style="color:var(--blue)">View &rarr;</a></span></div>';
    }
    if (rp.iosDir) card += '<div class="card-row"><span class="lbl">iOS Directory</span><span class="vl" style="color:var(--green)">Found</span></div>';
    // Cleanup status
    if (clStatus) {
      var cls = clStatus === 'PASSED' ? 'badge-pass' : clStatus === 'FAILED' ? 'badge-fail' : 'badge-info';
      card += '<div class="card-row"><span class="lbl">Cleanup Status</span><span class="vl"><span class="' + cls + '">' + escHtml(clStatus) + '</span></span></div>';
      if (clDuration) card += '<div class="card-row"><span class="lbl">Cleanup Duration</span><span class="vl">' + escHtml(clDuration) + '</span></div>';
    } else {
      card += '<div class="card-row"><span class="lbl">Cleanup Status</span><span class="vl" style="color:var(--text-muted)">Not available</span></div>';
    }
    card += '</div>';
    return card;
  }


  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Consolidated Test Dashboard — Amazon Automation</title>
  <style>
    :root {
      --bg-primary: #0b1121;
      --bg-secondary: #131c31;
      --bg-card: #1a253e;
      --bg-card-hover: #243049;
      --text-primary: #e2e8f0;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --border-color: #1e3a5f;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
      --purple: #a855f7;
      --cyan: #06b6d4;
      --orange: #f97316;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
    }
    .container { max-width: 1440px; margin: 0 auto; padding: 24px; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-secondary); }
    ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* Header */
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 28px;
      flex-wrap: wrap; gap: 12px;
    }
    .header-left h1 {
      font-size: 22px; font-weight: 800;
      background: linear-gradient(135deg, #3b82f6, #a855f7);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .header-left .subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 2px; letter-spacing: 0.3px; }
    .header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .header-right .ts { font-size: 11px; color: var(--text-muted); }

    /* Status badges */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
    .badge-pass { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-fail { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-skip { background: rgba(100,116,139,0.15); color: var(--text-muted); }
    .badge-go { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-nogo { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-warning { background: rgba(234,179,8,0.15); color: var(--yellow); }
    .badge-info { background: rgba(59,130,246,0.15); color: var(--blue); }

    .status-badge { padding: 4px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; }
    .status-badge.pass { background: rgba(34,197,94,0.15); color: var(--green); }
    .status-badge.fail { background: rgba(239,68,68,0.15); color: var(--red); }
    .status-badge.warn { background: rgba(234,179,8,0.15); color: var(--yellow); }

    /* Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .stat-card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px;
      padding: 16px; position: relative; overflow: hidden; transition: all 0.25s;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: var(--blue); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .stat-card .icon { font-size: 20px; margin-bottom: 6px; }
    .stat-card .label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
    .stat-card .value { font-size: 26px; font-weight: 700; margin: 2px 0; }
    .stat-card .sub { font-size: 11px; color: var(--text-muted); }

    /* Progress bar */
    .pbar { height: 6px; border-radius: 3px; background: var(--border-color); margin-top: 6px; overflow: hidden; }
    .pfill { height: 100%; border-radius: 3px; transition: width 1s ease; }
    .pfill.green { background: linear-gradient(90deg, #16a34a, #22c55e); }
    .pfill.red { background: linear-gradient(90deg, #dc2626, #ef4444); }
    .pfill.blue { background: linear-gradient(90deg, #2563eb, #3b82f6); }
    .pfill.yellow { background: linear-gradient(90deg, #ca8a04, #eab308); }

    /* Section */
    .section { margin-bottom: 32px; }
    .section-title {
      font-size: 18px; font-weight: 700; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title:after {
      content: ''; flex: 1; height: 1px; background: var(--border-color); margin-left: 12px;
    }

    /* Card grid */
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px;
      padding: 20px; transition: all 0.25s;
    }
    .card:hover { border-color: var(--blue); }
    .card-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.3px; }

    .card-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(30,58,95,0.4); font-size: 13px; }
    .card-row:last-child { border-bottom: none; }
    .card-row .lbl { color: var(--text-secondary); }
    .card-row .vl { font-weight: 600; }

    /* Table */
    .tbl-wrap { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .tbl th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); font-weight: 600; white-space: nowrap; }
    .tbl td { padding: 8px 10px; border-bottom: 1px solid rgba(30,58,95,0.4); }
    .tbl tr:hover td { background: var(--bg-card-hover); }

    /* Release card */
    .rcard { text-align: center; padding: 32px; border-radius: 10px; border: 2px solid var(--border-color); }
    .rcard.go { border-color: var(--green); background: rgba(34,197,94,0.04); }
    .rcard.nogo { border-color: var(--red); background: rgba(239,68,68,0.04); }
    .rcard.warning { border-color: var(--yellow); background: rgba(234,179,8,0.04); }
    .rcard .rdecision { font-size: 42px; font-weight: 800; margin: 8px 0; letter-spacing: 2px; }
    .rcard .rrason { font-size: 13px; color: var(--text-secondary); max-width: 500px; margin: 0 auto; }

    /* Score ring */
    .sring { width: 110px; height: 110px; margin: 0 auto; position: relative; }
    .sring svg { transform: rotate(-90deg); }
    .sring .stxt { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 26px; font-weight: 700; }
    .sring .slbl { text-align: center; font-size: 11px; color: var(--text-secondary); margin-top: 4px; }

    /* Links */
    .links { display: flex; flex-wrap: wrap; gap: 6px; }
    .link-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 12px; border-radius: 6px;
      background: var(--bg-secondary); border: 1px solid var(--border-color);
      color: var(--text-primary); text-decoration: none; font-size: 12px;
      transition: all 0.2s; white-space: nowrap;
    }
    .link-btn:hover { background: var(--bg-card-hover); border-color: var(--blue); transform: translateY(-1px); }
    .link-btn.disabled { opacity: 0.35; pointer-events: none; }

    /* Animate */
    .anim { animation: fadeUp 0.4s ease forwards; opacity: 0; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

    /* Not executed */
    .na { text-align: center; padding: 24px; color: var(--text-muted); font-size: 14px; }

    /* Responsive */
    @media (max-width: 768px) {
      .container { padding: 12px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .card-grid { grid-template-columns: 1fr; }
      .rcard .rdecision { font-size: 28px; }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<div class="container">

  <!-- ═══ HEADER ═══ -->
  <header class="header">
    <div class="header-left">
      <h1>🚀 Consolidated Test Command Center</h1>
      <div class="subtitle">${escHtml(data.projectName)} · v${escHtml(data.version)}</div>
    </div>
    <div class="header-right">
      <span class="ts">🕐 ${escHtml(e.executionDate)}</span>
      <span class="status-badge ${e.releaseDecision === 'GO' ? 'pass' : e.releaseDecision === 'NO-GO' ? 'fail' : 'warn'}">
        ${e.releaseDecision}
      </span>
    </div>
  </header>

  <!-- ═══ A. EXECUTIVE SUMMARY ═══ -->
  <div class="section">
    <div class="section-title">📊 <span>Executive Summary</span></div>
    <div class="stats-grid">
      <div class="stat-card anim" style="animation-delay:0.02s">
        <div class="icon">📊</div>
        <div class="label">Total Tests</div>
        <div class="value">${e.total}</div>
        <div class="sub">${e.passed} passed · ${e.failed} failed · ${e.skipped} skipped</div>
      </div>
      <div class="stat-card anim" style="animation-delay:0.06s">
        <div class="icon">✅</div>
        <div class="label">Pass Rate</div>
        <div class="value" style="color:${e.passPercent >= 90 ? 'var(--green)' : e.passPercent >= 70 ? 'var(--yellow)' : 'var(--red)'}">${e.passPercent}%</div>
        <div class="pbar"><div class="pfill ${e.passPercent >= 90 ? 'green' : e.passPercent >= 70 ? 'yellow' : 'red'}" style="width:${e.passPercent}%"></div></div>
      </div>
      <div class="stat-card anim" style="animation-delay:0.1s">
        <div class="icon">⏱️</div>
        <div class="label">Duration</div>
        <div class="value" style="font-size:20px">${escHtml(e.totalDuration)}</div>
        <div class="sub">${escHtml(e.executionDate)}</div>
      </div>
      <div class="stat-card anim" style="animation-delay:0.14s">
        <div class="icon">🌐</div>
        <div class="label">Environment</div>
        <div class="value" style="font-size:18px">${escHtml(e.environment.toUpperCase())}</div>
        <div class="sub">${escHtml(e.browser)}</div>
      </div>
      <div class="stat-card anim" style="animation-delay:0.18s">
        <div class="icon">🔀</div>
        <div class="label">Branch</div>
        <div class="value" style="font-size:14px">${escHtml(e.gitBranch)}</div>
        <div class="sub">Build: ${escHtml(e.buildNumber)}</div>
      </div>
      <div class="stat-card anim" style="animation-delay:0.22s">
        <div class="icon">🏗️</div>
        <div class="label">Suites</div>
        <div class="value" style="font-size:18px">${e.suitesExecuted}</div>
        <div class="sub">${e.suitesPassed} passed · ${e.suitesFailed} failed</div>
      </div>
    </div>

    <!-- Release Gate -->
    <div class="rcard ${releaseCardClass} anim" style="animation-delay:0.26s">
      <div style="font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;font-weight:600">Release Decision</div>
      <div class="rdecision" style="color:${e.releaseDecision === 'GO' ? 'var(--green)' : e.releaseDecision === 'NO-GO' ? 'var(--red)' : 'var(--yellow)'}">${e.releaseDecision}</div>
      <div class="rrason">${escHtml(e.releaseReason)}</div>
    </div>
  </div>

  <!-- ═══ B. WEB AUTOMATION ═══ -->
  <div class="section">
    <div class="section-title">🌐 <span>Web Automation</span></div>
    ${w && w.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Web Summary</div>
        ${cardRow('Total Scenarios', w.summary.total)}
        ${cardRow('Passed', w.summary.passed, 'var(--green)')}
        ${cardRow('Failed', w.summary.failed, w.summary.failed > 0 ? 'var(--red)' : 'var(--green)')}
        ${cardRow('Skipped', w.summary.skipped)}
        ${cardRow('Pass Rate', w.summary.passRate + '%', w.summary.passRate >= 90 ? 'var(--green)' : 'var(--yellow)')}
        ${cardRow('Duration', fmtDuration(w.summary.totalDurationMs))}
        ${cardRow('Browser', escHtml(w.env.BROWSER || 'N/A'))}
        ${w.screenshots && w.screenshots.length > 0 ? cardRow('Screenshots', w.screenshots.length) : ''}
        ${w.videos && w.videos.length > 0 ? cardRow('Videos', w.videos.length) : ''}
        ${w.traces && w.traces.length > 0 ? cardRow('Traces', w.traces.length) : ''}
      </div>
      <div class="card anim" style="animation-delay:0.08s">
        <div class="card-title">📊 Pass / Fail Distribution</div>
        <div style="height:200px;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:36px;font-weight:700;color:var(--green)">${w.summary.passed}</div><div style="font-size:11px;color:var(--text-muted)">Passed</div></div>
          <div style="text-align:center"><div style="font-size:36px;font-weight:700;color:var(--red)">${w.summary.failed}</div><div style="font-size:11px;color:var(--text-muted)">Failed</div></div>
          <div style="text-align:center"><div style="font-size:36px;font-weight:700;color:var(--text-muted)">${w.summary.skipped}</div><div style="font-size:11px;color:var(--text-muted)">Skipped</div></div>
        </div>
        <div class="pbar" style="margin-top:8px"><div class="pfill ${w.summary.passRate >= 90 ? 'green' : 'yellow'}" style="width:${w.summary.passRate}%"></div></div>
      </div>
    </div>

    <!-- Feature-wise -->
    <div class="card" style="margin-top:16px">
      <div class="card-title">📑 Feature-wise Summary</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Feature</th><th>Total</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Pass %</th></tr></thead>
          <tbody>${featureRows(w.features)}</tbody>
        </table>
      </div>
    </div>

    ${w.failedScenarios && w.failedScenarios.length > 0 ? `
    <div class="card" style="margin-top:16px">
      <div class="card-title" style="color:var(--red)">❌ Failed Scenarios</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Feature</th><th>Scenario</th><th>Status</th></tr></thead>
          <tbody>${failedRows(w.failedScenarios)}</tbody>
        </table>
      </div>
    </div>` : `
    <div class="card" style="margin-top:16px">
      <div class="card-title" style="color:var(--green)">✅ All Web Scenarios Passed</div>
    </div>`}
    ` : `<div class="na anim">🌐 Web tests not executed or reports not available</div>`}
  </div>

  <!-- ═══ C. ANDROID AUTOMATION ═══ -->
  <div class="section">
    <div class="section-title">📱 <span>Android Automation</span></div>
    ${a && a.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Android Summary</div>
        ${cardRow('Total Scenarios', a.summary.total)}
        ${cardRow('Passed', a.summary.passed, 'var(--green)')}
        ${cardRow('Failed', a.summary.failed, a.summary.failed > 0 ? 'var(--red)' : 'var(--green)')}
        ${cardRow('Skipped', a.summary.skipped)}
        ${cardRow('Pass Rate', a.summary.passRate + '%', a.summary.passRate >= 90 ? 'var(--green)' : 'var(--yellow)')}
        ${cardRow('Device', escHtml(a.env.DEVICE_NAME || a.env.deviceName || 'N/A'))}
        ${cardRow('OS Version', escHtml(a.env.OS_VERSION || a.env.platformVersion || 'N/A'))}
        ${a.screenshots && a.screenshots.length > 0 ? cardRow('Screenshots', a.screenshots.length) : ''}
        ${a.videos && a.videos.length > 0 ? cardRow('Videos', a.videos.length) : ''}
      </div>
    </div>
    ${a.failedScenarios && a.failedScenarios.length > 0 ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title" style="color:var(--red)">❌ Failed Android Scenarios</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Feature</th><th>Scenario</th><th>Status</th></tr></thead>
          <tbody>${failedRows(a.failedScenarios)}</tbody>
        </table>
      </div>
    </div>` : `
    <div class="card" style="margin-top:12px">
      <div class="card-title" style="color:var(--green)">✅ All Android Scenarios Passed</div>
    </div>`}
    ` : androidReportMissingHTML(a)}
  </div>

  <!-- ═══ D. iOS AUTOMATION ═══ -->
  <div class="section">
    <div class="section-title">🍎 <span>iOS Automation</span></div>
    ${i && i.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 iOS Summary</div>
        ${cardRow('Total Scenarios', i.summary.total)}
        ${cardRow('Passed', i.summary.passed, 'var(--green)')}
        ${cardRow('Failed', i.summary.failed, i.summary.failed > 0 ? 'var(--red)' : 'var(--green)')}
        ${cardRow('Skipped', i.summary.skipped)}
        ${cardRow('Pass Rate', i.summary.passRate + '%', i.summary.passRate >= 90 ? 'var(--green)' : 'var(--yellow)')}
        ${cardRow('Simulator', escHtml(i.env.DEVICE_NAME || i.env.deviceName || 'N/A'))}
        ${cardRow('iOS Version', escHtml(i.env.OS_VERSION || i.env.platformVersion || 'N/A'))}
        ${i.screenshots && i.screenshots.length > 0 ? cardRow('Screenshots', i.screenshots.length) : ''}
        ${i.videos && i.videos.length > 0 ? cardRow('Videos', i.videos.length) : ''}
      </div>
    </div>
    ${i.failedScenarios && i.failedScenarios.length > 0 ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title" style="color:var(--red)">❌ Failed iOS Scenarios</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Feature</th><th>Scenario</th><th>Status</th></tr></thead>
          <tbody>${failedRows(i.failedScenarios)}</tbody>
        </table>
      </div>
    </div>` : `
    <div class="card" style="margin-top:12px">
      <div class="card-title" style="color:var(--green)">✅ All iOS Scenarios Passed</div>
    </div>`}
    ` : iosReportMissingHTML(i)}
  </div>

  <!-- ═══ E. API TESTING ═══ -->
  <div class="section">
    <div class="section-title">🔌 <span>API Testing</span></div>
    ${api && api.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 API Summary</div>
        ${cardRow('Total APIs', api.summary.total)}
        ${cardRow('Passed', api.summary.passed, 'var(--green)')}
        ${cardRow('Failed', api.summary.failed, api.summary.failed > 0 ? 'var(--red)' : 'var(--green)')}
        ${cardRow('Pass Rate', (api.summary.passRate || 0) + '%', (api.summary.passRate || 0) >= 90 ? 'var(--green)' : 'var(--yellow)')}
        ${api.avgResponseTime ? cardRow('Avg Response Time', api.avgResponseTime) : ''}
        ${api.fastestAPI ? cardRow('Fastest API', api.fastestAPI) : ''}
        ${api.slowestAPI ? cardRow('Slowest API', api.slowestAPI) : ''}
        ${api.executionDuration ? cardRow('Execution Duration', api.executionDuration) : ''}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">📊 API Results</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Method</th><th>URL</th><th>Status Code</th><th>Response Time</th><th>Result</th><th>Details</th></tr></thead>
          <tbody>${apiResultRows(api.results)}</tbody>
        </table>
      </div>
    </div>
    ${api.aiAnalysis ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title">🤖 AI API Analysis</div>
      <div style="font-size:12px;color:var(--text-secondary);max-height:200px;overflow-y:auto;white-space:pre-wrap">${escHtml(api.aiAnalysis.substring(0, 1000))}${api.aiAnalysis.length > 1000 ? '...' : ''}</div>
    </div>` : ''}
    ` : `<div class="na anim">🔌 API tests not executed or reports not available</div>`}
  </div>

  <!-- ═══ F. JMETER / PERFORMANCE ═══ -->
  <div class="section">
    <div class="section-title">⚡ <span>JMeter / Performance</span></div>
    ${perf && perf.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Performance Summary</div>
        ${perf.jtlData ? `
          ${cardRow('Total Requests', perf.jtlData.totalRequests || 0)}
          ${cardRow('Avg Response Time', (perf.jtlData.avgResponseTime || 0) + 'ms')}
          ${cardRow('Min Response Time', (perf.jtlData.min || 0) + 'ms')}
          ${cardRow('Max Response Time', (perf.jtlData.max || 0) + 'ms')}
          ${cardRow('Error %', (perf.jtlData.errorRate || 0) + '%', (perf.jtlData.errorRate || 0) > 5 ? 'var(--red)' : 'var(--green)')}
          ${cardRow('90th Percentile', (perf.jtlData.p90 || 0) + 'ms')}
          ${cardRow('95th Percentile', (perf.jtlData.p95 || 0) + 'ms')}
        ` : perf.summaryData ? `
          ${(Object.entries(perf.summaryData) as [string, any][]).map(([k, v]) => cardRow(k, v)).join('')}
        ` : `
          <div style="color:var(--text-muted)">No detailed performance data available</div>
        `}
      </div>
    </div>
    ${perf.aiPerfReport ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title">🤖 AI Performance Recommendation</div>
      <div style="font-size:12px;color:var(--text-secondary);max-height:200px;overflow-y:auto;white-space:pre-wrap">${escHtml(perf.aiPerfReport.substring(0, 1000))}${perf.aiPerfReport.length > 1000 ? '...' : ''}</div>
    </div>` : ''}
    ` : `<div class="na anim">⚡ Performance test not executed or reports not available</div>`}
  </div>

  <!-- ═══ G. AI ANALYSIS ═══ -->
  <div class="section">
    <div class="section-title">🤖 <span>AI Analysis</span></div>
    ${ai && ai.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 AI Report Summary</div>
        ${ai.testExecutionSummary ? `
          ${cardRow('Total Analyzed', ai.testExecutionSummary.total || 0)}
          ${cardRow('AI Status', ai.testExecutionSummary.status || 'Completed')}
        ` : ''}
        ${cardRow('Available Reports', (ai.files ? ai.files.length : 0) + ' files')}
      </div>
      ${ai.postTestSummary ? `
      <div class="card anim" style="animation-delay:0.08s">
        <div class="card-title">📝 Execution Summary</div>
        <div style="font-size:12px;color:var(--text-secondary);max-height:200px;overflow-y:auto;white-space:pre-wrap">${escHtml(ai.postTestSummary.substring(0, 800))}${ai.postTestSummary.length > 800 ? '...' : ''}</div>
      </div>` : ''}
      ${ai.codeReview ? `
      <div class="card anim" style="animation-delay:0.12s">
        <div class="card-title">🔍 Code Review Summary</div>
        <div style="font-size:12px;color:var(--text-secondary);max-height:200px;overflow-y:auto;white-space:pre-wrap">${escHtml(ai.codeReview.substring(0, 800))}${ai.codeReview.length > 800 ? '...' : ''}</div>
      </div>` : ''}
      ${ai.jenkinsAnalysis ? `
      <div class="card anim" style="animation-delay:0.16s">
        <div class="card-title">🔧 Root Cause Analysis (Jenkins)</div>
        <div style="font-size:12px;color:var(--text-secondary);max-height:200px;overflow-y:auto;white-space:pre-wrap">${escHtml(ai.jenkinsAnalysis.substring(0, 800))}${ai.jenkinsAnalysis.length > 800 ? '...' : ''}</div>
      </div>` : ''}
    </div>
    ` : `<div class="na anim">🤖 AI analysis not available</div>`}
  </div>

  <!-- ═══ H. SELF-HEALING ═══ -->
  <div class="section">
    <div class="section-title">🩹 <span>Self-Healing</span></div>
    ${sh && sh.available ? `
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Healing Summary</div>
        ${cardRow('Total Locator Failures', sh.totalFailures)}
        ${cardRow('Healed Locators', sh.healed, 'var(--green)')}
        ${cardRow('Healing Success %', sh.healingSuccess + '%', sh.healingSuccess >= 80 ? 'var(--green)' : 'var(--yellow)')}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">🔧 Locator Healing Details</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Old Locator</th><th>Suggested Locator</th><th>Confidence</th><th>Status</th></tr></thead>
          <tbody>${healingRows(sh.entries)}</tbody>
        </table>
      </div>
    </div>
    ` : `<div class="na anim">🩹 Self-healing report not available</div>`}
  </div>

  <!-- ═══ I. ROOT CAUSE & FAILURE ANALYSIS ═══ -->
  <div class="section">
    <div class="section-title">🔍 <span>Root Cause & Failure Analysis</span></div>
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Failure Distribution</div>
        ${cardRow('Total Failures', rc.totalFailures || 0)}
        ${cardRow('Locator Issues', rc.categories.locator || 0, (rc.categories.locator || 0) > 0 ? 'var(--red)' : '')}
        ${cardRow('Assertion Issues', rc.categories.assertion || 0, (rc.categories.assertion || 0) > 0 ? 'var(--red)' : '')}
        ${cardRow('Timeout Issues', rc.categories.timeout || 0)}
        ${cardRow('Test Data Issues', rc.categories.testData || 0)}
        ${cardRow('Environment Issues', rc.categories.environment || 0)}
        ${cardRow('API Issues', rc.categories.api || 0)}
        ${cardRow('Mobile Device Issues', rc.categories.mobileDevice || 0)}
        ${cardRow('Performance Issues', rc.categories.performance || 0)}
        ${cardRow('Unknown Issues', rc.categories.unknown || 0)}
      </div>
      <div class="card anim" style="animation-delay:0.08s">
        <div class="card-title">🎯 Probable Root Cause</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">
          ${rc.totalFailures > 0 ? `
          <p style="margin-bottom:8px">Based on analysis of ${rc.totalFailures} failure(s):</p>
          <ul style="list-style:none;padding:0">
            ${(rc.categories.locator || 0) > 0 ? `<li style="padding:4px 0">🔴 <strong>Locator Issue</strong> — Selector not found or stale element reference</li>` : ''}
            ${(rc.categories.assertion || 0) > 0 ? `<li style="padding:4px 0">🟠 <strong>Assertion Issue</strong> — Expected value mismatch</li>` : ''}
            ${(rc.categories.timeout || 0) > 0 ? `<li style="padding:4px 0">🟡 <strong>Timeout Issue</strong> — Page/element load timeout exceeded</li>` : ''}
            ${(rc.categories.testData || 0) > 0 ? `<li style="padding:4px 0">🟣 <strong>Test Data Issue</strong> — Invalid or missing test data</li>` : ''}
            ${(rc.categories.environment || 0) > 0 ? `<li style="padding:4px 0">🔵 <strong>Environment Issue</strong> — Configuration or infrastructure problem</li>` : ''}
            ${(rc.categories.api || 0) > 0 ? `<li style="padding:4px 0">🟤 <strong>API Issue</strong> — API endpoint failure or unexpected response</li>` : ''}
            ${(rc.categories.mobileDevice || 0) > 0 ? `<li style="padding:4px 0">📱 <strong>Mobile Device Issue</strong> — Device/emulator or Appium issue</li>` : ''}
            ${(rc.categories.performance || 0) > 0 ? `<li style="padding:4px 0">⚡ <strong>Performance Issue</strong> — Response time or throughput degradation</li>` : ''}
            ${(rc.categories.unknown || 0) > 0 ? `<li style="padding:4px 0">⚪ <strong>Unknown Issue</strong> — Categorization needed</li>` : ''}
          </ul>
          ` : `<p>✅ No failures detected. Root cause analysis not required.</p>`}
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ J. FLAKY TEST ═══ -->
  <div class="section">
    <div class="section-title">🌀 <span>Flaky Tests</span></div>
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Flaky Summary</div>
        ${cardRow('Flaky Test Count', flaky.count)}
        ${cardRow('Flaky Percentage', flaky.percentage + '%', flaky.percentage > 10 ? 'var(--red)' : flaky.percentage > 5 ? 'var(--yellow)' : 'var(--green)')}
        ${flaky.count > 0 ? cardRow('Recommendation', 'Review and stabilize flaky tests', 'var(--yellow)') : cardRow('Stability', 'Stable', 'var(--green)')}
      </div>
    </div>
    ${flaky.scenarios && flaky.scenarios.length > 0 ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title">📑 Flaky Scenarios</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Feature</th><th>Scenario</th></tr></thead>
          <tbody>${flakyRows(flaky.scenarios)}</tbody>
        </table>
      </div>
    </div>` : ''}
  </div>

  <!-- ═══ K. TEST IMPACT ANALYSIS ═══ -->
  <div class="section">
    <div class="section-title">🎯 <span>Test Impact Analysis</span></div>
    <div class="card-grid">
      <div class="card anim">
        <div class="card-title">📋 Changed Files</div>
        <div style="font-size:12px;max-height:180px;overflow-y:auto">${getChangedFiles()}</div>
      </div>
      <div class="card anim" style="animation-delay:0.08s">
        <div class="card-title">🎯 Recommended Test Scope</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">
          <p style="margin-bottom:6px"><strong>Impacted Features:</strong></p>
          ${w && w.features ? w.features.map((f: any) => `<div style="font-size:12px;padding:2px 0">📌 ${escHtml(f.name)}</div>`).join('') : '<div style="font-size:12px;color:var(--text-muted)">No features loaded</div>'}
          <p style="margin-top:10px;margin-bottom:4px"><strong>Recommendation:</strong></p>
          <div style="font-size:12px;padding:4px 0;color:${e.passPercent >= 90 ? 'var(--green)' : 'var(--yellow)'}">
            ${e.passPercent >= 90 && e.failed === 0 ? '✅ Full suite — all tests passing with high pass rate' :
              e.failed > 0 ? '⚠️ Selective suite — focus on fixing failures first' :
              '🔄 Full suite recommended'}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ L. RELEASE GATEKEEPER ═══ -->
  <div class="section">
    <div class="section-title">🚦 <span>Release Gatekeeper</span></div>
    <div class="rcard ${releaseCardClass} anim">
      <div style="font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;font-weight:600">Final Release Decision</div>
      <div class="rdecision" style="color:${e.releaseDecision === 'GO' ? 'var(--green)' : e.releaseDecision === 'NO-GO' ? 'var(--red)' : 'var(--yellow)'}">${e.releaseDecision}</div>
      <div class="rrason">${escHtml(e.releaseReason)}</div>
      <div style="margin-top:16px;display:flex;justify-content:center;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--text-muted)">
        <span>📊 Pass Rate: ${e.passPercent}%</span>
        <span>❌ Failures: ${e.failed}</span>
        <span>📦 Build: ${escHtml(e.buildNumber)}</span>
      </div>
    </div>
  </div>

  <!-- ═══ M. PRODUCTION READINESS ═══ -->
  <div class="section">
    <div class="section-title">🏁 <span>Production Readiness Score</span></div>
    <div class="card-grid">
      <div class="card anim" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px">
        ${scoreRing}
        <div style="margin-top:16px;text-align:center">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Score Breakdown</div>
          <div style="font-size:11px;color:var(--text-muted);text-align:left">
            <div style="padding:2px 0">• Pass Rate: ${Math.min(30, Math.round(e.passPercent * 0.3))}/30</div>
            <div style="padding:2px 0">• API Stability: ${api && api.summary ? Math.min(15, Math.round(parseFloat(api.summary.passRate) * 0.15)) : 5}/15</div>
            <div style="padding:2px 0">• Mobile Tests: ${(a && a.available ? 10 : 0) + (i && i.available ? 10 : 0)}/20</div>
            <div style="padding:2px 0">• Performance: ${perf && perf.available ? 10 : 5}/10</div>
            <div style="padding:2px 0">• Flaky Deduction: -${Math.min(10, Math.round(flaky.percentage * 0.1))}/10</div>
            <div style="padding:2px 0">• Self-Healing: ${sh && sh.available ? Math.min(10, Math.round((sh.healingSuccess || 0) * 0.1)) : 0}/10</div>
            <div style="padding:2px 0">• Failure Deduction: -${Math.min(20, e.failed * 2)}</div>
          </div>
        </div>
      </div>
      <div class="card anim" style="animation-delay:0.08s">
        <div class="card-title">📋 Readiness Checklist</div>
        <div style="font-size:13px;line-height:1.8">
          <div style="padding:4px 0">${e.passPercent >= 90 ? '✅' : '❌'} Pass Rate: ${e.passPercent}% ${e.passPercent >= 90 ? '(Good)' : '(Needs improvement)'}</div>
          <div style="padding:4px 0">${api && api.summary && api.summary.passRate >= 90 ? '✅' : '❌'} API Stability: ${api && api.summary ? api.summary.passRate + '%' : 'N/A'}</div>
          <div style="padding:4px 0">${a && a.available ? '✅' : '❌'} Android Tests: ${a && a.available ? 'Executed' : 'Not executed'}</div>
          <div style="padding:4px 0">${i && i.available ? '✅' : '❌'} iOS Tests: ${i && i.available ? 'Executed' : 'Not executed'}</div>
          <div style="padding:4px 0">${perf && perf.available ? '✅' : '❌'} Performance: ${perf && perf.available && perf.jtlData && perf.jtlData.errorRate <= 5 ? 'Stable' : perf && perf.available ? 'Needs review' : 'Not executed'}</div>
          <div style="padding:4px 0">${flaky.percentage <= 10 ? '✅' : '❌'} Flaky Tests: ${flaky.percentage}% ${flaky.percentage <= 10 ? '(Acceptable)' : '(Needs attention)'}</div>
          <div style="padding:4px 0">${sh && sh.available && sh.healingSuccess >= 80 ? '✅' : '❌'} Self-Healing: ${sh && sh.available ? sh.healingSuccess + '% success' : 'N/A'}</div>
          <div style="padding:4px 0">${e.failed === 0 ? '✅' : '❌'} Zero Critical Failures: ${e.failed === 0 ? 'Yes' : e.failed + ' failure(s)'}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ M. PLATFORM EXECUTION STATUS ═══ -->
  <div class="section">
    <div class="section-title">📋 <span>Platform Execution Status</span></div>
    ${(function() {
      if (!es || !es.available) {
        return '<div class="na anim">Execution status not available</div>';
      }
      var rowsHtml = '';
      var arr = es.suites || [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var statusIcon, statusClass;
        if (s.status === 'PASSED') { statusIcon = '\u2705'; statusClass = 'pass'; }
        else if (s.status === 'FAILED') { statusIcon = '\u274C'; statusClass = 'fail'; }
        else if (s.status === 'SKIPPED') { statusIcon = '\u23ED'; statusClass = 'skip'; }
        else { statusIcon = '\u2B1C'; statusClass = ''; }
        var dur = s.durationFormatted || '';
        var err = s.errorMessage ? escHtml(s.errorMessage.substring(0, 120)) : '';
        rowsHtml += '<tr>' +
          '<td><strong>' + escHtml(s.suiteName) + '</strong></td>' +
          '<td style="font-size:11px">' + escHtml(s.command || '') + '</td>' +
          '<td><span class="badge badge-' + statusClass + '">' + statusIcon + ' ' + s.status + '</span></td>' +
          '<td style="font-size:11px">' + dur + '</td>' +
          '<td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + err + '</td>' +
          '</tr>';
        if (s.suiteName && s.suiteName.toLowerCase().indexOf('android automation') !== -1 && es.androidCleanupStatus) {
          var clStatus = es.androidCleanupStatus;
          var clMsg = es.androidCleanupMessage || '';
          var clDur = es.androidCleanupDuration || '';
          var clIcon = clStatus === 'PASSED' ? '\u2705' : clStatus === 'FAILED' ? '\u274C' : '\u2B1C';
          var clClass = clStatus === 'PASSED' ? 'pass' : clStatus === 'FAILED' ? 'fail' : 'skip';
          rowsHtml += '<tr style="background:rgba(30,58,95,0.2)">' +
            '<td style="font-size:11px;padding-left:20px">Android Emulator Cleanup</td>' +
            '<td style="font-size:11px"></td>' +
            '<td><span class="badge badge-' + clClass + '">' + clIcon + ' ' + clStatus + '</span></td>' +
            '<td style="font-size:11px">' + escHtml(clDur) + '</td>' +
            '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">' + escHtml(clMsg.substring(0, 120)) + '</td>' +
            '</tr>';
        }
        if (s.suiteName && s.suiteName.toLowerCase().indexOf('ios automation') !== -1 && es.iosCleanupStatus) {
          var clStatus = es.iosCleanupStatus;
          var clMsg = es.iosCleanupMessage || '';
          var clDur = es.iosCleanupDuration || '';
          var clIcon = clStatus === 'PASSED' ? '\u2705' : clStatus === 'FAILED' ? '\u274C' : '\u2B1C';
          var clClass = clStatus === 'PASSED' ? 'pass' : clStatus === 'FAILED' ? 'fail' : 'skip';
          rowsHtml += '<tr style="background:rgba(30,58,95,0.2)">' +
            '<td style="font-size:11px;padding-left:20px">iOS Simulator Cleanup</td>' +
            '<td style="font-size:11px"></td>' +
            '<td><span class="badge badge-' + clClass + '">' + clIcon + ' ' + clStatus + '</span></td>' +
            '<td style="font-size:11px">' + escHtml(clDur) + '</td>' +
            '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">' + escHtml(clMsg.substring(0, 120)) + '</td>' +
            '</tr>';
        }
      }
      return '<table class="data-table">' +
        '<thead><tr>' +
        '<th>Suite</th>' +
        '<th>Command</th>' +
        '<th>Status</th>' +
        '<th>Duration</th>' +
        '<th>Error / Notes</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '</table>';
    })()}
  </div>

  <!-- ═══ N. QUICK LINKS ═══ -->
  <div class="section">
    <div class="section-title">🔗 <span>Quick Links</span></div>
    <div class="links anim">
      ${linksHtml}
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0;border-top:1px solid var(--border-color);margin-top:20px">
    <div style="font-size:11px;color:var(--text-muted)">
      Consolidated Dashboard v2.0.0 · Generated by AI-Powered Automation Framework
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:4px">
      ${escHtml(data.projectName)} · ${escHtml(e.executionDate)}
    </div>
  </div>

</div>
</body>
</html>`;
}

// ──────────────────────────── MARKDOWN GENERATION ────────────────────────────

function generateSummaryMarkdown(data: any) {
  const e = data.executiveSummary;
  const w = data.web;
  const a = data.android;
  const i = data.ios;
  const api = data.api;
  const perf = data.performance;
  const sh = data.selfHealing;
  const flaky = data.flaky;
  const rc = data.rootCause;
  const es = data.executionStatus;

  let md = `# Consolidated Test Dashboard Summary

## Overview
- **Project:** ${data.projectName}
- **Generated:** ${e.executionDate}
- **Environment:** ${e.environment}
- **Branch:** ${e.gitBranch}
- **Build:** ${e.buildNumber}
- **Release Decision:** **${e.releaseDecision}**
- **Production Readiness:** ${e.productionReadiness.score}/100 — ${e.productionReadiness.qualityStatus}

## Executive Summary
| Metric | Value |
|--------|-------|
| Total Tests | ${e.total} |
| Passed | ${e.passed} |
| Failed | ${e.failed} |
| Skipped | ${e.skipped} |
| Pass Rate | ${e.passPercent}% |
| Duration | ${e.totalDuration} |
| Suites Executed | ${e.suitesExecuted} |
| Suites Passed | ${e.suitesPassed} |
| Suites Failed | ${e.suitesFailed} |

## Platform Summary

### Web Automation
- **Status:** ${w && w.available ? w.status : 'Not executed'}
- **Total:** ${w && w.summary ? w.summary.total : 0} | **Passed:** ${w && w.summary ? w.summary.passed : 0} | **Failed:** ${w && w.summary ? w.summary.failed : 0} | **Skipped:** ${w && w.summary ? w.summary.skipped : 0}
- **Pass Rate:** ${w && w.summary ? w.summary.passRate + '%' : 'N/A'}

### Android Automation
- **Status:** ${a && a.available ? a.status : 'Not executed'}
- **Total:** ${a && a.summary ? a.summary.total : 0} | **Passed:** ${a && a.summary ? a.summary.passed : 0} | **Failed:** ${a && a.summary ? a.summary.failed : 0}
- **Pass Rate:** ${a && a.summary ? a.summary.passRate + '%' : 'N/A'}

### iOS Automation
- **Status:** ${i && i.available ? i.status : 'Not executed'}
- **Total:** ${i && i.summary ? i.summary.total : 0} | **Passed:** ${i && i.summary ? i.summary.passed : 0} | **Failed:** ${i && i.summary ? i.summary.failed : 0}
- **Pass Rate:** ${i && i.summary ? i.summary.passRate + '%' : 'N/A'}

### API Testing
- **Status:** ${api && api.available ? api.status : 'Not executed'}
- **Total:** ${api && api.summary ? api.summary.total : 0} | **Passed:** ${api && api.summary ? api.summary.passed : 0} | **Failed:** ${api && api.summary ? api.summary.failed : 0}
- **Pass Rate:** ${api && api.summary ? api.summary.passRate + '%' : 'N/A'}
${api && api.avgResponseTime ? '- **Avg Response Time:** ' + api.avgResponseTime : ''}

### Performance / JMeter
- **Status:** ${perf && perf.available ? perf.status : 'Not executed'}
${perf && perf.jtlData ? `- **Total Requests:** ${perf.jtlData.totalRequests}
- **Avg Response:** ${perf.jtlData.avgResponseTime}ms
- **Error Rate:** ${perf.jtlData.errorRate}%
- **90th Percentile:** ${perf.jtlData.p90}ms
- **95th Percentile:** ${perf.jtlData.p95}ms` : ''}

## Self-Healing
- **Status:** ${sh && sh.available ? sh.status : 'Not available'}
- **Total Failures:** ${sh && sh.totalFailures || 0} | **Healed:** ${sh && sh.healed || 0}
- **Success Rate:** ${sh && sh.healingSuccess || 0}%

## Flaky Tests
- **Count:** ${flaky.count} | **Percentage:** ${flaky.percentage}%

## Root Cause Analysis
- **Total Failures:** ${rc.totalFailures || 0}
${(Object.entries(rc.categories || {}) as [string, any][]).filter(([_, v]) => v > 0).map(([k, v]) => `- **${k}:** ${v}`).join('\n')}

## Release Decision
**${e.releaseDecision}** — ${e.releaseReason}

## Production Readiness Score
**${e.productionReadiness.score}/100** — ${e.productionReadiness.qualityStatus}

---

*Generated by Consolidated Dashboard Generator at ${e.executionDate}*
`;
  return md;
}

// ──────────────────────────── MAIN ────────────────────────────

function main() {
  // Ensure output directories
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });

  console.log('📊 Collecting data from all available report sources...\n');

  const data = generateDashboardData();
  const e = data.executiveSummary;

  console.log(`  ✅ Web:          ${data.web && data.web.available ? data.web.summary.total + ' scenarios' : 'Not executed'}`);
  console.log(`  ✅ Android:      ${data.android && data.android.available ? data.android.summary.total + ' scenarios' : (data.android && data.android.execInfo ? data.android.execInfo.status + ' (report missing)' : 'Not executed')}`);
  console.log(`  ✅ iOS:          ${data.ios && data.ios.available ? data.ios.summary.total + ' scenarios' : (data.ios && data.ios.execInfo ? data.ios.execInfo.status + ' (report missing)' : 'Not executed')}`);
  console.log(`  ✅ API:          ${data.api && data.api.available ? data.api.summary.total + ' APIs' : 'Not executed'}`);
  console.log(`  ✅ Performance:  ${data.performance && data.performance.available ? (data.performance.jtlData ? data.performance.jtlData.totalRequests + ' requests' : 'Data found') : 'Not executed'}`);
  console.log(`  ✅ AI Analysis:  ${data.ai && data.ai.available ? 'Available' : 'Not available'}`);
  console.log(`  ✅ Self-Healing: ${data.selfHealing && data.selfHealing.available ? data.selfHealing.totalFailures + ' entries' : 'Not available'}`);
  console.log();

  // Write dashboard-data.json
  const jsonPath = path.join(OUT, 'dashboard-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  📊 Dashboard data → ${path.relative(ROOT, jsonPath)}`);

  // Write consolidated-summary.md
  const md = generateSummaryMarkdown(data);
  const mdPath = path.join(OUT, 'consolidated-summary.md');
  fs.writeFileSync(mdPath, md, 'utf-8');
  console.log(`  📝 Summary        → ${path.relative(ROOT, mdPath)}`);

  // Write index.html
  const html = generateHTML(data);
  const htmlPath = path.join(OUT, 'index.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`  🏠 Dashboard      → ${path.relative(ROOT, htmlPath)}`);

  console.log('\n══════════════════════════════════════════════');
  console.log('  🚀 CONSOLIDATED DASHBOARD GENERATED');
  console.log('══════════════════════════════════════════════');
  console.log(`  Release:      ${e.releaseDecision}`);
  console.log(`  Pass Rate:    ${e.passPercent}%`);
  console.log(`  Readiness:    ${e.productionReadiness.score}/100 (${e.productionReadiness.qualityStatus})`);
  console.log(`  Failures:     ${e.failed}`);
  console.log(`  Suites:       ${e.suitesExecuted} executed, ${e.suitesPassed} passed, ${e.suitesFailed} failed`);
  console.log('══════════════════════════════════════════════\n');

  return {
    htmlPath: path.relative(ROOT, htmlPath),
    dataPath: path.relative(ROOT, jsonPath),
    summaryPath: path.relative(ROOT, mdPath),
  };
}

// Run if called directly
if (require.main === module) {
  try {
    const result = main();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Dashboard generation failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

export { generateDashboardData, generateHTML, generateSummaryMarkdown, main };
export default { generateDashboardData, generateHTML, generateSummaryMarkdown, main };
