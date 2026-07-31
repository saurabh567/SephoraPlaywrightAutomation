/**
 * executionConfig.js
 *
 * SINGLE SOURCE OF TRUTH for execution mode across the entire framework.
 *
 * Every component — AI agents, Playwright engine, browser factory, hooks,
 * CI/CD, Docker — MUST consume execution mode from this module.
 * No hardcoded headless/headed values anywhere else in the codebase.
 *
 * IMPORTANT: Uses a Proxy to RE-EVALUATE process.env HEADLESS on every
 * property access. This ensures that changes to HEADLESS made after
 * require() are always picked up. No stale cached values.
 *
 * Source of truth priority:
 *   1. --headed CLI argument (process.argv)
 *   2. HEADLESS environment variable
 *   3. EXECUTION_MODE environment variable ('headed' | 'headless')
 *   4. Default: headless (for CI/speed)
 *
 * Usage:
 *   const execConfig = require('./config/executionConfig');
 *   // execConfig.isHeadless  → boolean (ALWAYS fresh)
 *   // execConfig.isHeaded    → boolean (ALWAYS fresh)
 *   // execConfig.mode        → 'HEADED' | 'HEADLESS'
 */

/**
 * Resolve the execution mode from environment and CLI args.
 * Reads fresh from process.env and process.argv every time.
 */
function resolveMode() {
  // 1. Check --headed in CLI args
  const hasHeadedArg = process.argv.some(a => a === '--headed');

  // 2. Check HEADLESS env var
  const rawHeadless = process.env.HEADLESS;
  const rawExecutionMode = process.env.EXECUTION_MODE
    ? process.env.EXECUTION_MODE.toLowerCase().trim()
    : null;

  let headless = true; // default

  if (hasHeadedArg) {
    headless = false;
  } else if (rawHeadless !== undefined && rawHeadless !== null && rawHeadless !== '') {
    const lower = String(rawHeadless).toLowerCase().trim();
    headless = !(lower === 'false' || lower === '0');
  } else if (rawExecutionMode) {
    headless = rawExecutionMode !== 'headed';
  }

  // Mobile platforms always run headed (no headless mode for Appium)
  const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
  if (platform === 'ANDROID' || platform === 'IOS') {
    headless = false;
  }

  // PWDEBUG forces headed
  if (process.env.PWDEBUG) {
    headless = false;
  }

  return headless;
}

function isHeadless() { return resolveMode(); }
function isHeaded() { return !resolveMode(); }
function mode() { return resolveMode() ? 'HEADLESS' : 'HEADED'; }

/**
 * Print the execution configuration banner.
 */
function printBanner(options = {}) {
  const h = resolveMode();
  const platform = (options.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
  const browser = options.browser || process.env.BROWSER || 'chromium';
  const workers = options.workers || process.env.PARALLEL || 1;
  const isCI = options.isCI || process.env.CI === 'true';

  console.log('');
  console.log('====================================');
  console.log('Execution Configuration');
  console.log('====================================');
  console.log('');
  console.log(`Platform          : ${platform}`);
  console.log(`Execution Mode    : ${h ? 'HEADLESS' : 'HEADED'}`);
  console.log(`Headless          : ${h}`);
  console.log(`Browser           : ${browser}`);
  console.log(`Workers           : ${workers}`);
  console.log(`CI                : ${isCI}`);
  console.log('');
  console.log('====================================');
  console.log('');
}

// Use a Proxy so EVERY property access re-evaluates from live env
const handler = {
  get(target, prop) {
    // Special methods
    if (prop === 'resolve') return resolveMode;
    if (prop === 'reset') return function() {};
    if (prop === 'printBanner') return printBanner;
    if (prop === 'toPlaywrightConfig') return function() { return { headless: resolveMode() }; };
    if (prop === 'toEnvOverrides') return function() {
      const h = resolveMode();
      return { HEADLESS: h ? 'true' : 'false', EXECUTION_MODE: h ? 'headless' : 'headed' };
    };
    if (prop === 'toString') return function() { return resolveMode() ? 'HEADLESS' : 'HEADED'; };
    if (prop === Symbol.toPrimitive) return function() { return resolveMode() ? 'HEADLESS' : 'HEADED'; };
    if (prop === 'isHeadless') return resolveMode();
    if (prop === 'isHeaded') return !resolveMode();
    if (prop === 'headless') return resolveMode();
    if (prop === 'headed') return !resolveMode();
    if (prop === 'mode') return resolveMode() ? 'HEADLESS' : 'HEADED';
    return target[prop];
  }
};

// Create a dummy target object - the Proxy handles all actual property access
const proxy = new Proxy({}, handler);
proxy.resolve = resolveMode;
proxy.reset = function() {};
proxy.printBanner = printBanner;

module.exports = proxy;
