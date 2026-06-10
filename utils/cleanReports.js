// Deletes old generated artifacts before a new test execution starts.
const fs = require('fs-extra');

const reportDir = process.env.REPORT_DIR || 'reports';

const folders = [
  `${reportDir}/html`,
  `${reportDir}/json`,
  `${reportDir}/screenshots`,
  `${reportDir}/videos`,
  `${reportDir}/traces`,
  `${reportDir}/ai`,
  `${reportDir}/cross-browser`,
  'allure-results',
  'allure-report',
  'screenshots',
  'videos',
  'logs'
];

for (const folder of folders) {
  fs.emptyDirSync(folder);
}

console.log('Old reports, screenshots, videos, traces and logs cleaned successfully.');
