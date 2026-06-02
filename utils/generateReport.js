// Generates a readable Cucumber HTML report from the JSON report output.
const reporter = require('cucumber-html-reporter');
const fs = require('fs-extra');

const reportDir = process.env.REPORT_DIR || 'reports';
const jsonReport = `${reportDir}/json/cucumber-report.json`;
const htmlReport = `${reportDir}/html/cucumber-html-report.html`;

if (!fs.existsSync(jsonReport)) {
  console.error('JSON report not found. Run npm test first.');
  process.exit(1);
}

reporter.generate({
  theme: 'bootstrap',
  jsonFile: jsonReport,
  output: htmlReport,
  reportSuiteAsScenarios: true,
  launchReport: false,
  metadata: {
    'App Name': 'Sephora India',
    Browser: process.env.BROWSER || 'chromium',
    Platform: process.platform,
    Environment: process.env.ENV || 'dev'
  }
});

console.log(`HTML report generated: ${htmlReport}`);
