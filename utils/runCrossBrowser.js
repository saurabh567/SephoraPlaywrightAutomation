// Runs the same Cucumber suite against multiple Playwright browsers with isolated report folders.
const { spawnSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const supportedBrowsers = ['chromium', 'firefox', 'webkit'];
const requestedBrowsers = (process.env.BROWSERS || supportedBrowsers.join(','))
  .split(',')
  .map((browser) => browser.trim())
  .filter(Boolean);

const invalidBrowsers = requestedBrowsers.filter((browser) => !supportedBrowsers.includes(browser));

if (invalidBrowsers.length > 0) {
  console.error(`Unsupported browser(s): ${invalidBrowsers.join(', ')}`);
  console.error(`Supported browsers: ${supportedBrowsers.join(', ')}`);
  process.exit(1);
}

const crossBrowserReportDir = path.join('reports', 'cross-browser');
fs.emptyDirSync(crossBrowserReportDir);

let hasFailure = false;

for (const browser of requestedBrowsers) {
  const reportDir = path.join(crossBrowserReportDir, browser);
  fs.ensureDirSync(reportDir);
  const cucumberArgs = ['cucumber-js', '--config', 'cucumber.js'];

  if (process.env.DRY_RUN === 'true') {
    cucumberArgs.push('--dry-run');
  }

  if (process.env.TAGS) {
    cucumberArgs.push('--tags', process.env.TAGS);
  }

  console.log(`\n===== Running Cucumber tests on ${browser} =====`);

  const result = spawnSync('npx', cucumberArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      BROWSER: browser,
      REPORT_DIR: reportDir
    }
  });

  if (result.status !== 0) {
    hasFailure = true;
    console.error(`===== ${browser} execution failed =====`);
  } else {
    console.log(`===== ${browser} execution passed =====`);
  }
}

if (hasFailure) {
  process.exit(1);
}
