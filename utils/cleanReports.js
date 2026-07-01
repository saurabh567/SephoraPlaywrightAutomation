/**
 * cleanReports.js
 *
 * Deletes old generated artifacts (reports, screenshots, videos, traces, logs)
 * before a new test execution starts.
 *
 * Accepts optional --platform flag to clean only a specific platform.
 * Usage:
 *   node utils/cleanReports.js                    → clean all platforms
 *   node utils/cleanReports.js --platform web     → clean only web reports
 *   node utils/cleanReports.js --platform android → clean only android reports
 *   node utils/cleanReports.js --platform ios     → clean only ios reports
 *
 * NOTE: This only removes file artifacts. Browser/mobile app state (cookies,
 * localStorage, sessionStorage, IndexedDB) is cleared per-scenario by
 * framework/common/BrowserCacheCleanup.js (called from hooks/hooks.js).
 */
const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Parse --platform argument
const platformIndex = process.argv.indexOf('--platform');
const platformFilter = platformIndex >= 0 ? process.argv[platformIndex + 1] : null;

const reportDir = process.env.REPORT_DIR || 'reports';

// Platform-specific folders
const platformFolders = {
  web: [
    `${reportDir}/web`,
    `${reportDir}/screenshots`,
    `${reportDir}/videos`,
    `${reportDir}/traces`,
    `${reportDir}/ai`,
    'screenshots',
    'videos',
  ],
  android: [
    `${reportDir}/android`,
    `${reportDir}/ai`,
    'logs',
  ],
  ios: [
    `${reportDir}/ios`,
    `${reportDir}/ai`,
    'logs',
  ],
};

// When running under orchestrator, skip cleaning to preserve previous platform reports
if (process.env.ORCHESTRATOR_RUN === 'true') {
  console.log('[cleanReports] Orchestrator mode — skipping per-platform clean to preserve cross-platform reports');
  // Still clean screenshots, videos, traces (per-session artifacts)
  const lightClean = [`${reportDir}/screenshots`, `${reportDir}/videos`, `${reportDir}/traces`];
  for (const folder of lightClean) {
    const resolved = path.resolve(ROOT, folder);
    if (fs.existsSync(resolved)) {
      fs.emptyDirSync(resolved);
    }
  }
  process.exit(0);
}

// Determine which folders to clean
let folders = [];

if (platformFilter) {
  // Clean only the specified platform
  const pf = platformFilter.toLowerCase();
  const mapped = platformFolders[pf];
  if (mapped) {
    folders = mapped;
  } else {
    console.warn(`[cleanReports] Unknown platform: ${pf}. Cleaning all.`);
    folders = [
      `${reportDir}/web`,
      `${reportDir}/android`,
      `${reportDir}/ios`,
      `${reportDir}/screenshots`,
      `${reportDir}/videos`,
      `${reportDir}/traces`,
      `${reportDir}/ai`,
      `${reportDir}/cross-browser`,
      'screenshots',
      'videos',
      'logs',
      'reports/web',
      'reports/android',
      'reports/ios',
      'reports/combined',
    ];
  }
} else {
  // Clean all platform folders (legacy behavior)
  folders = [
    `${reportDir}/screenshots`,
    `${reportDir}/videos`,
    `${reportDir}/traces`,
    `${reportDir}/ai`,
    `${reportDir}/cross-browser`,
    'screenshots',
    'videos',
    'logs',
    // Platform root folders
    'reports/web',
    'reports/android',
    'reports/ios',
    'reports/combined',
  ];
}

for (const folder of folders) {
  const resolved = path.resolve(ROOT, folder);
  if (fs.existsSync(resolved)) {
    fs.emptyDirSync(resolved);
  }
}

console.log(`[cleanReports] Cleaned ${platformFilter ? `platform: ${platformFilter}` : 'all platforms'} — reports, screenshots, videos, traces and logs.`);
