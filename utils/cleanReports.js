/**
 * cleanReports.js
 *
 * Deletes old generated artifacts (reports, screenshots, videos, traces, logs)
 * before a new test execution starts.
 *
 * NOTE: This only removes file artifacts. Browser/mobile app state (cookies,
 * localStorage, sessionStorage, IndexedDB) is cleared per-scenario by
 * framework/common/BrowserCacheCleanup.js (called from hooks/hooks.js).
 */
const fs = require('fs-extra');

const reportDir = process.env.REPORT_DIR || 'reports';

const folders = [
  `${reportDir}/screenshots`,
  `${reportDir}/videos`,
  `${reportDir}/traces`,
  `${reportDir}/ai`,
  `${reportDir}/cross-browser`,
  'screenshots',
  'videos',
  'logs',
  // Platform root folders (contain cucumber-report.json, etc.)
  'reports/web',
  'reports/android',
  'reports/ios',
  'reports/combined'
];

for (const folder of folders) {
  fs.emptyDirSync(folder);
}

console.log('Old reports, screenshots, videos, traces and logs cleaned successfully.');
