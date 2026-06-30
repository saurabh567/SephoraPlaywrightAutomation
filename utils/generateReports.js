#!/usr/bin/env node

/**
 * generateReports.js
 *
 * Unified report generator for Web, Android, and iOS automation.
 * Generates Cucumber HTML reports and AI summary reports.
 *
 * Usage:
 *   node utils/generateReports.js web        – generate web HTML
 *   node utils/generateReports.js android    – generate android HTML
 *   node utils/generateReports.js ios        – generate ios HTML
 *   node utils/generateReports.js all        – generate all platform reports + combined
 *   node utils/generateReports.js combined   – generate only combined Cucumber HTML report
 */

const path = require('path');
const fs = require('fs-extra');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------
const PLATFORMS = {
  web: {
    label: 'Web',
    jsonReport: 'reports/web/cucumber-report.json',
    htmlReport: 'reports/web/cucumber-html-report.html',
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
// AI summary report
// ---------------------------------------------------------------------------

function generateAiSummaryReport() {
  log(`${INFO} AI summary report generation is integrated into the dashboard workflow.`);
}

// ---------------------------------------------------------------------------
// Validation summary
// ---------------------------------------------------------------------------

function printValidationSummary() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    REPORT GENERATION SUMMARY                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results = {
    web_html: fileExists('reports/web/cucumber-html-report.html'),
    android_html: fileExists('reports/android/cucumber-html-report.html'),
    ios_html: fileExists('reports/ios/cucumber-html-report.html'),
    combined_html: fileExists('reports/combined/cucumber-html-report.html')
  };

  console.log(`  Web HTML:            ${results.web_html ? PASS : FAIL}`);
  console.log(`  Android HTML:        ${results.android_html ? PASS : FAIL}`);
  console.log(`  iOS HTML:            ${results.ios_html ? PASS : FAIL}`);
  console.log(`  Combined HTML:       ${results.combined_html ? PASS : FAIL}`);
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
      break;

    case 'android':
      generateCucumberHtml('android');
      break;

    case 'ios':
      generateCucumberHtml('ios');
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
      generateAiSummaryReport();
      printValidationSummary();
      break;
  }
}

main().catch((err) => {
  console.error('[reports] Fatal error:', err.message);
  process.exit(1);
});
