/**
 * startup-timer.js
 *
 * Enterprise-grade startup performance instrumentation.
 *
 * Tracks and prints timing for every phase of Cucumber/framework bootstrap.
 *
 * Usage:
 *   const timer = require('./startup-timer');
 *   timer.mark('Loading Environment');
 *   // ... heavy work ...
 *   timer.mark('Loading Hooks');
 *   // ... more work ...
 *   timer.report();
 *
 * Output:
 *   Loading Environment ....... 35ms
 *   Loading Hooks ............. 60ms
 *   Loading Steps ............. 140ms
 *   Cucumber Ready ............ 255ms
 *
 * Thread-safe — uses a single shared Map across all requires.
 */

'use strict';

// Module-level shared state — persists across all requires of this module
// due to Node.js module caching.
const _marks = [];
const _startTime = Date.now();
let _reported = false;

class StartupTimer {
  /**
   * Record a timing mark.
   * @param {string} label - Description of what was loaded
   * @param {number} [duration] - Optional explicit duration (auto-calculated if omitted)
   */
  static mark(label, duration) {
    if (duration !== undefined) {
      _marks.push({ label, elapsed: duration, ts: Date.now() });
    } else {
      _marks.push({ label, elapsed: Date.now() - _startTime, ts: Date.now() });
    }
  }

  /**
   * Record the time taken by a synchronous operation.
   * @param {string} label - Description
   * @param {function} fn - Synchronous function to time
   * @returns {*} Result of the function
   */
  static timeSync(label, fn) {
    const start = Date.now();
    try {
      return fn();
    } finally {
      _marks.push({ label, elapsed: Date.now() - start, ts: Date.now() });
    }
  }

  /**
   * Record the time taken by an async operation.
   * @param {string} label - Description
   * @param {function} fn - Async function to time
   * @returns {Promise<*>} Result of the function
   */
  static async timeAsync(label, fn) {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      _marks.push({ label, elapsed: Date.now() - start, ts: Date.now() });
    }
  }

  /**
   * Record a lazy/dynamic require.
   * @param {string} label - Description
   * @param {string} modulePath - Module path to require
   * @returns {*} The required module
   */
  static requireLazy(label, modulePath) {
    return StartupTimer.timeSync(label, () => require(modulePath));
  }

  /**
   * Print the full timing report to console.
   * Only prints once — subsequent calls are no-ops.
   */
  static report() {
    if (_reported) return;
    _reported = true;

    const total = Date.now() - _startTime;

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   STARTUP PERFORMANCE REPORT                ║');
    console.log('╚══════════════════════════════════════════════╝');

    if (_marks.length === 0) {
      console.log('  No timing marks recorded.');
      console.log('  Total: ' + total + 'ms');
      console.log('');
      return;
    }

    // Calculate per-mark durations (difference between consecutive marks)
    let previousElapsed = 0;
    for (let i = 0; i < _marks.length; i++) {
      const m = _marks[i];
      const duration = m.elapsed - previousElapsed;
      previousElapsed = m.elapsed;

      const paddedLabel = (m.label + ' ').padEnd(45, '.');
      console.log('  ' + paddedLabel + ' ' + duration + 'ms');
    }

    console.log('  ' + ('Total' + ' ').padEnd(45, '.') + ' ' + total + 'ms');
    console.log('');
  }

  /**
   * Get raw timing data.
   * @returns {Array<{label: string, elapsed: number}>}
   */
  static getMarks() {
    return _marks.slice();
  }

  /**
   * Get total elapsed time since module creation.
   * @returns {number}
   */
  static getTotal() {
    return Date.now() - _startTime;
  }
}

module.exports = StartupTimer;
