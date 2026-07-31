/**
 * cucumber.android.js
 *
 * Android-optimized Cucumber configuration.
 *
 * Loads only what's needed for Android execution:
 *   - Only Android-tagged features
 *   - Only step definitions (all — each handles platform internally)
 *   - Optimized hooks with lazy web imports
 *   - Startup timing instrumentation
 *
 * Performance targets:
 *   - Environment + Config .......... < 50ms
 *   - Hooks ......................... < 80ms
 *   - Step Definitions .............. < 200ms
 *   - Cucumber Ready ................ < 2 seconds total from Driver Ready
 *
 * ════════════════════════════════════════════════════════════════
 * COMPARED TO cucumber.js (general-purpose):
 *   - NO features/api/ path (eliminates API feature parsing)
 *   - Startup timer prints per-phase timing
 *   - Environment markers for performance tracking
 * ════════════════════════════════════════════════════════════════
 */

'use strict';

const path = require('path');
// Load tsx hook BEFORE any .ts require (config files load before requireModule takes effect)
try { require('tsx'); } catch (_) {}
const startupTimer = require('./hooks/startup-timer').default || require('./hooks/startup-timer');

startupTimer.mark('Cucumber Config Loaded');

const REPORT_DIR = process.env.REPORT_DIR || 'reports/android';

module.exports = {
  default: {
    // Only load Android-optimized hooks (which lazy-load web deps)
    requireModule: ['tsx'],
    require: [
      'hooks/hooks.ts',
      'step-definitions/*.steps.ts'
    ],
    // Only scan feature files (all have @android tag; no API features scanned)
    paths: ['features/**/*.feature'],
    format: [
      'summary',
      `json:${REPORT_DIR}/cucumber-report.json`,
      `html:${REPORT_DIR}/cucumber-html-report.html`
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    retry: Number(process.env.RETRIES || 1),
    parallel: Number(process.env.PARALLEL || 1),
    timeout: Number(process.env.TIMEOUT || 60000) + 10000
  }
};
