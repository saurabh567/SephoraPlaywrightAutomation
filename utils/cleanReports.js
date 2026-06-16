// Deletes old generated artifacts before a new test execution starts.
const fs = require('fs-extra');

const reportDir = process.env.REPORT_DIR || 'reports';

const folders = [
  `${reportDir}/screenshots`,
  `${reportDir}/videos`,
  `${reportDir}/traces`,
  `${reportDir}/ai`,
  `${reportDir}/cross-browser`,
  // Root allure artifacts (legacy from runs without ALLURE_RESULTS_DIR)
  'allure-results',
  'allure-report',
  'screenshots',
  'videos',
  'logs',
  // Platform root folders (contain cucumber-report.json, etc.)
  'reports/web',
  'reports/android',
  'reports/ios',
  'reports/combined',
  // Allure results dirs per platform
  'reports/allure/web/allure-results',
  'reports/allure/web/allure-report',
  'reports/allure/android/allure-results',
  'reports/allure/android/allure-report',
  'reports/allure/ios/allure-results',
  'reports/allure/ios/allure-report',
  // Combined Allure report
  'reports/allure/combined/allure-results',
  'reports/allure/combined/allure-report'
];

for (const folder of folders) {
  fs.emptyDirSync(folder);
}

console.log('Old reports, screenshots, videos, traces, allure artifacts and logs cleaned successfully.');
