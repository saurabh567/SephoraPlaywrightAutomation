/**
 * WaitUtils.js
 *
 * Enterprise-grade utility for Promise-based timed waits and polling.
 *
 * Centralizes all sleep/timeout logic so individual classes do not
 * need to define their own private _sleep() methods.
 *
 * Usage:
 *   const WaitUtils = require('../utils/WaitUtils');
 *   await WaitUtils.sleep(3000);           // Fixed sleep
 *   await WaitUtils.waitForCondition(...); // Polling with timeout
 *
 * Design:
 *   - sleep(ms) — Promise-based setTimeout wrapper
 *   - waitForCondition(fn, timeoutMs, intervalMs) — Polls fn() until truthy or timeout
 *   - No external dependencies beyond core Node.js
 */

'use strict';

class WaitUtils {

  /**
   * Promise-based sleep for the specified duration.
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static sleep(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Poll a condition function until it returns a truthy value or the timeout expires.
   *
   * @param {Function} conditionFn - Async or sync function that returns truthy when condition is met
   * @param {number}   timeoutMs   - Maximum time to keep polling (ms)
   * @param {number}   intervalMs  - Polling interval (ms)
   * @param {string}   description - Optional human-readable description for error messages
   * @returns {Promise<any>} The truthy value returned by conditionFn
   * @throws {Error} If timeout expires before condition is met
   */
  static async waitForCondition(conditionFn, timeoutMs, intervalMs, description) {
    timeoutMs  = timeoutMs  || 30000;
    intervalMs = intervalMs || 1000;
    var deadline   = Date.now() + timeoutMs;
    var lastError  = null;
    var retries    = 0;

    while (Date.now() < deadline) {
      retries++;
      try {
        var result = await conditionFn();
        if (result) {
          return result;
        }
      } catch (err) {
        lastError = err;
      }
      await WaitUtils.sleep(intervalMs);
    }

    var desc = description || 'condition';
    throw new Error(
      '[WaitUtils] Timeout waiting for "' + desc + '" (' + timeoutMs + 'ms, ' + retries + ' retries). ' +
      (lastError ? 'Last error: ' + lastError.message : 'Condition never returned truthy.')
    );
  }

  /**
   * Wait until the specified timeout or until a condition stops throwing.
   *
   * @param {Function} fn         - Async function to retry until no error
   * @param {number}   timeoutMs  - Max wait time
   * @param {number}   intervalMs - Retry interval
   * @param {string}   description - Description for logging
   * @returns {Promise<any>} The return value of fn()
   */
  static async retryUntilNoError(fn, timeoutMs, intervalMs, description) {
    timeoutMs  = timeoutMs  || 30000;
    intervalMs = intervalMs || 1000;
    var deadline = Date.now() + timeoutMs;
    var lastError = null;

    while (Date.now() < deadline) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        await WaitUtils.sleep(intervalMs);
      }
    }

    throw new Error(
      '[WaitUtils] Retry timeout for "' + (description || 'operation') + '" (' + timeoutMs + 'ms). ' +
      'Last error: ' + (lastError ? lastError.message : 'unknown')
    );
  }
}

module.exports = WaitUtils;
