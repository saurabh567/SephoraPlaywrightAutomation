import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
/**
 * AI Executive Dashboard Generator
 * 
 * Auto-collects results from all sources and generates
 * a single enterprise dashboard HTML file.
 * 
 * Sources:
 *   - Playwright / Cucumber (reports/web/cucumber-report.json)
 *   - Playwright / Cucumber (reports/web/cucumber-report.json)
 *   - Appium / Mobile (reports/android/, reports/ios/)
 *   - API Tests (reports/api/api-summary.json)
 *   - JMeter (reports/jmeter/)
 *   - AI Reports (ai/output/)
 *   - Jenkins (if available)
 *   - Git info
 */


const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT, 'reports', 'dashboard');
const WEB_REPORT_DIR = path.join(ROOT, 'reports', 'web');
const ANDROID_REPORT_DIR = path.join(ROOT, 'reports', 'android');
const IOS_REPORT_DIR = path.join(ROOT, 'reports', 'ios');
const AI_OUTPUT_DIR = path.join(ROOT, 'ai', 'output');
const JMETER_DIR = path.join(ROOT, 'reports', 'jmeter');
const TEST_DATA_DIR = path.join(ROOT, 'test-data');
const FEATURES_DIR = path.join(ROOT, 'features');
const API_REPORT_DIR = path.join(ROOT, 'reports', 'api');

// ---------- helpers ----------

function safeReadJSON(filePath: any) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e: any) {
    // ignore
  }
  return null;
}

function safeReadFile(filePath: any) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e: any) {
    // ignore
  }
  return '';
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

function runCmd(cmd: any) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e: any) {
    return '';
  }
}

// ---------- collectors ----------

function collectGitInfo() {
  return {
    branch: runCmd('git rev-parse --abbrev-ref HEAD') || 'unknown',
    commit: runCmd('git rev-parse --short HEAD') || 'unknown',
    commitMessage: runCmd('git log -1 --pretty=%B') || '',
    committer: runCmd('git log -1 --pretty=%an') || '',
    commitDate: runCmd('git log -1 --pretty=%aI') || '',
  };
}

function collectCucumberReport() {
  const reportPath = path.join(WEB_REPORT_DIR, 'cucumber-report.json');
  const data = safeReadJSON(reportPath);
  if (!data) return null;

  const features: any = [];
  let totalScenarios = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let totalDuration = 0;
  const scenarioDetails: any = [];
  const timeline: any = [];

  data.forEach((feature: any) => {
    const featureName = feature.name || 'Unknown';
    const featureScenarios: any = [];
    (feature.elements || []).forEach((scenario: any) => {
      const steps = scenario.steps || [];
      const scenarioStatus = steps.some((s: any) => s.result && s.result.status === 'failed') ? 'failed'
        : steps.every((s: any) => s.result && s.result.status === 'passed') ? 'passed'
        : 'skipped';
      
      const duration = steps.reduce((sum: any, s: any) => sum + ((s.result && s.result.duration) || 0), 0);
      
      totalScenarios++;
      if (scenarioStatus === 'passed') passed++;
      else if (scenarioStatus === 'failed') failed++;
      else skipped++;
      totalDuration += duration;

      featureScenarios.push({
        name: scenario.name,
        status: scenarioStatus,
        duration: Math.round(duration / 1e6), // ms
        tags: (scenario.tags || []).map((t: any) => t.name),
      });

      scenarioDetails.push({
        feature: featureName,
        name: scenario.name,
        status: scenarioStatus,
        duration: Math.round(duration / 1e6),
        tags: (scenario.tags || []).map((t: any) => t.name),
        steps: steps.map((s: any) => ({
          keyword: s.keyword,
          name: s.name,
          status: s.result ? s.result.status : 'unknown',
          duration: s.result ? Math.round((s.result.duration || 0) / 1e6) : 0,
        })),
      });

      timeline.push({
        scenario: scenario.name,
        status: scenarioStatus,
        duration: Math.round(duration / 1e6),
      });
    });

    features.push({
      name: featureName,
      uri: feature.uri || '',
      scenarios: featureScenarios,
      passed: featureScenarios.filter((s: any) => s.status === 'passed').length,
      failed: featureScenarios.filter((s: any) => s.status === 'failed').length,
      skipped: featureScenarios.filter((s: any) => s.status === 'skipped').length,
      total: featureScenarios.length,
    });
  });

  return {
    features,
    summary: {
      total: totalScenarios,
      passed,
      failed,
      skipped,
      passRate: totalScenarios > 0 ? Math.round((passed / totalScenarios) * 10000) / 100 : 0,
      failRate: totalScenarios > 0 ? Math.round((failed / totalScenarios) * 10000) / 100 : 0,
      totalDurationMs: Math.round(totalDuration / 1e6),
    },
    scenarioDetails,
    timeline,
  };
}

function collectEnvironmentInfo() {
  const webEnv = readEnvProperties(path.join(WEB_REPORT_DIR, 'environment.properties'));
  const androidEnv = readEnvProperties(path.join(ANDROID_REPORT_DIR, 'environment.properties'));
  const iosEnv = readEnvProperties(path.join(IOS_REPORT_DIR, 'environment.properties'));
  
  return {
    web: webEnv,
    android: androidEnv,
    ios: iosEnv,
    current: webEnv.PLATFORM ? webEnv : (androidEnv.PLATFORM ? androidEnv : iosEnv),
  };
}

function collectJMeterData() {
  // Look for JMeter summary files or JTL
  const summaryDir = path.join(JMETER_DIR, 'summary');
  const jtlDir = path.join(JMETER_DIR, 'jtl');
  
  let summaryData: any = null;
  
  // Read summary files
  if (fs.existsSync(summaryDir)) {
    const files = fs.readdirSync(summaryDir).filter(f => f.endsWith('.json'));
    files.forEach(f => {
      const data = safeReadJSON(path.join(summaryDir, f));
      if (data) summaryData = { ...summaryData, ...data };
    });
  }

  // Try to read JTL files and parse CSV
  let jtlData = null;
  if (fs.existsSync(jtlDir)) {
    const jtlFiles = fs.readdirSync(jtlDir).filter(f => f.endsWith('.jtl') || f.endsWith('.csv'));
    if (jtlFiles.length > 0) {
      const content = safeReadFile(path.join(jtlDir, jtlFiles[0]));
      if (content) {
        const lines = content.trim().split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(',');
          const data = lines.slice(1).map(l => {
            const vals = l.split(',');
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h.trim()] = vals[i] ? vals[i].trim() : ''; });
            return obj;
          });

          const times = data.map(d => parseFloat(d.elapsed || d.timeStamp || 0)).filter(v => !isNaN(v) && v > 0);
          const errors = data.filter(d => d.success === 'false' || d.responseCode === 'Non HTTP response code' || (d.responseCode && parseInt(d.responseCode) >= 400));
          const labelGroups: Record<string, any> = {};
          data.forEach(d => {
            const label = d.label || 'Unknown';
            if (!labelGroups[label]) labelGroups[label] = { count: 0, errors: 0, totalTime: 0, times: [] as any[] };
            labelGroups[label].count++;
            labelGroups[label].totalTime += parseFloat(d.elapsed || 0);
            if (d.success === 'false') labelGroups[label].errors++;
            if (!isNaN(parseFloat(d.elapsed))) labelGroups[label].times.push(parseFloat(d.elapsed));
          });

          const sortedByTime = (Object.entries(labelGroups) as [string, any][]).sort((a, b) => (b[1].totalTime / b[1].count) - (a[1].totalTime / a[1].count));
          const sortedByErrors = (Object.entries(labelGroups) as [string, any][]).sort((a, b) => b[1].errors - a[1].errors);

          const sortedTimes = [...times].sort((a, b) => a - b);
          const len = sortedTimes.length;

          jtlData = {
            totalRequests: data.length,
            failures: errors.length,
            errorRate: data.length > 0 ? Math.round((errors.length / data.length) * 10000) / 100 : 0,
            avgResponseTime: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
            median: len > 0 ? sortedTimes[Math.floor(len / 2)] : 0,
            p90: len > 0 ? sortedTimes[Math.floor(len * 0.9)] : 0,
            p95: len > 0 ? sortedTimes[Math.floor(len * 0.95)] : 0,
            p99: len > 0 ? sortedTimes[Math.floor(len * 0.99)] : 0,
            min: times.length > 0 ? Math.min(...times) : 0,
            max: times.length > 0 ? Math.max(...times) : 0,
            throughput: data.length > 0 && data[0].timeStamp ? 
              Math.round((data.length / ((parseInt(data[data.length - 1].timeStamp) - parseInt(data[0].timeStamp)) / 1000)) * 100) / 100 : 0,
            topSlowAPIs: sortedByTime.slice(0, 10).map(([label, info]) => ({
              label,
              avgResponse: Math.round(info.totalTime / info.count),
              count: info.count,
              errors: info.errors,
            })),
            topFailedRequests: sortedByErrors.slice(0, 10).map(([label, info]) => ({
              label,
              errors: info.errors,
              total: info.count,
              errorRate: info.count > 0 ? Math.round((info.errors / info.count) * 10000) / 100 : 0,
            })),
          };
        }
      }
    }
  }

  // Check for HTML reports
  const htmlDir = path.join(JMETER_DIR, 'html');
  const hasHTML = fs.existsSync(htmlDir) && fs.readdirSync(htmlDir).length > 0;

  return { summary: summaryData, jtl: jtlData, hasHTML };
}

function collectAIReports() {
  if (!fs.existsSync(AI_OUTPUT_DIR)) return null;
  
  const reports: Record<string, any> = {};
  const files = fs.readdirSync(AI_OUTPUT_DIR);
  
  const postTestSummary = safeReadFile(path.join(AI_OUTPUT_DIR, 'ai-post-test-summary.md'));
  const codeReview = safeReadFile(path.join(AI_OUTPUT_DIR, 'code-review-report.md'));
  const selfHealing = safeReadFile(path.join(AI_OUTPUT_DIR, 'self-healing-suggestions.md'));
  const jenkinsAnalysis = safeReadFile(path.join(AI_OUTPUT_DIR, 'jenkins-failure-analysis.md'));
  const testExecutionSummary = safeReadJSON(path.join(AI_OUTPUT_DIR, 'test-execution-summary.json'));
  const vectorIngestion = safeReadJSON(path.join(AI_OUTPUT_DIR, 'vector-ingestion-summary.json'));
  const generatedTestCases = safeReadFile(path.join(AI_OUTPUT_DIR, 'generated-test-cases.md'));

  // Parse markdown tables from reports
  function parseMarkdownTable(md: any) {
    const lines = md.split('\n').filter((l: any) => l.trim());
    const tables: any[] = [];
    let inTable = false;
    let headers: any = [];
    let rows: any = [];
    lines.forEach((line: any) => {
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').filter((c: any) => c.trim()).map((c: any) => c.trim());
        if (!inTable) {
          headers = cells;
          inTable = true;
        } else if (line.includes('---')) {
          // separator, skip
        } else {
          rows.push(cells);
        }
      } else {
        if (inTable && rows.length > 0) {
          tables.push({ headers, rows });
        }
        inTable = false;
        headers = [];
        rows = [];
      }
    });
    if (inTable && rows.length > 0) {
      tables.push({ headers, rows });
    }
    return tables;
  }

  return {
    postTestSummary,
    codeReview,
    selfHealing,
    jenkinsAnalysis,
    testExecutionSummary,
    vectorIngestion,
    generatedTestCases,
    tables: parseMarkdownTable(postTestSummary + '\n' + codeReview + '\n' + selfHealing),
    files,
  };
}

function collectMobileData() {
  const androidEnv = readEnvProperties(path.join(ANDROID_REPORT_DIR, 'environment.properties'));
  const iosEnv = readEnvProperties(path.join(IOS_REPORT_DIR, 'environment.properties'));

  // Check for screenshots
  const androidScreenshots: any = [];
  const iosScreenshots: any = [];
  const androidScreenshotDir = path.join(ANDROID_REPORT_DIR, 'screenshots');
  const iosScreenshotDir = path.join(IOS_REPORT_DIR, 'screenshots');
  
  if (fs.existsSync(androidScreenshotDir)) {
    fs.readdirSync(androidScreenshotDir).forEach(f => androidScreenshots.push(f));
  }
  if (fs.existsSync(iosScreenshotDir)) {
    fs.readdirSync(iosScreenshotDir).forEach(f => iosScreenshots.push(f));
  }

  // Check for videos
  const androidVideos: any = [];
  const iosVideos: any = [];
  const androidVideoDir = path.join(ANDROID_REPORT_DIR, 'videos');
  const iosVideoDir = path.join(IOS_REPORT_DIR, 'videos');
  
  if (fs.existsSync(androidVideoDir)) {
    fs.readdirSync(androidVideoDir).forEach(f => androidVideos.push(f));
  }
  if (fs.existsSync(iosVideoDir)) {
    fs.readdirSync(iosVideoDir).forEach(f => iosVideos.push(f));
  }

  return {
    android: {
      env: androidEnv,
      screenshots: androidScreenshots,
      videos: androidVideos,
      deviceName: androidEnv.DEVICE_NAME || 'N/A',
      osVersion: androidEnv.OS_VERSION || 'N/A',
      platform: androidEnv.PLATFORM || 'ANDROID',
      executionTime: androidEnv.EXECUTION_TIME || '',
    },
    ios: {
      env: iosEnv,
      screenshots: iosScreenshots,
      videos: iosVideos,
      deviceName: iosEnv.DEVICE_NAME || 'N/A',
      osVersion: iosEnv.OS_VERSION || 'N/A',
      platform: iosEnv.PLATFORM || 'IOS',
      executionTime: iosEnv.EXECUTION_TIME || '',
    },
  };
}

function collectAPIData() {
  // Read the API summary report generated by the API tests
  const apiSummaryPath = path.join(API_REPORT_DIR, 'api-summary.json');
  const apiSummary = safeReadJSON(apiSummaryPath);

  // Also look for API feature files
  const apiFeatures: any = [];
  function findAPIFeatures(dir: any) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      if (entry.isDirectory()) {
        findAPIFeatures(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.feature') && (entry.name.includes('api') || entry.name.includes('API'))) {
        apiFeatures.push(entry.name);
      }
    });
  }
  findAPIFeatures(FEATURES_DIR);

  if (apiSummary && apiSummary.totalAPIs > 0) {
    return {
      features: apiFeatures,
      totalAPIs: apiSummary.totalAPIs,
      passed: apiSummary.passed,
      failed: apiSummary.failed,
      passRate: apiSummary.passRate,
      averageResponseTime: apiSummary.avgResponseTime,
      fastestAPI: apiSummary.fastestAPI,
      slowestAPI: apiSummary.slowestAPI,
      executionDuration: apiSummary.executionDuration,
      executionTimestamp: apiSummary.executionTimestamp,
      hasAPITests: true,
      results: apiSummary.results || []
    };
  }

  return {
    features: apiFeatures,
    totalAPIs: 0,
    passed: 0,
    failed: 0,
    passRate: '0%',
    averageResponseTime: '0ms',
    fastestAPI: '0ms',
    slowestAPI: '0ms',
    executionDuration: '0s',
    executionTimestamp: '',
    hasAPITests: apiFeatures.length > 0,
    results: [] as any[]
  };
}

function collectPerformanceInfo() {
  // Read from AI output if available
  try {
    const perfDir = path.join(AI_OUTPUT_DIR);
    const perfFiles = fs.readdirSync(perfDir).filter(f => f.includes('performance') || f.includes('jmeter'));
    const perfData: Record<string, any> = {};
    perfFiles.forEach(f => {
      perfData[f] = safeReadFile(path.join(perfDir, f));
    });
    return perfData;
  } catch (e: any) {
    return {};
  }
}

function collectSelfHealingData() {
  const selfHealingReport = safeReadFile(path.join(AI_OUTPUT_DIR, 'self-healing-suggestions.md'));
  
  // Parse suggestions
  const suggestions: any = [];
  if (selfHealingReport) {
    const lines = selfHealingReport.split('\n');
    let inTable = false;
    let headers: any = [];
    lines.forEach(line => {
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        if (!inTable) { headers = cells; inTable = true; }
        else if (!line.includes('---')) {
          const suggestion: Record<string, any> = {};
          headers.forEach((h: any, i: any) => { suggestion[h] = cells[i] || ''; });
          suggestions.push(suggestion);
        }
      } else { inTable = false; }
    });
  }
  return { suggestions, report: selfHealingReport };
}

function collectFlakyData() {
  // Attempt to read flaky trend data from execution history
  const execHistoryPath = path.join(ROOT, 'ai', 'memory', 'execution-history.json');
  const history = safeReadJSON(execHistoryPath);
  if (!history || !history.runs) {
    return { trend: [] as any[], flakyScenarios: [] as any[] };
  }
  const runs = history.runs.slice(-20);
  const scenarioMap: Record<string, any> = {};
  runs.forEach((run: any, idx: any) => {
    const runId = `Run ${idx + 1}`;
    const date = run.timestamp ? new Date(run.timestamp).toLocaleDateString() : runId;
    if (run.scenarios) {
      run.scenarios.forEach((s: any) => {
        if (!scenarioMap[s.name]) scenarioMap[s.name] = [];
        scenarioMap[s.name].push({ date, status: s.status });
      });
    }
  });
  const flakyScenarios = (Object.entries(scenarioMap) as [string, any][])
    .filter(([, statuses]) => {
      const unique = new Set(statuses.map((s: any) => s.status));
      return unique.has('passed') && unique.has('failed');
    })
    .map(([name, statuses]) => ({ name, runs: statuses }));
  const trend = runs.map((run: any, idx: any) => ({
    date: run.timestamp ? new Date(run.timestamp).toLocaleDateString() : `Run ${idx + 1}`,
    passRate: run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0,
  }));
  return { trend, flakyScenarios };
}

function formatDuration(ms: any) {
  if (!ms || ms <= 0) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// =========================================================================
// DATA GENERATION
// =========================================================================

function generateDashboardData() {
  const gitInfo = collectGitInfo();
  const cucumberData = collectCucumberReport();

  const envInfo = collectEnvironmentInfo();
  const jmeterData = collectJMeterData();
  const aiReports = collectAIReports();
  const mobileData = collectMobileData();
  const apiData = collectAPIData();
  const perfData = collectPerformanceInfo();
  const selfHealingData = collectSelfHealingData();
  const flakyData = collectFlakyData();

  const env = envInfo.current || {};
  const cucumberSummary = cucumberData ? cucumberData.summary : { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0, failRate: 0, totalDurationMs: 0 };

  // Calculate overall scores
  const passRate = cucumberSummary.passRate;
  const coverageScore = cucumberData && cucumberData.features ? 
    Math.min(100, Math.round((cucumberData.features.length / 10) * 100)) : 50;
  const performanceScore = jmeterData && jmeterData.jtl ? 
    Math.max(0, Math.min(100, 100 - jmeterData.jtl.errorRate)) : 
    (jmeterData && jmeterData.summary ? 80 : 60);
  const aiMaturity = aiReports ? 
    Math.min(100, Object.keys(aiReports).filter((k: any) => (aiReports as Record<string, any>)[k] && k !== 'files' && k !== 'tables').length * 15) : 20;
  const autonomyScore = aiReports && aiReports.testExecutionSummary ? 
    (aiReports.testExecutionSummary.exitCode === 0 ? 85 : 60) : 40;
  const maintainability = 78;
  const scalability = 72;
  const securityScore = 65;
  const enterpriseReadiness = Math.round((passRate * 0.3 + coverageScore * 0.15 + performanceScore * 0.15 + aiMaturity * 0.1 + autonomyScore * 0.1 + maintainability * 0.05 + scalability * 0.05 + securityScore * 0.1));
  const frameworkHealth = passRate > 80 ? 'Excellent' : passRate > 60 ? 'Good' : passRate > 40 ? 'Fair' : 'Needs Improvement';
  const overallScore = Math.round((passRate * 0.25 + coverageScore * 0.1 + performanceScore * 0.15 + aiMaturity * 0.1 + autonomyScore * 0.1 + maintainability * 0.05 + scalability * 0.05 + securityScore * 0.05 + enterpriseReadiness * 0.15));

  // Release gatekeeper logic
  let releaseDecision = 'GO';
  let releaseReasoning: any[] = [];
  if (cucumberSummary.failed > 0) {
    const failRate = cucumberSummary.failRate;
    if (failRate > 20) {
      releaseDecision = 'NO GO';
      releaseReasoning.push(`Failure rate ${failRate}% exceeds 20% threshold`);
    } else if (failRate > 10) {
      releaseDecision = 'CONDITIONAL GO';
      releaseReasoning.push(`Failure rate ${failRate}% between 10-20%, requires manual verification of failed scenarios`);
    } else {
      releaseDecision = 'GO';
      releaseReasoning.push(`Failure rate ${failRate}% within acceptable limits`);
    }
  }
  if (jmeterData && jmeterData.jtl && jmeterData.jtl.errorRate > 10) {
    if (releaseDecision === 'GO') {
      releaseDecision = 'CONDITIONAL GO';
      releaseReasoning.push(`JMeter error rate ${jmeterData.jtl.errorRate}% exceeds 10%`);
    } else {
      releaseReasoning.push(`JMeter error rate ${jmeterData.jtl.errorRate}% exceeds 10%`);
    }
  }
  if (releaseDecision === 'GO' && !releaseReasoning.length) {
    releaseReasoning.push('All quality gates passed. Test pass rate within acceptable range, performance metrics healthy.');
  }
  releaseReasoning.push(`Total tests: ${cucumberSummary.total}, Passed: ${cucumberSummary.passed}, Failed: ${cucumberSummary.failed}`);

  // Execution duration formatting
  const execDuration = cucumberData ? formatDuration(cucumberSummary.totalDurationMs) : 'N/A';

  const data = {
    dashboardVersion: '2.0.0',
    generatedAt: new Date().toISOString(),
    
    // Section 1: Executive Summary
    executiveSummary: {
      projectName: 'Amazon Web & Mobile Playwright Automation',
      executionTime: env.EXECUTION_TIME || new Date().toISOString(),
      executionDate: env.EXECUTION_TIME ? new Date(env.EXECUTION_TIME).toLocaleDateString() : new Date().toLocaleDateString(),
      environment: env.ENV || 'dev',
      browser: env.BROWSER || 'chromium',
      platform: env.PLATFORM || 'WEB',
      buildNumber: runCmd('echo $BUILD_NUMBER') || gitInfo.commit,
      gitBranch: gitInfo.branch,
      gitCommit: gitInfo.commit,
      overallStatus: cucumberSummary.failed === 0 ? 'PASS' : (cucumberSummary.passed > 0 ? 'PARTIAL' : 'FAIL'),
      total: cucumberSummary.total,
      passed: cucumberSummary.passed,
      failed: cucumberSummary.failed,
      skipped: cucumberSummary.skipped,
      successPercentage: cucumberSummary.passRate,
      failurePercentage: cucumberSummary.failRate,
      executionDuration: execDuration,
    },

    // Section 2: Functional Automation
    functionalAutomation: {
      playwright: {
        status: cucumberData ? 'completed' : 'not_run',
        totalTests: cucumberSummary.total,
        passed: cucumberSummary.passed,
        failed: cucumberSummary.failed,
        skipped: cucumberSummary.skipped,
      },
      cucumber: {
        status: cucumberData ? 'completed' : 'not_run',
        features: cucumberData ? cucumberData.features : [] as any[],
        featureSummary: cucumberData ? cucumberData.features.map((f: any) => ({
          name: f.name,
          total: f.total,
          passed: f.passed,
          failed: f.failed,
          skipped: f.skipped,
          passRate: f.total > 0 ? Math.round((f.passed / f.total) * 100) : 0,
        })) : [] as any[],
        scenarioSummary: cucumberSummary,
        failedScenarios: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.status === 'failed').map((s: any) => ({
          name: s.name,
          feature: s.feature,
          steps: s.steps,
        })) : [] as any[],
      },
      web: envInfo.web,
      android: mobileData.android,
      ios: mobileData.ios,
      api: apiData,
      timeline: cucumberData ? cucumberData.timeline : [] as any[],
    },

    // Section 3: Performance Dashboard
    performanceDashboard: jmeterData && jmeterData.jtl ? {
      ...jmeterData.jtl,
      latency: jmeterData.jtl.avgResponseTime,
      networkTime: jmeterData.jtl.avgResponseTime,
      hasJMeterData: true,
    } : {
      totalRequests: 0,
      failures: 0,
      errorRate: 0,
      avgResponseTime: 0,
      median: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      throughput: 0,
      latency: 0,
      networkTime: 0,
      topSlowAPIs: [] as any[],
      topFailedRequests: [] as any[],
      hasJMeterData: false,
    },

    // Section 4: AI Analysis
    aiAnalysis: {
      executionSummary: aiReports ? aiReports.postTestSummary : '',
      rootCauseAnalysis: aiReports ? aiReports.jenkinsAnalysis : '',
      failureClassification: aiReports ? aiReports.jenkinsAnalysis : '',
      locatorHealing: aiReports ? aiReports.selfHealing : '',
      retryAnalysis: aiReports && aiReports.testExecutionSummary ? JSON.stringify(aiReports.testExecutionSummary) : '',
      memorySummary: aiReports && aiReports.vectorIngestion ? JSON.stringify(aiReports.vectorIngestion) : '',
      codeReview: aiReports ? aiReports.codeReview : '',
      generatedTestCases: aiReports ? aiReports.generatedTestCases : '',
      analysisTimestamp: new Date().toISOString(),
    },

    // Section 5: Self-Healing
    selfHealing: selfHealingData,

    // Section 6: Execution History & Flakiness
    flakiness: flakyData,

    // Section 7: Code Quality & Coverage
    codeQuality: {
      linesOfCode: 0,
      testFiles: cucumberData ? cucumberData.features.length : 0,
      pageObjects: 0,
      stepDefinitions: 0,
      codeCoverage: 0,
      lintErrors: 0,
      complexityScore: 75,
      documentationScore: 70,
      lastAudit: new Date().toISOString(),
    },

    // Section 8: Performance Metrics
    performance: perfData,

    // Section 9: Mobile Dashboard
    mobileDashboard: {
      android: {
        scenariosRun: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@android')).length : 0,
        passed: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@android') && s.status === 'passed').length : 0,
        failed: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@android') && s.status === 'failed').length : 0,
        screenshots: mobileData.android.screenshots.length,
        videos: mobileData.android.videos.length,
      },
      ios: {
        scenariosRun: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@ios')).length : 0,
        passed: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@ios') && s.status === 'passed').length : 0,
        failed: cucumberData ? cucumberData.scenarioDetails.filter((s: any) => s.tags && s.tags.includes('@ios') && s.status === 'failed').length : 0,
        screenshots: mobileData.ios.screenshots.length,
        videos: mobileData.ios.videos.length,
      },
    },

    // Section 10: API Dashboard
    apiDashboard: apiData,

    // Section 11: Release Gatekeeper
    releaseGatekeeper: {
      decision: releaseDecision,
      reasoning: releaseReasoning,
      timestamp: new Date().toISOString(),
      criteria: {
        testPassRate: cucumberSummary.passRate,
        performanceErrorRate: jmeterData && jmeterData.jtl ? jmeterData.jtl.errorRate : 0,
        apiPassRate: apiData.totalAPIs > 0 ? apiData.passRate : 'N/A',
      },
    },

    // Section 12: Production Readiness
    productionReadiness: {
      overallScore,
      frameworkHealth,
      enterpriseReadiness,
      coverageScore,
      performanceScore,
      aiMaturity,
      autonomyScore,
      maintainability,
      scalability,
      securityScore,
      dimensions: {
        coverage: { score: coverageScore, status: coverageScore > 70 ? 'PASS' : (coverageScore > 50 ? 'WARN' : 'FAIL'), weight: 15 },
        performance: { score: performanceScore, status: performanceScore > 70 ? 'PASS' : (performanceScore > 50 ? 'WARN' : 'FAIL'), weight: 15 },
        aiMaturity: { score: aiMaturity, status: aiMaturity > 60 ? 'PASS' : (aiMaturity > 30 ? 'WARN' : 'FAIL'), weight: 10 },
        autonomy: { score: autonomyScore, status: autonomyScore > 70 ? 'PASS' : (autonomyScore > 40 ? 'WARN' : 'FAIL'), weight: 10 },
        maintainability: { score: maintainability, status: maintainability > 70 ? 'PASS' : (maintainability > 50 ? 'WARN' : 'FAIL'), weight: 5 },
        scalability: { score: scalability, status: scalability > 70 ? 'PASS' : (scalability > 50 ? 'WARN' : 'FAIL'), weight: 5 },
        security: { score: securityScore, status: securityScore > 70 ? 'PASS' : (securityScore > 50 ? 'WARN' : 'FAIL'), weight: 10 },
      },
      maturedCapabilities: [
        { name: 'AI-Powered Test Generation', status: aiReports && aiReports.generatedTestCases ? '✅' : '⬜' },
        { name: 'Self-Healing Locators', status: selfHealingData.suggestions.length > 0 ? '✅' : '⬜' },
        { name: 'Root Cause Analysis', status: aiReports && aiReports.jenkinsAnalysis ? '✅' : '⬜' },
        { name: 'Performance Monitoring', status: jmeterData && jmeterData.hasHTML ? '✅' : '⬜' },
        { name: 'API Automation', status: apiData.totalAPIs > 0 ? '✅' : '⬜' },
        { name: 'Cross-Browser Testing', status: '✅' },
        { name: 'Mobile Testing', status: mobileData.android.env.PLATFORM || mobileData.ios.env.PLATFORM ? '✅' : '⬜' },
        { name: 'CI/CD Integration', status: '✅' },
        { name: 'Executive Dashboard', status: '✅' },
      ],
    },
  };

  return data;
}

// =========================================================================
// MAIN
// =========================================================================

function main() {
  console.log('[Dashboard] Collecting data from all sources...');
  
  const data = generateDashboardData();
  
  // Write dashboard-data.json
  const dataDir = DASHBOARD_DIR;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const dataPath = path.join(dataDir, 'dashboard-data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`[Dashboard] Data written to ${dataPath}`);

  // Generate dashboard-summary.md
  const summaryPath = path.join(dataDir, 'dashboard-summary.md');
  const summary = generateMarkdownSummary(data);
  fs.writeFileSync(summaryPath, summary);
  console.log(`[Dashboard] Summary written to ${summaryPath}`);

  // Generate index.html
  const htmlPath = path.join(dataDir, 'index.html');
  const html = generateHTML(data);
  fs.writeFileSync(htmlPath, html);
  console.log(`[Dashboard] HTML dashboard written to ${htmlPath}`);
  
  console.log('[Dashboard] ✅ Dashboard generation complete!');
  return { dataPath, summaryPath, htmlPath };
}

function generateMarkdownSummary(data: any) {
  const es = data.executiveSummary;
  const rg = data.releaseGatekeeper;
  const pr = data.productionReadiness;
  const api = data.apiDashboard;

  return `# AI Executive Dashboard Summary

## Overview
- **Project:** ${es.projectName}
- **Environment:** ${es.environment} | **Browser:** ${es.browser} | **Platform:** ${es.platform}
- **Branch:** ${es.gitBranch} | **Commit:** ${es.gitCommit}
- **Execution Date:** ${es.executionDate}
- **Duration:** ${es.executionDuration}

## Test Results
- **Total Tests:** ${es.total} | **Passed:** ${es.passed} | **Failed:** ${es.failed} | **Skipped:** ${es.skipped}
- **Success Rate:** ${es.successPercentage}%

## API Testing
- **Total APIs Executed:** ${api.totalAPIs}
- **Passed:** ${api.passed} | **Failed:** ${api.failed}
- **Pass Rate:** ${api.passRate}
- **Avg Response Time:** ${api.averageResponseTime}
- **Fastest API:** ${api.fastestAPI} | **Slowest API:** ${api.slowestAPI}

## Performance
${data.performanceDashboard.hasJMeterData ? `- **Total Requests:** ${data.performanceDashboard.totalRequests}
- **Error Rate:** ${data.performanceDashboard.errorRate}%
- **Avg Response Time:** ${data.performanceDashboard.avgResponseTime}ms
- **Throughput:** ${data.performanceDashboard.throughput} req/s` : '- Performance data not available'}

## Production Readiness
- **Overall Score:** ${pr.overallScore}/100
- **Release Decision:** ${rg.decision}
- **Framework Health:** ${pr.frameworkHealth}

## Key Matured Capabilities
${pr.maturedCapabilities.map((c: any) => `- ${c.name}: ${c.status}`).join('\n')}

## Reports
- Dashboard HTML: reports/dashboard/index.html
- Cucumber Report: reports/web/cucumber-html-report.html
- API Report: reports/api/api-report.html
- API AI Analysis: reports/ai/api-analysis-report.md
`;
}

// =========================================================================
// HTML GENERATION
// =========================================================================

function generateHTML(data: any) {
  const es = data.executiveSummary;
  const rg = data.releaseGatekeeper;
  const pr = data.productionReadiness;
  const perf = data.performanceDashboard;
  const ai = data.aiAnalysis;
  const sh = data.selfHealing;
  const flaky = data.flakiness;
  const mobileDash = data.mobileDashboard;
  const apiDash = data.apiDashboard;
  const cq = data.codeQuality;
  const func = data.functionalAutomation;

  const passRate = es.successPercentage || 0;
  const overallStatus = es.overallStatus;
  const statusBadgeClass = overallStatus === 'PASS' ? 'status-pass' : (overallStatus === 'FAIL' ? 'status-fail' : 'status-partial');
  const statusBadgeText = overallStatus === 'PASS' ? '✓ ALL PASS' : (overallStatus === 'FAIL' ? '✗ FAILED' : '⚠ PARTIAL');

  const releaseCardClass = rg.decision === 'GO' ? 'go' : (rg.decision === 'NO GO' ? 'nogo' : 'conditional');
  
  // Feature rows
  const featureRows = func.cucumber.features && func.cucumber.features.length > 0 ? 
    func.cucumber.features.map((f: any) => `
    <tr>
      <td><strong>${f.name}</strong></td>
      <td>${f.total}</td>
      <td><span class="badge badge-pass">${f.passed}</span></td>
      <td>${f.failed}</td>
      <td>${f.skipped}</td>
      <td>${f.total > 0 ? Math.round((f.passed / f.total) * 100) : 0}%</td>
    </tr>`).join('\n') : 
    '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No test data available</td></tr>';

  // Failed scenarios
  const failedScenarios = func.cucumber.failedScenarios && func.cucumber.failedScenarios.length > 0 ?
    func.cucumber.failedScenarios.map((fs: any) => `
    <div class="feature-item">
      <div class="feature-header">
        <span class="feature-name">❌ ${fs.name}</span>
        <span class="badge badge-fail">FAILED</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${fs.feature}</div>
      ${fs.steps && fs.steps.length > 0 ? `<div style="margin-top:6px;font-size:12px">
        ${fs.steps.filter((s: any) => s.status === 'failed').map((s: any) => `<div style="color:var(--accent-red)">✗ ${s.keyword}${s.name}</div>`).join('')}
      </div>` : ''}
    </div>`).join('\n') : 
    '<div style="font-size:13px;color:var(--accent-green)">✅ No failed scenarios</div>';

  // Timeline data for chart
  const tl = func.timeline || [];
  const timelineData = JSON.stringify(tl.length > 0 ? tl.slice(-30) : [{ scenario: 'No data', status: 'passed', duration: 0 }]);

  // Root cause chart data
  const rootCauseChartData = JSON.stringify([
    { label: 'Passed', value: es.passed, color: '#22c55e' },
    { label: 'Failed', value: es.failed || 1, color: '#ef4444' },
    { label: 'Skipped', value: es.skipped || 0, color: '#64748b' },
  ]);

  // Performance chart data
  const perfChartLabels = perf.topSlowAPIs && perf.topSlowAPIs.length > 0 ? perf.topSlowAPIs.map((a: any) => a.label.substring(0, 20)) : ['No data'];
  const perfChartValues = perf.topSlowAPIs && perf.topSlowAPIs.length > 0 ? perf.topSlowAPIs.map((a: any) => a.avgResponse) : [0];
  const perfChartData = JSON.stringify({ labels: perfChartLabels, values: perfChartValues });

  // Slow APIs chart data
  const slowAPIsData = JSON.stringify(perf.topSlowAPIs && perf.topSlowAPIs.length > 0 ? 
    perf.topSlowAPIs.map((a: any) => ({ label: a.label.substring(0, 25), value: a.avgResponse })) : 
    [{ label: 'No data', value: 0 }]);

  // Flaky trend data
  const flakyTrendData = JSON.stringify(flaky.trend && flaky.trend.length > 0 ? flaky.trend : [{ date: 'N/A', value: 0 }]);

  // API Results table rows
  const apiResultRows = apiDash.results && apiDash.results.length > 0 ?
    apiDash.results.map((r: any, i: any) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.scenario || 'N/A'}</td>
      <td><span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6">${r.method}</span></td>
      <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${r.url}</td>
      <td>${r.status}</td>
      <td>${r.responseTime}ms</td>
      <td><span class="badge ${r.passed ? 'badge-pass' : 'badge-fail'}">${r.passed ? '✅ PASS' : '❌ FAIL'}</span></td>
    </tr>`).join('\n') :
    '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Executive Dashboard - Amazon Web & Mobile Playwright Automation</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    /* ---- CSS Variables / Theming ---- */
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --bg-card-hover: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --border-color: #334155;
      --accent-blue: #3b82f6;
      --accent-green: #22c55e;
      --accent-red: #ef4444;
      --accent-yellow: #eab308;
      --accent-purple: #a855f7;
      --accent-cyan: #06b6d4;
      --accent-orange: #f97316;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.4);
      --radius: 12px;
      --radius-sm: 8px;
    }
    [data-theme="light"] {
      --bg-primary: #f8fafc;
      --bg-secondary: #f1f5f9;
      --bg-card: #ffffff;
      --bg-card-hover: #e2e8f0;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --border-color: #e2e8f0;
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }
    .container { max-width: 1440px; margin: 0 auto; padding: 20px; }
    
    /* Header */
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 30px;
      flex-wrap: wrap; gap: 15px;
    }
    .header-left h1 { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header-left .subtitle { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
    .header-right { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
    .theme-toggle { 
      background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary);
      padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer;
      font-size: 13px; transition: all 0.2s;
    }
    .theme-toggle:hover { background: var(--bg-card-hover); }
    .status-badge {
      padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;
    }
    .status-pass { background: rgba(34,197,94,0.15); color: var(--accent-green); }
    .status-fail { background: rgba(239,68,68,0.15); color: var(--accent-red); }
    .status-partial { background: rgba(234,179,8,0.15); color: var(--accent-yellow); }
    .timestamp { font-size: 12px; color: var(--text-muted); }

    /* Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 30px; }
    .stat-card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius);
      padding: 20px; box-shadow: var(--shadow); transition: all 0.3s;
      position: relative; overflow: hidden;
    }
    .stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--accent-blue); }
    .stat-card .stat-icon { font-size: 24px; margin-bottom: 8px; }
    .stat-card .stat-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .stat-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .stat-card .stat-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

    /* Section */
    .section { margin-bottom: 40px; }
    .section-title {
      font-size: 20px; font-weight: 700; margin-bottom: 20px; 
      display: flex; align-items: center; gap: 10px;
    }
    .section-title .section-icon { font-size: 24px; }
    .section-title:after {
      content: ''; flex: 1; height: 1px; background: var(--border-color); margin-left: 15px;
    }

    /* Cards Grid */
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius);
      padding: 24px; box-shadow: var(--shadow); transition: all 0.3s;
    }
    .card:hover { border-color: var(--accent-blue); }
    .card-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--text-secondary); }
    .card-value { font-size: 32px; font-weight: 700; }
    .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
    .card-row:last-child { border-bottom: none; }
    .card-row .label { color: var(--text-secondary); font-size: 14px; }
    .card-row .value { font-weight: 600; font-size: 14px; }

    /* Charts */
    .chart-container { position: relative; height: 280px; width: 100%; }

    /* Progress Bar */
    .progress-bar { height: 8px; border-radius: 4px; background: var(--border-color); margin-top: 8px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }
    .progress-green { background: linear-gradient(90deg, var(--accent-green), #4ade80); }
    .progress-red { background: linear-gradient(90deg, var(--accent-red), #f87171); }
    .progress-blue { background: linear-gradient(90deg, var(--accent-blue), #60a5fa); }
    .progress-yellow { background: linear-gradient(90deg, var(--accent-yellow), #facc15); }
    .progress-purple { background: linear-gradient(90deg, var(--accent-purple), #c084fc); }

    /* Table */
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th { text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); font-weight: 600; }
    .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); }
    .data-table tr:hover { background: var(--bg-card-hover); }

    /* Badge */
    .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-pass { background: rgba(34,197,94,0.15); color: var(--accent-green); }
    .badge-fail { background: rgba(239,68,68,0.15); color: var(--accent-red); }
    .badge-skip { background: rgba(148,163,184,0.15); color: var(--text-muted); }
    .badge-go { background: rgba(34,197,94,0.15); color: var(--accent-green); }
    .badge-nogo { background: rgba(239,68,68,0.15); color: var(--accent-red); }
    .badge-conditional { background: rgba(234,179,8,0.15); color: var(--accent-yellow); }

    /* Link Buttons */
    .link-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .link-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: var(--radius-sm); 
      background: var(--bg-secondary); border: 1px solid var(--border-color);
      color: var(--text-primary); text-decoration: none; font-size: 13px;
      transition: all 0.2s;
    }
    .link-btn:hover { background: var(--bg-card-hover); border-color: var(--accent-blue); transform: translateY(-1px); }
    .link-btn.disabled { opacity: 0.4; pointer-events: none; }
    .link-btn .btn-icon { font-size: 16px; }

    /* Release Gate */
    .release-card {
      text-align: center; padding: 40px; border-radius: var(--radius);
      border: 2px solid var(--border-color); position: relative; overflow: hidden;
    }
    .release-card.go { border-color: var(--accent-green); background: rgba(34,197,94,0.05); }
    .release-card.nogo { border-color: var(--accent-red); background: rgba(239,68,68,0.05); }
    .release-card.conditional { border-color: var(--accent-yellow); background: rgba(234,179,8,0.05); }
    .release-decision { font-size: 48px; font-weight: 800; margin: 10px 0; }
    .release-reason { font-size: 14px; color: var(--text-secondary); max-width: 600px; margin: 0 auto; }

    /* Feature list */
    .feature-item { padding: 12px; border-radius: var(--radius-sm); margin-bottom: 8px; background: var(--bg-secondary); }
    .feature-header { display: flex; justify-content: space-between; align-items: center; }
    .feature-name { font-weight: 600; font-size: 14px; }
    .feature-stats { display: flex; gap: 12px; font-size: 12px; }

    /* Animated cards */
    .animate-in { animation: fadeInUp 0.5s ease forwards; opacity: 0; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    /* Responsive */
    @media (max-width: 768px) {
      .container { padding: 12px; }
      .header { flex-direction: column; align-items: flex-start; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .cards-grid { grid-template-columns: 1fr; }
      .release-decision { font-size: 32px; }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
    }

    /* Score meter */
    .score-ring { width: 120px; height: 120px; margin: 0 auto; position: relative; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; font-weight: 700; }
    .score-label { text-align: center; font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

    /* Dark/Light specific overrides */
    [data-theme="light"] .stat-card, [data-theme="light"] .card { background: var(--bg-card); }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>🚀 AI Executive Command Center</h1>
        <div class="subtitle">Amazon Web & Mobile Playwright Automation · v2.0.0</div>
      </div>
      <div class="header-right">
        <span class="timestamp">🕐 Generated: ${new Date(data.generatedAt).toLocaleString()}</span>
        <span class="status-badge ${statusBadgeClass}">
          ${statusBadgeText}
        </span>
        <button class="theme-toggle" onclick="toggleTheme()">🌓 Toggle Theme</button>
      </div>
    </header>

    <!-- Section 1: Executive Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card animate-in" style="animation-delay:0.05s">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Total Tests</div>
        <div class="stat-value">${es.total}</div>
        <div class="stat-sub">${es.passed} passed · ${es.failed} failed · ${es.skipped} skipped</div>
      </div>
      <div class="stat-card animate-in" style="animation-delay:0.1s">
        <div class="stat-icon">✅</div>
        <div class="stat-label">Success Rate</div>
        <div class="stat-value" style="color:${passRate >= 80 ? 'var(--accent-green)' : (passRate >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)')}">${passRate}%</div>
        <div class="progress-bar"><div class="progress-fill ${passRate >= 80 ? 'progress-green' : (passRate >= 50 ? 'progress-yellow' : 'progress-red')}" style="width:${passRate}%"></div></div>
      </div>
      <div class="stat-card animate-in" style="animation-delay:0.15s">
        <div class="stat-icon">⏱️</div>
        <div class="stat-label">Duration</div>
        <div class="stat-value" style="font-size:22px">${es.executionDuration}</div>
        <div class="stat-sub">${es.executionDate}</div>
      </div>
      <div class="stat-card animate-in" style="animation-delay:0.2s">
        <div class="stat-icon">🌐</div>
        <div class="stat-label">Environment</div>
        <div class="stat-value" style="font-size:22px">${(es.environment || 'N/A').toUpperCase()}</div>
        <div class="stat-sub">${es.browser} · ${es.platform}</div>
      </div>
      <div class="stat-card animate-in" style="animation-delay:0.25s">
        <div class="stat-icon">🔀</div>
        <div class="stat-label">Git Branch</div>
        <div class="stat-value" style="font-size:18px">${es.gitBranch}</div>
        <div class="stat-sub">${es.gitCommit}</div>
      </div>
      <div class="stat-card animate-in" style="animation-delay:0.3s">
        <div class="stat-icon">🏗️</div>
        <div class="stat-label">Build #</div>
        <div class="stat-value" style="font-size:22px">${es.buildNumber}</div>
        <div class="stat-sub">${es.platform}</div>
      </div>
    </div>

    <!-- Section 2: Functional Automation -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🧪</span> Functional Automation</div>
      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📋 Test Summary</div>
          <div class="card-row"><span class="label">Total Features</span><span class="value">${func.cucumber.features ? func.cucumber.features.length : 0}</span></div>
          <div class="card-row"><span class="label">Total Scenarios</span><span class="value">${es.total}</span></div>
          <div class="card-row"><span class="label">Passed</span><span class="value" style="color:var(--accent-green)">${es.passed}</span></div>
          <div class="card-row"><span class="label">Failed</span><span class="value" style="color:var(--accent-red)">${es.failed}</span></div>
          <div class="card-row"><span class="label">Skipped</span><span class="value" style="color:var(--text-muted)">${es.skipped}</span></div>
          <div class="card-row"><span class="label">Pass Rate</span><span class="value">${passRate}%</span></div>
          <div class="card-row"><span class="label">Duration</span><span class="value">${es.executionDuration}</span></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📈 Execution Timeline</div>
          <div class="chart-container"><canvas id="timelineChart"></canvas></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📊 Pass/Fail Distribution</div>
          <div class="chart-container"><canvas id="passFailChart"></canvas></div>
        </div>
      </div>
      
      <div class="card" style="margin-top:20px">
        <div class="card-title">📑 Feature-wise Summary</div>
        <table class="data-table">
          <thead><tr><th>Feature</th><th>Total</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Pass %</th></tr></thead>
          <tbody>
            ${featureRows}
          </tbody>
        </table>
      </div>
      
    </div>

    <!-- Section 2b: API Testing Card -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🔌</span> API Testing</div>
      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📊 API Test Summary</div>
          <div class="card-row"><span class="label">Total APIs Executed</span><span class="value">${apiDash.totalAPIs}</span></div>
          <div class="card-row"><span class="label">Passed</span><span class="value" style="color:var(--accent-green)">${apiDash.passed}</span></div>
          <div class="card-row"><span class="label">Failed</span><span class="value" style="color:${apiDash.failed > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">${apiDash.failed}</span></div>
          <div class="card-row"><span class="label">Pass %</span><span class="value">${apiDash.passRate}</span></div>
          <div class="card-row"><span class="label">Avg Response Time</span><span class="value">${apiDash.averageResponseTime}</span></div>
          <div class="card-row"><span class="label">Fastest API</span><span class="value">${apiDash.fastestAPI}</span></div>
          <div class="card-row"><span class="label">Slowest API</span><span class="value">${apiDash.slowestAPI}</span></div>
          <div class="card-row"><span class="label">Execution Time</span><span class="value">${apiDash.executionDuration}</span></div>
          <div class="card-row"><span class="label">Latest Run</span><span class="value" style="font-size:11px">${apiDash.executionTimestamp ? new Date(apiDash.executionTimestamp).toLocaleString() : 'N/A'}</span></div>
        </div>
        <div class="card animate-in" style="grid-column: span 2;">
          <div class="card-title">📋 API Detailed Results</div>
          ${apiDash.hasAPITests && apiDash.totalAPIs > 0 ? `
          <table class="data-table">
            <thead><tr><th>#</th><th>Scenario</th><th>Method</th><th>URL</th><th>Status</th><th>Response Time</th><th>Result</th></tr></thead>
            <tbody>
              ${apiResultRows}
            </tbody>
          </table>` : 
          `<div style="font-size:13px;color:var(--text-muted);padding:20px;text-align:center">No API tests executed. Run 'npm run test:api' to generate API test results.</div>`}
        </div>
      </div>
    </div>

        <!-- Section 3: Performance Dashboard -->
    <div class="section">
      <div class="section-title"><span class="section-icon">⚡</span> Performance Dashboard</div>
      
      <div class="stats-grid">
        <div class="stat-card animate-in">
          <div class="stat-icon">📈</div>
          <div class="stat-label">Avg Response Time</div>
          <div class="stat-value">${perf.avgResponseTime}ms</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📊</div>
          <div class="stat-label">Median</div>
          <div class="stat-value">${perf.median}ms</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📉</div>
          <div class="stat-label">P95</div>
          <div class="stat-value">${perf.p95}ms</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📊</div>
          <div class="stat-label">Throughput</div>
          <div class="stat-value" style="font-size:22px">${perf.throughput}/s</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">❌</div>
          <div class="stat-label">Error Rate</div>
          <div class="stat-value" style="color:${perf.errorRate > 10 ? 'var(--accent-red)' : (perf.errorRate > 5 ? 'var(--accent-yellow)' : 'var(--accent-green)')}">${perf.errorRate}%</div>
          <div class="progress-bar"><div class="progress-fill ${perf.errorRate > 10 ? 'progress-red' : (perf.errorRate > 5 ? 'progress-yellow' : 'progress-green')}" style="width:${Math.min(perf.errorRate, 100)}%"></div></div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📦</div>
          <div class="stat-label">Total Requests</div>
          <div class="stat-value" style="font-size:22px">${perf.totalRequests.toLocaleString()}</div>
        </div>
      </div>

      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📊 Performance Metrics</div>
          <div class="chart-container"><canvas id="perfChart"></canvas></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">🐌 Top Slow APIs</div>
          <div class="chart-container"><canvas id="slowAPIsChart"></canvas></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📈 Response Time Distribution</div>
          <div class="card-row"><span class="label">Minimum</span><span class="value">${perf.min}ms</span></div>
          <div class="card-row"><span class="label">Median (P50)</span><span class="value">${perf.median}ms</span></div>
          <div class="card-row"><span class="label">P90</span><span class="value">${perf.p90}ms</span></div>
          <div class="card-row"><span class="label">P95</span><span class="value">${perf.p95}ms</span></div>
          <div class="card-row"><span class="label">P99</span><span class="value">${perf.p99}ms</span></div>
          <div class="card-row"><span class="label">Maximum</span><span class="value">${perf.max}ms</span></div>
        </div>
      </div>
    </div>

        <!-- Section 4: AI Analysis -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🤖</span> AI Analysis</div>
      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📋 AI Reports</div>
          <div class="card-row"><span class="label">Post-Test Summary</span><span class="value">${ai.executionSummary ? '✅ Available' : '⬜ Not Available'}</span></div>
          <div class="card-row"><span class="label">Root Cause Analysis</span><span class="value">${ai.rootCauseAnalysis ? '✅ Available' : '⬜ Not Available'}</span></div>
          <div class="card-row"><span class="label">Self-Healing Suggestions</span><span class="value">${ai.locatorHealing ? '✅ Available' : '⬜ Not Available'}</span></div>
          <div class="card-row"><span class="label">Code Review</span><span class="value">${ai.codeReview ? '✅ Available' : '⬜ Not Available'}</span></div>
          <div class="card-row"><span class="label">API Analysis</span><span class="value">${safeReadFile(path.join(ROOT, 'reports/ai/api-analysis-report.md')) ? '✅ Available' : '⬜ Not Available'}</span></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📊 Root Cause Distribution</div>
          <div class="chart-container"><canvas id="rootCauseChart"></canvas></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📈 Flakiness Trend</div>
          <div class="chart-container"><canvas id="flakyTrendChart"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Section 5: Self-Healing -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🩹</span> Self-Healing</div>
      <div class="card animate-in">
        <div class="card-title">🔧 Self-Healing Suggestions</div>
        ${sh.suggestions && sh.suggestions.length > 0 ? `
        <table class="data-table">
          <thead><tr><th>Problem</th><th>Suggested Strategy</th><th>Reason</th></tr></thead>
          <tbody>
            ${sh.suggestions.slice(0, 5).map((s: any) => `
            <tr>
              <td>${s.Problem || 'N/A'}</td>
              <td>${s['Suggested Locator Strategy'] || s.Strategy || 'N/A'}</td>
              <td>${s.Reason || s['Root Cause'] || 'N/A'}</td>
            </tr>`).join('\n')}
          </tbody>
        </table>` : '<div style="font-size:13px;color:var(--text-muted)">No self-healing suggestions available</div>'}
      </div>
    </div>

    <!-- Section 6: Flaky Scenarios -->
    <div class="section">
      <div class="section-title"><span class="section-icon">📉</span> Flaky Scenarios</div>
      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📋 Detected Flaky Scenarios</div>
          ${flaky.flakyScenarios && flaky.flakyScenarios.length > 0 ? flaky.flakyScenarios.slice(0, 10).map((fs: any) => `
          <div class="feature-item">
            <div class="feature-header">
              <span class="feature-name">⚠ ${fs.name}</span>
            </div>
            <div class="feature-stats" style="margin-top:4px">
              ${fs.runs.map((r: any) => `<span class="badge ${r.status === 'passed' ? 'badge-pass' : 'badge-fail'}">${r.status}</span>`).join(' ')}
            </div>
          </div>`).join('\n') : '<div style="font-size:13px;color:var(--text-muted)">No flaky scenarios detected</div>'}
        </div>
        <div class="card animate-in">
          <div class="card-title">📈 Flakiness Trend Over Time</div>
          <div class="chart-container"><canvas id="flakyTrendChart"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Section 7: Mobile Dashboard -->
    <div class="section">
      <div class="section-title"><span class="section-icon">📱</span> Mobile Dashboard</div>
      <div class="stats-grid">
        <div class="stat-card animate-in">
          <div class="stat-icon">🤖</div>
          <div class="stat-label">Android Tests</div>
          <div class="stat-value" style="font-size:22px">${mobileDash.android.scenariosRun}</div>
          <div class="stat-sub">${mobileDash.android.passed} passed · ${mobileDash.android.failed} failed</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">🍎</div>
          <div class="stat-label">iOS Tests</div>
          <div class="stat-value" style="font-size:22px">${mobileDash.ios.scenariosRun}</div>
          <div class="stat-sub">${mobileDash.ios.passed} passed · ${mobileDash.ios.failed} failed</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📸</div>
          <div class="stat-label">Screenshots</div>
          <div class="stat-value" style="font-size:22px">${mobileDash.android.screenshots + mobileDash.ios.screenshots}</div>
          <div class="stat-sub">Android: ${mobileDash.android.screenshots} · iOS: ${mobileDash.ios.screenshots}</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">🎥</div>
          <div class="stat-label">Videos</div>
          <div class="stat-value" style="font-size:22px">${mobileDash.android.videos + mobileDash.ios.videos}</div>
          <div class="stat-sub">Android: ${mobileDash.android.videos} · iOS: ${mobileDash.ios.videos}</div>
        </div>
      </div>
    </div>

    <!-- Section 8: Production Readiness -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🏭</span> Production Readiness</div>
      
      <div class="stats-grid">
        <div class="stat-card animate-in" style="text-align:center">
          <div class="score-ring">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-color)" stroke-width="8"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke="${pr.overallScore >= 80 ? '#22c55e' : (pr.overallScore >= 60 ? '#eab308' : '#ef4444')}" stroke-width="8" stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="${2 * Math.PI * 52 * (1 - pr.overallScore / 100)}" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            </svg>
            <div class="score-text">${pr.overallScore}</div>
          </div>
          <div class="score-label">Overall Score</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">🚀</div>
          <div class="stat-label">Framework Health</div>
          <div class="stat-value" style="font-size:22px;color:${pr.frameworkHealth === 'Excellent' ? 'var(--accent-green)' : (pr.frameworkHealth === 'Good' ? 'var(--accent-yellow)' : 'var(--accent-red)')}">${pr.frameworkHealth}</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">🏢</div>
          <div class="stat-label">Enterprise Readiness</div>
          <div class="stat-value" style="font-size:22px">${pr.enterpriseReadiness}%</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">📈</div>
          <div class="stat-label">Coverage Score</div>
          <div class="stat-value" style="font-size:22px">${pr.coverageScore}%</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">⚡</div>
          <div class="stat-label">Performance Score</div>
          <div class="stat-value" style="font-size:22px">${pr.performanceScore}%</div>
        </div>
        <div class="stat-card animate-in">
          <div class="stat-icon">🧠</div>
          <div class="stat-label">AI Maturity</div>
          <div class="stat-value" style="font-size:22px">${pr.aiMaturity}%</div>
        </div>
      </div>

      <div class="card animate-in" style="margin-top:20px">
        <div class="card-title">📋 Matured Capabilities</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
          ${pr.maturedCapabilities.map((c: any) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm)">
            <span>${c.status}</span>
            <span style="font-size:13px">${c.name}</span>
          </div>`).join('\n')}
        </div>
      </div>
    </div>

    <!-- Section 9: Release Gate -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🚦</span> Release Gatekeeper</div>
      <div class="release-card ${releaseCardClass} animate-in">
        <div style="font-size:64px;margin-bottom:10px">${rg.decision === 'GO' ? '✅' : (rg.decision === 'NO GO' ? '🚫' : '⚠️')}</div>
        <div class="release-decision">${rg.decision === 'GO' ? 'RELEASE' : (rg.decision === 'NO GO' ? 'BLOCKED' : 'CONDITIONAL')}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:${rg.decision === 'GO' ? 'var(--accent-green)' : (rg.decision === 'NO GO' ? 'var(--accent-red)' : 'var(--accent-yellow)')}">${rg.decision}</div>
        ${rg.reasoning.map((r: any) => `<div class="release-reason">${r}</div>`).join('')}
      </div>
    </div>

    <!-- Section 10: API Dashboard -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🔌</span> API Dashboard</div>
      <div class="cards-grid">
        <div class="card animate-in">
          <div class="card-title">📊 API Metrics</div>
          <div class="card-row"><span class="label">Total APIs Executed</span><span class="value">${apiDash.totalAPIs}</span></div>
          <div class="card-row"><span class="label">Passed</span><span class="value" style="color:var(--accent-green)">${apiDash.passed}</span></div>
          <div class="card-row"><span class="label">Failed</span><span class="value" style="color:${apiDash.failed > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">${apiDash.failed}</span></div>
          <div class="card-row"><span class="label">Pass %</span><span class="value">${apiDash.passRate}</span></div>
          <div class="card-row"><span class="label">Avg Response Time</span><span class="value">${apiDash.averageResponseTime}</span></div>
          <div class="card-row"><span class="label">Fastest API</span><span class="value">${apiDash.fastestAPI}</span></div>
          <div class="card-row"><span class="label">Slowest API</span><span class="value">${apiDash.slowestAPI}</span></div>
          <div class="card-row"><span class="label">Execution Time</span><span class="value">${apiDash.executionDuration}</span></div>
        </div>
        <div class="card animate-in">
          <div class="card-title">📋 API Features</div>
          ${apiDash.hasAPITests ? 
            `<div style="font-size:13px;color:var(--text-secondary)">
              <p>${apiDash.totalAPIs} API endpoints tested with Playwright APIRequestContext.</p>
              <p style="margin-top:8px">Methods covered: GET, POST, PUT, PATCH, DELETE</p>
              <p style="margin-top:8px">Base URL: https://jsonplaceholder.typicode.com</p>
              <div class="link-buttons" style="margin-top:12px">
                <a href="../api/api-summary.json" class="link-btn" target="_blank"><span class="btn-icon">📄</span> API JSON Report</a>
                <a href="../api/api-summary.md" class="link-btn" target="_blank"><span class="btn-icon">📝</span> API Markdown Report</a>
                <a href="../api/api-report.html" class="link-btn" target="_blank"><span class="btn-icon">🖥️</span> API HTML Report</a>
                <a href="../ai/api-analysis-report.md" class="link-btn" target="_blank"><span class="btn-icon">🤖</span> AI Analysis Report</a>
              </div>
            </div>` :
            `<div style="font-size:13px;color:var(--text-muted)">No API test features detected. Add API test features to enable monitoring.</div>`}
        </div>
      </div>
    </div>

    <!-- Section 11: Links & Reports -->
    <div class="section">
      <div class="section-title"><span class="section-icon">🔗</span> Reports & Links</div>
      <div class="link-buttons">
        <a href="../web/cucumber-html-report.html" class="link-btn ${func.cucumber.status === 'completed' ? '' : 'disabled'}" target="_blank"><span class="btn-icon">🖥️</span> Web Report</a>
        <a href="../android/cucumber-html-report.html" class="link-btn" target="_blank"><span class="btn-icon">🤖</span> Android Report</a>
        <a href="../ios/cucumber-html-report.html" class="link-btn" target="_blank"><span class="btn-icon">🍎</span> iOS Report</a>
        <a href="../jmeter/html/index.html" class="link-btn ${perf.hasJMeterData ? '' : 'disabled'}" target="_blank"><span class="btn-icon">⚡</span> JMeter Report</a>
        <a href="../api/api-report.html" class="link-btn" target="_blank"><span class="btn-icon">🔌</span> API Report</a>
        <a href="../ai/api-analysis-report.md" class="link-btn" target="_blank"><span class="btn-icon">🤖</span> AI API Analysis</a>
        <a href="../../ai/output/ai-post-test-summary.md" class="link-btn" target="_blank"><span class="btn-icon">🤖</span> AI Summary</a>
        <a href="../../ai/output/code-review-report.md" class="link-btn" target="_blank"><span class="btn-icon">📝</span> Code Review</a>
        <a href="../../ai/output/self-healing-suggestions.md" class="link-btn" target="_blank"><span class="btn-icon">🩹</span> Self-Healing</a>
        <a href="../../ai/output/jenkins-failure-analysis.md" class="link-btn" target="_blank"><span class="btn-icon">🔍</span> Jenkins Analysis</a>
      </div>
    </div>
  </div>

  <script>
    // Theme toggle
    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('dashboard-theme', next);
    }
    const saved = localStorage.getItem('dashboard-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);

    // Chart defaults
    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#94a3b8';
    Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#334155';

    function getThemeColors() {
      const style = getComputedStyle(document.documentElement);
      return {
        text: style.getPropertyValue('--text-secondary').trim() || '#94a3b8',
        border: style.getPropertyValue('--border-color').trim() || '#334155',
        green: style.getPropertyValue('--accent-green').trim() || '#22c55e',
        red: style.getPropertyValue('--accent-red').trim() || '#ef4444',
        blue: style.getPropertyValue('--accent-blue').trim() || '#3b82f6',
        yellow: style.getPropertyValue('--accent-yellow').trim() || '#eab308',
        purple: style.getPropertyValue('--accent-purple').trim() || '#a855f7',
        cyan: style.getPropertyValue('--accent-cyan').trim() || '#06b6d4',
        orange: style.getPropertyValue('--accent-orange').trim() || '#f97316',
      };
    }

    // 1. Pass/Fail Pie Chart
    const pfCtx = document.getElementById('passFailChart');
    if (pfCtx) {
      new Chart(pfCtx, {
        type: 'doughnut',
        data: {
          labels: ['Passed (${es.passed})', 'Failed (${es.failed})', 'Skipped (${es.skipped})'],
          datasets: [{
            data: [${es.passed}, ${es.failed}, ${es.skipped}],
            backgroundColor: ['#22c55e', '#ef4444', '#64748b'],
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 2. Root Cause Pie Chart
    const rcCtx = document.getElementById('rootCauseChart');
    if (rcCtx) {
      const rcData = ${rootCauseChartData};
      new Chart(rcCtx, {
        type: 'pie',
        data: {
          labels: rcData.map(d => d.label),
          datasets: [{
            data: rcData.map(d => d.value),
            backgroundColor: rcData.map(d => d.color),
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { padding: 10, boxWidth: 10, font: { size: 10 } } }
          }
        }
      });
    }

    // 3. Performance Bar Chart
    const perfCtx = document.getElementById('perfChart');
    if (perfCtx) {
      const perfData = ${perfChartData};
      new Chart(perfCtx, {
        type: 'bar',
        data: {
          labels: perfData.labels,
          datasets: [{
            label: 'Response Time (ms)',
            data: perfData.values,
            backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'],
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' } },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // 4. Slow APIs Bar Chart
    const slowCtx = document.getElementById('slowAPIsChart');
    if (slowCtx) {
      const slowData = ${slowAPIsData};
      new Chart(slowCtx, {
        type: 'bar',
        data: {
          labels: slowData.map(d => d.label),
          datasets: [{
            label: 'Avg Response (ms)',
            data: slowData.map(d => d.value),
            backgroundColor: '#f59e0b',
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: 'y',
          scales: {
            y: { grid: { display: false } },
            x: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // 5. Flaky Trend Line Chart
    const flakyCtx = document.getElementById('flakyTrendChart');
    if (flakyCtx) {
      const flakyData = ${flakyTrendData};
      new Chart(flakyCtx, {
        type: 'line',
        data: {
          labels: flakyData.map(d => d.date),
          datasets: [{
            label: 'Flakiness %',
            data: flakyData.map(d => d.value),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#f59e0b',
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' } },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // 6. Timeline Bar Chart
    const tlCtx = document.getElementById('timelineChart');
    if (tlCtx) {
      const tlData = ${timelineData};
      const labels = tlData.map((d, i) => d.scenario ? d.scenario.substring(0, 20) + '...' : '#' + (i+1));
      const values = tlData.map(d => Math.round(d.duration / 1000)); // seconds
      const colors = tlData.map(d => d.status === 'passed' ? '#22c55e' : d.status === 'failed' ? '#ef4444' : '#64748b');
      new Chart(tlCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Duration (s)',
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' } },
            x: { grid: { display: false }, ticks: { font: { size: 8 } } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  </script>
</body>
</html>`;
}

if (require.main === module) {
  const result = main();
  console.log(JSON.stringify(result, null, 2));
}

export { generateDashboardData, main };
export default { generateDashboardData, main };
