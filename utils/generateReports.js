#!/usr/bin/env node

/**
 * generateReports.js
 *
 * Unified report generator for Web, Android, and iOS automation.
 * Generates Cucumber HTML reports, Allure reports, and AI summary reports.
 *
 * Usage:
 *   node utils/generateReports.js web        – generate web HTML + Allure
 *   node utils/generateReports.js android    – generate android HTML + Allure
 *   node utils/generateReports.js ios        – generate ios HTML + Allure
 *   node utils/generateReports.js all        – generate all platform reports + combined
 *   node utils/generateReports.js allure     – generate Allure for all platforms (no Cucumber HTML)
 *   node utils/generateReports.js combined   – generate only combined Cucumber HTML report
 *
 * Environment variables:
 *   ALLURE_RESULTS_DIR – override allure results dir (default: reports/{platform}/allure-results)
 */

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Use locally installed allure binary — avoids npx download triggers that cause
// macOS Gatekeeper "Malicious Script Blocked" false positives.
const ALLURE_BIN = path.resolve(ROOT, 'node_modules', '.bin', 'allure');

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------
const PLATFORMS = {
  web: {
    label: 'Web',
    jsonReport: 'reports/web/cucumber-report.json',
    htmlReport: 'reports/web/cucumber-html-report.html',
    allureResults: 'reports/allure/web/allure-results',
    allureReport: 'reports/allure/web/allure-report',
    metadata: {
      PLATFORM: 'WEB',
      BROWSER: process.env.BROWSER || 'chromium',
      DEVICE_NAME: 'N/A',
      BASE_URL: process.env.BASE_URL || 'https://www.amazon.in',
      ENV: process.env.ENV || 'dev',
      APP_VERSION: process.env.APP_VERSION || 'N/A'
    }
  },
  android: {
    label: 'Android',
    jsonReport: 'reports/android/cucumber-report.json',
    htmlReport: 'reports/android/cucumber-html-report.html',
    allureResults: 'reports/allure/android/allure-results',
    allureReport: 'reports/allure/android/allure-report',
    metadata: {
      PLATFORM: 'ANDROID',
      BROWSER: process.env.BROWSER_NAME || 'chrome',
      DEVICE_NAME: process.env.DEVICE_NAME || 'Android Emulator',
      BASE_URL: process.env.BASE_URL || 'https://www.amazon.in',
      ENV: process.env.ENV || 'dev',
      APP_VERSION: process.env.APP_VERSION || 'N/A'
    }
  },
  ios: {
    label: 'iOS',
    jsonReport: 'reports/ios/cucumber-report.json',
    htmlReport: 'reports/ios/cucumber-html-report.html',
    allureResults: 'reports/allure/ios/allure-results',
    allureReport: 'reports/allure/ios/allure-report',
    metadata: {
      PLATFORM: 'IOS',
      BROWSER: process.env.BROWSER_NAME || 'safari',
      DEVICE_NAME: process.env.DEVICE_NAME || 'iOS Simulator',
      BASE_URL: process.env.BASE_URL || 'https://www.amazon.in',
      ENV: process.env.ENV || 'dev',
      APP_VERSION: process.env.APP_VERSION || 'N/A'
    }
  }
};

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const INFO = '\x1b[36mi\x1b[0m';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  const ts = new Date().toISOString().split('.')[0].replace('T', ' ');
  console.log(`[reports] ${ts} ${msg}`);
}

function ensureDir(dir) {
  fs.ensureDirSync(path.resolve(ROOT, dir));
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(ROOT, relativePath));
}

function writeMetadata(platform) {
  const cfg = PLATFORMS[platform];
  if (!cfg) return;

  const metadataDir = path.resolve(ROOT, `reports/${platform}`);
  ensureDir(`reports/${platform}`);

  const envPropsPath = path.resolve(metadataDir, 'environment.properties');
  const lines = Object.entries(cfg.metadata).map(([k, v]) => `${k}=${v}`);
  lines.push(`EXECUTION_TIME=${new Date().toISOString()}`);
  fs.writeFileSync(envPropsPath, lines.join('\n') + '\n', 'utf8');
  log(`metadata written: ${envPropsPath}`);
}

function copyAllureMetadata(platform) {
  const src = path.resolve(ROOT, `reports/${platform}/environment.properties`);
  const destDir = path.resolve(ROOT, PLATFORMS[platform].allureResults);
  ensureDir(PLATFORMS[platform].allureResults);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(destDir, 'environment.properties'));
    log(`allure metadata copied to ${platform} allure-results`);
  }
}

function writeAllureCategories(platform) {
  const categoriesPath = path.resolve(ROOT, PLATFORMS[platform].allureResults, 'categories.json');
  const categories = [
    { name: 'Product bugs', matchedStatuses: ['broken'], messageRegex: '.*AssertionError.*' },
    { name: 'Authentication issues', matchedStatuses: ['broken'], messageRegex: '.*(401|403|unauthorized|authentication).*' },
    { name: 'Timeout failures', matchedStatuses: ['broken', 'failed'], messageRegex: '.*(timeout|TimedOut|TimeoutError).*' },
    { name: 'Element not found', matchedStatuses: ['broken', 'failed'], messageRegex: '.*(not found|NoSuchElement|no such element).*' },
    { name: 'Network errors', matchedStatuses: ['broken'], messageRegex: '.*(ETIMEDOUT|ECONNREFUSED|ENOTFOUND|net::).*' },
    { name: 'Skipped tests', matchedStatuses: ['skipped'] },
    { name: 'Infrastructure issues', matchedStatuses: ['broken'], traceRegex: '.*(Appium|WebDriver|session).*' },
    { name: 'Test defects', matchedStatuses: ['failed'] }
  ];
  fs.ensureDirSync(path.dirname(categoriesPath));
  fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2), 'utf8');
  log(`allure categories written: ${categoriesPath}`);
}

function writeAllureExecutor(platform) {
  const execPath = path.resolve(ROOT, PLATFORMS[platform].allureResults, 'executor.json');
  const executor = {
    name: 'Playwright Cucumber BDD Framework',
    type: 'cucumber',
    buildName: process.env.BUILD_TAG || `Local-${new Date().toISOString().split('T')[0]}`,
    buildUrl: process.env.BUILD_URL || '',
    reportUrl: '',
    reportName: 'Allure Report'
  };
  fs.ensureDirSync(path.dirname(execPath));
  fs.writeFileSync(execPath, JSON.stringify(executor, null, 2), 'utf8');
  log(`allure executor written: ${execPath}`);
}

function moveRootAllureResultsToPlatform(platform) {
  const rootResults = path.resolve(ROOT, 'allure-results');
  const targetDir = path.resolve(ROOT, PLATFORMS[platform].allureResults);

  if (fs.existsSync(rootResults)) {
    const files = fs.readdirSync(rootResults).filter(f => f.endsWith('.json') || f.endsWith('.txt'));
    if (files.length > 0) {
      ensureDir(PLATFORMS[platform].allureResults);
      for (const file of files) {
        const src = path.join(rootResults, file);
        const dest = path.join(targetDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
      log(`moved ${files.length} allure result files from root/ to ${platform}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cucumber JSON → Cucumber HTML via cucumber-html-reporter (primary)
// ---------------------------------------------------------------------------

function generateCucumberHtml(platform) {
  const cfg = PLATFORMS[platform];
  const jsonPath = path.resolve(ROOT, cfg.jsonReport);

  if (!fs.existsSync(jsonPath)) {
    log(`${FAIL} ${platform} JSON report not found at ${cfg.jsonReport}. Skipping HTML.`);
    return false;
  }

  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    log(`${FAIL} ${platform} JSON report is invalid JSON: ${e.message}`);
    return false;
  }

  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    log(`${FAIL} ${platform} JSON report is empty or invalid format`);
    return false;
  }

  // Count scenarios
  let total = 0, passed = 0, failed = 0;
  for (const feature of jsonData) {
    const elements = feature.elements || [];
    for (const el of elements) {
      total++;
      const st = (el.status || (el.steps && el.steps[el.steps.length - 1]?.result?.status) || '').toLowerCase();
      if (st === 'passed') passed++;
      else if (st === 'failed') failed++;
    }
  }

  ensureDir(`reports/${platform}`);

  // Primary: use cucumber-html-reporter (works reliably with Cucumber v11 JSON)
  try {
    const reporter = require('cucumber-html-reporter');
    const options = {
      theme: 'bootstrap',
      jsonFile: jsonPath,
      output: path.resolve(ROOT, cfg.htmlReport),
      reportSuiteAsScenarios: true,
      launchReport: false,
      ignoreBadJsonFile: true,
      name: `${cfg.label} Cucumber BDD Test Report`,
      brandTitle: `${cfg.label} - ${cfg.metadata.PLATFORM}`,
      columnLayout: 2,
      storeScreenshots: true,
      screenshotsDirectory: path.resolve(ROOT, `reports/${platform}/screenshots`),
      noInlineScreenshots: false,
      metadata: {
        'Platform': cfg.label,
        'Browser': cfg.metadata.BROWSER,
        'Device': cfg.metadata.DEVICE_NAME,
        'Environment': cfg.metadata.ENV,
        'Executed': new Date().toISOString()
      }
    };
    reporter.generate(options);
    log(`${PASS} ${platform} Cucumber HTML report generated: ${cfg.htmlReport}`);
    return true;
  } catch (e) {
    log(`${FAIL} ${platform} Cucumber HTML generation (cucumber-html-reporter) failed: ${e.message}`);
    // Fallback: try multiple-cucumber-html-reporter
    try {
      const fallbackReporter = require('multiple-cucumber-html-reporter');
      fallbackReporter.generate({
        jsonDir: path.resolve(ROOT, `reports/${platform}`),
        reportPath: path.resolve(ROOT, cfg.htmlReport).replace(/\.html$/, ''),
        displayDuration: true,
        displayReportTime: true,
        useCDN: true,
        pageTitle: `${cfg.label} Test Report`,
        reportName: `${cfg.label} Cucumber BDD Report`,
        metadata: {
          platform: { name: cfg.label.toLowerCase() },
          browser: { name: cfg.metadata.BROWSER },
          device: cfg.metadata.DEVICE_NAME,
          environment: cfg.metadata.ENV
        },
        customData: {
          title: 'Execution Info',
          data: Object.entries(cfg.metadata).map(([k, v]) => ({ label: k, value: v }))
        }
      });
      log(`${PASS} ${platform} Cucumber HTML report generated (fallback): ${cfg.htmlReport}`);
      return true;
    } catch (e2) {
      log(`${FAIL} ${platform} Cucumber HTML fallback also failed: ${e2.message}`);
      return false;
    }
  }
}

function generateCombinedCucumberHtml() {
  const jsonDirs = [];
  for (const p of ['web', 'android', 'ios']) {
    const jsonPath = path.resolve(ROOT, PLATFORMS[p].jsonReport);
    if (fs.existsSync(jsonPath)) {
      jsonDirs.push(path.resolve(ROOT, `reports/${p}`));
    }
  }

  if (jsonDirs.length === 0) {
    log(`${FAIL} No platform JSON reports found. Cannot generate combined report.`);
    return false;
  }

  ensureDir('reports/combined');

  try {
    const reporter = require('multiple-cucumber-html-reporter');
    reporter.generate({
      jsonDir: path.resolve(ROOT, 'reports'),
      reportPath: path.resolve(ROOT, 'reports/combined/cucumber-html-report'),
      displayDuration: true,
      displayReportTime: true,
      useCDN: true,
      pageTitle: 'Combined Test Report - All Platforms',
      reportName: 'Combined Cucumber BDD Report (Web + Android + iOS)',
      metadata: {
        platform: { name: 'all' },
        browser: { name: 'chromium, firefox, safari, webkit' },
        device: 'Desktop, Android, iOS',
        environment: process.env.ENV || 'dev'
      },
      customData: {
        title: 'Execution Info',
        data: [
          { label: 'Platforms', value: jsonDirs.length === 3 ? 'Web, Android, iOS' : jsonDirs.join(', ') },
          { label: 'Environment', value: process.env.ENV || 'dev' },
          { label: 'Execution Time', value: new Date().toISOString() }
        ]
      }
    });
    log(`${PASS} Combined Cucumber HTML report generated: reports/combined/cucumber-html-report.html`);
    return true;
  } catch (e) {
    log(`${FAIL} Combined Cucumber HTML generation failed: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Allure report generation (via locally installed allure CLI)
// ---------------------------------------------------------------------------

function generateAllureReport(platform) {
  const cfg = PLATFORMS[platform];
  const resultsDir = path.resolve(ROOT, cfg.allureResults);
  const reportDir = path.resolve(ROOT, cfg.allureReport);

  // Move any root allure-results into this platform's dir
  moveRootAllureResultsToPlatform(platform);

  if (!fs.existsSync(resultsDir)) {
    log(`${FAIL} ${platform} allure-results directory not found at ${cfg.allureResults}`);
    return false;
  }

  const resultFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') || f.endsWith('.txt'));
  if (resultFiles.length === 0) {
    log(`${FAIL} ${platform} allure-results empty at ${cfg.allureResults}`);
    return false;
  }

  copyAllureMetadata(platform);
  writeAllureCategories(platform);
  writeAllureExecutor(platform);

  ensureDir(cfg.allureReport);

  try {
    execSync(`"${ALLURE_BIN}" generate "${resultsDir}" -o "${reportDir}" --clean`, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 60000
    });
    log(`${PASS} ${platform} Allure report generated: ${cfg.allureReport}/index.html`);
    return true;
  } catch (e) {
    log(`${FAIL} ${platform} Allure report generation failed: ${e.message}`);
    return false;
  }
}

function generateCombinedAllureReport() {
  const combinedResultsDir = path.resolve(ROOT, 'reports/allure/combined/allure-results');
  const combinedReportDir = path.resolve(ROOT, 'reports/allure/combined/allure-report');

  ensureDir(combinedResultsDir);

  let totalCopied = 0;
  for (const p of ['web', 'android', 'ios']) {
    const srcDir = path.resolve(ROOT, PLATFORMS[p].allureResults);
    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json') || f.endsWith('.txt'));
      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(combinedResultsDir, `${p}_${file}`);
        fs.copyFileSync(src, dest);
        totalCopied++;
      }
    }
  }

  if (totalCopied === 0) {
    log(`${FAIL} No allure results found for any platform. Cannot generate combined Allure report.`);
    return false;
  }

  const envProps = [
    `PLATFORM=ALL`,
    `BROWSERS=chromium,firefox,safari,webkit`,
    `ENV=${process.env.ENV || 'dev'}`,
    `EXECUTION_TIME=${new Date().toISOString()}`
  ];
  fs.writeFileSync(path.join(combinedResultsDir, 'environment.properties'), envProps.join('\n') + '\n', 'utf8');

  const categories = [
    { name: 'Product bugs', matchedStatuses: ['broken'], messageRegex: '.*AssertionError.*' },
    { name: 'Timeout failures', matchedStatuses: ['broken', 'failed'], messageRegex: '.*(timeout|TimedOut|TimeoutError).*' },
    { name: 'Test defects', matchedStatuses: ['failed'] },
    { name: 'Skipped tests', matchedStatuses: ['skipped'] }
  ];
  fs.writeFileSync(path.join(combinedResultsDir, 'categories.json'), JSON.stringify(categories, null, 2), 'utf8');

  ensureDir('reports/allure/combined/allure-report');

  try {
    execSync(`"${ALLURE_BIN}" generate "${combinedResultsDir}" -o "${combinedReportDir}" --clean`, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 60000
    });
    log(`${PASS} Combined Allure report generated: reports/allure/combined/allure-report/index.html`);
    return true;
  } catch (e) {
    log(`${FAIL} Combined Allure report generation failed: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// AI summary report
// ---------------------------------------------------------------------------

function generateAiSummaryReport() {
  const lines = [];
  const timestamp = new Date().toISOString().split('.').shift() + 'Z';
  lines.push('# AI Summary Report');
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push('');

  const platforms = ['web', 'android', 'ios'];
  let totalScenarios = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const p of platforms) {
    const cfg = PLATFORMS[p];
    const jsonPath = path.resolve(ROOT, cfg.jsonReport);
    if (!fs.existsSync(jsonPath)) {
      lines.push(`## ${cfg.label}\n\nNo results found.\n`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      lines.push(`## ${cfg.label}\n\nInvalid JSON.\n`);
      continue;
    }

    if (!Array.isArray(data) || data.length === 0) {
      lines.push(`## ${cfg.label}\n\nNo scenarios.\n`);
      continue;
    }

    let scenarios = 0, passed = 0, failed = 0, skipped = 0;
    for (const feature of data) {
      const elements = feature.elements || [];
      for (const el of elements) {
        scenarios++;
        const st = (el.status || (el.steps && el.steps[el.steps.length - 1]?.result?.status) || '').toLowerCase();
        if (st === 'passed') passed++;
        else if (st === 'failed') failed++;
        else skipped++;
      }
    }
    totalScenarios += scenarios;
    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;

    const passRate = scenarios > 0 ? ((passed / scenarios) * 100).toFixed(1) : 'N/A';
    lines.push(`## ${cfg.label}\n`);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Scenarios | ${scenarios} |`);
    lines.push(`| Passed | ${passed} |`);
    lines.push(`| Failed | ${failed} |`);
    lines.push(`| Skipped | ${skipped} |`);
    lines.push(`| Pass Rate | ${passRate}% |`);
    lines.push('');
  }

  const overallRate = totalScenarios > 0 ? ((totalPassed / totalScenarios) * 100).toFixed(1) : 'N/A';
  lines.push(`## Overall\n`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Scenarios | ${totalScenarios} |`);
  lines.push(`| Passed | ${totalPassed} |`);
  lines.push(`| Failed | ${totalFailed} |`);
  lines.push(`| Skipped | ${totalSkipped} |`);
  lines.push(`| Pass Rate | ${overallRate}% |`);
  lines.push('');
  lines.push('---');
  lines.push(`*Generated by generateReports.js at ${timestamp}*`);
  lines.push('');

  const aiReportDir = path.resolve(ROOT, 'reports', 'ai');
  ensureDir('reports/ai');
  fs.writeFileSync(path.join(aiReportDir, 'ai-summary-report.md'), lines.join('\n'), 'utf8');
  log(`${PASS} AI summary report generated: reports/ai/ai-summary-report.md`);
}

// ---------------------------------------------------------------------------
// Validation summary
// ---------------------------------------------------------------------------

function printValidationSummary() {
  console.log('\n========================================');
  console.log('  Report Generation Validation Summary');
  console.log('========================================');

  const results = {};

  const webOk = fileExists('reports/web/cucumber-html-report.html');
  console.log(`  Web Cucumber HTML:   ${webOk ? PASS : FAIL}`);
  results.web_html = webOk;

  const androidOk = fileExists('reports/android/cucumber-html-report.html');
  console.log(`  Android Cucumber HTML: ${androidOk ? PASS : FAIL}`);
  results.android_html = androidOk;

  const iosOk = fileExists('reports/ios/cucumber-html-report.html');
  console.log(`  iOS Cucumber HTML:   ${iosOk ? PASS : FAIL}`);
  results.ios_html = iosOk;

  const combinedOk = fileExists('reports/combined/cucumber-html-report.html');
  console.log(`  Combined Cucumber HTML: ${combinedOk ? PASS : FAIL}`);
  results.combined_html = combinedOk;

  const webAllureOk = fileExists('reports/allure/web/allure-report/index.html');
  console.log(`  Web Allure:          ${webAllureOk ? PASS : FAIL}`);
  results.web_allure = webAllureOk;

  const androidAllureOk = fileExists('reports/allure/android/allure-report/index.html');
  console.log(`  Android Allure:      ${androidAllureOk ? PASS : FAIL}`);
  results.android_allure = androidAllureOk;

  const iosAllureOk = fileExists('reports/allure/ios/allure-report/index.html');
  console.log(`  iOS Allure:          ${iosAllureOk ? PASS : FAIL}`);
  results.ios_allure = iosAllureOk;

  const combinedAllureOk = fileExists('reports/allure/combined/allure-report/index.html');
  console.log(`  Combined Allure:     ${combinedAllureOk ? PASS : FAIL}`);
  results.combined_allure = combinedAllureOk;

  const aiOk = fileExists('reports/ai/ai-summary-report.md');
  console.log(`  AI summary report:   ${aiOk ? PASS : FAIL}`);
  results.ai = aiOk;

  console.log('========================================\n');

  const allOk = Object.values(results).every(v => v === true);
  if (allOk) {
    console.log('  All reports validated successfully.');
  } else {
    const missing = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    console.log(`  Missing/Invalid: ${missing.join(', ')}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const mode = (process.argv[2] || 'all').toLowerCase();
  log(`Report generation mode: ${mode}`);

  // Write metadata for all platforms first
  for (const p of ['web', 'android', 'ios']) {
    writeMetadata(p);
  }

  switch (mode) {
    case 'web':
      generateCucumberHtml('web');
      generateAllureReport('web');
      break;

    case 'android':
      generateCucumberHtml('android');
      generateAllureReport('android');
      break;

    case 'ios':
      generateCucumberHtml('ios');
      generateAllureReport('ios');
      break;

    case 'allure':
      generateAllureReport('web');
      generateAllureReport('android');
      generateAllureReport('ios');
      break;

    case 'combined':
      generateCombinedCucumberHtml();
      break;

    case 'all':
    default:
      generateCucumberHtml('web');
      generateCucumberHtml('android');
      generateCucumberHtml('ios');
      generateCombinedCucumberHtml();
      generateAllureReport('web');
      generateAllureReport('android');
      generateAllureReport('ios');
      generateCombinedAllureReport();
      generateAiSummaryReport();
      printValidationSummary();
      break;
  }
}

main().catch((err) => {
  console.error('[reports] Fatal error:', err.message);
  process.exit(1);
});
