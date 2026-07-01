#!/usr/bin/env node

/**
 * cleanReports.js
 *
 * Deletes stale report and execution artifacts before running the test suite.
 * Ensures every execution starts from a completely clean state.
 *
 * Usage:
 *   node utils/cleanReports.js          # run as standalone
 *   const clean = require('./cleanReports'); await clean();  # import as module
 *
 * Directories deleted:
 *   reports/
 *   playwright-report/
 *   test-results/
 *
 * Exits with code 0 always (cleanup failures are logged, not fatal).
 *
 * ORCHESTRATOR_RUN env var:
 *   When set to 'true', this script skips cleanup entirely. This prevents
 *   duplicate cleanup when the orchestrator (runAllPlatformsOrchestrator.js)
 *   already called cleanup at the top and sets ORCHESTRATOR_RUN=true for
 *   all spawned child processes (which may have pretest hooks that call
 *   cleanReports again).
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TARGET_DIRS = [
  'reports',
  'playwright-report',
  'test-results',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().split('.')[0].replace('T', ' ');
  console.log(`[cleanReports] ${ts} ${msg}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function cleanReports() {
  // ── ORCHESTRATOR_RUN guard ──────────────────────────────────────────────
  // When the orchestrator (runAllPlatformsOrchestrator.js) is driving
  // execution, it already called cleanReports once at the top. All nested
  // scripts (spawned via npm run) inherit ORCHESTRATOR_RUN=true and should
  // skip cleanup to avoid redundant file-system I/O and log noise.
  if (process.env.ORCHESTRATOR_RUN === 'true') {
    log('ORCHESTRATOR_RUN=true — skipping cleanup (already done by orchestrator)');
    return { deleted: [], missing: [], skipped: true };
  }

  const startTime = Date.now();
  const deleted = [];
  const missing = [];

  log('Starting cleanup of stale execution artifacts...');

  for (const dir of TARGET_DIRS) {
    const fullPath = path.join(ROOT, dir);
    try {
      const exists = await fs.pathExists(fullPath);
      if (exists) {
        await fs.remove(fullPath);
        deleted.push(dir);
        log(`  ✔ removed: ${dir}/`);
      } else {
        missing.push(dir);
        log(`  - skipped (not found): ${dir}/`);
      }
    } catch (err) {
      log(`  ⚠ error deleting ${dir}/: ${err.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = (Date.now() - startTime) + 'ms';

  console.log('');
  console.log('='.repeat(56));
  console.log('  CLEANUP SUMMARY');
  console.log('='.repeat(56));
  console.log(`  Deleted:  ${deleted.length > 0 ? deleted.join(', ') : 'none'}`);
  console.log(`  Missing:  ${missing.length > 0 ? missing.join(', ') : 'none'}`);
  console.log(`  Time:     ${elapsed}`);
  console.log('');
  console.log('  ✔ Previous execution artifacts cleaned successfully.');
  console.log('  Starting fresh test execution...');
  console.log('='.repeat(56));
  console.log('');

  return { deleted, missing, elapsed };
}

// ── CLI entry ──────────────────────────────────────────────────────────────
if (require.main === module) {
  cleanReports().catch((err) => {
    console.error(`[cleanReports] FATAL: ${err.message}`);
    process.exit(0); // Never fail the build over cleanup
  });
}

module.exports = cleanReports;
