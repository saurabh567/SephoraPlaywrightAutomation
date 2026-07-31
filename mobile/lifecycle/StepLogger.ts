/**
 * StepLogger.js
 *
 * Enterprise-grade structured logger for startup lifecycle phases.
 * Produces deterministic [STEP N] labeled logs with:
 *   - Phase name
 *   - PASS/FAIL status
 *   - Duration metrics
 *   - Root-cause error messages on failure
 *
 * Example output:
 *
 *   [STEP 01] Environment Validation
 *   [PASS]  (1240ms)
 *
 *   [STEP 02] Device Detection
 *   [FAIL]  (340ms)
 *   └── Root cause: No Android device or emulator detected via adb
 */

'use strict';

const STEP_PAD = 2;

class StepLogger {
  [key: string]: any;
  constructor() {
    this.steps = [];
    this.startTime = null;
    this.phaseStartTime = null;
    this.currentStep = 0;
    this.failed = false;
    this.failures = [];
  }

  /**
   * Begin the entire startup sequence and record overall start time.
   */
  begin() {
    this.startTime = Date.now();
    this.steps = [];
    this.currentStep = 0;
    this.failed = false;
    this.failures = [];
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        MOBILE STARTUP LIFECYCLE — ENTERPRISE MODE       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('  Started at: ' + new Date().toISOString());
    console.log('');
  }

  /**
   * Begin a new step.
   * @param {string} name - Display name for this step (e.g. "Environment Validation")
   */
  step(name: any) {
    if (this.failed) {
      return;
    }
    this.currentStep += 1;
    this.phaseStartTime = Date.now();
    var padded = String(this.currentStep).padStart(STEP_PAD, '0');
    console.log('[STEP ' + padded + '] ' + name);
  }

  /**
   * Mark the current step as PASSed.
   * @param {string} detail - optional detail message
   */
  pass(detail: any) {
    if (this.failed) {
      return;
    }
    var elapsed = Date.now() - this.phaseStartTime;
    var elapsedStr = '  (' + elapsed + 'ms)';
    console.log('[PASS]' + elapsedStr);
    if (detail) {
      console.log('  └── ' + detail);
    }
    console.log('');
    this.steps.push({
      step: this.currentStep,
      status: 'PASS',
      duration: elapsed,
      detail: detail || null
    });
  }

  /**
   * Mark the current step as FAILed, record root cause, and halt.
   * @param {string} rootCause - clear root-cause message
   */
  fail(rootCause: any) {
    var elapsed = Date.now() - this.phaseStartTime;
    var elapsedStr = '  (' + elapsed + 'ms)';
    console.log('[FAIL]' + elapsedStr);
    console.log('  └── Root cause: ' + rootCause);
    console.log('');
    this.failed = true;
    this.failures.push({
      step: this.currentStep,
      status: 'FAIL',
      duration: elapsed,
      rootCause: rootCause
    });
    this.steps.push({
      step: this.currentStep,
      status: 'FAIL',
      duration: elapsed,
      rootCause: rootCause
    });
  }

  /**
   * Mark the current step as SKIPPED (due to earlier failure or config).
   */
  skip(reason: any) {
    if (this.failed) {
      return;
    }
    console.log('[SKIP]  (' + reason + ')');
    console.log('');
    this.steps.push({
      step: this.currentStep,
      status: 'SKIP',
      duration: 0,
      detail: reason
    });
  }

  /**
   * Return true if any step has failed.
   */
  hasFailed() {
    return this.failed;
  }

  /**
   * Get total elapsed time for the entire sequence.
   */
  totalElapsed() {
    if (!this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * End the startup sequence and print summary metrics.
   */
  end() {
    var total = this.totalElapsed();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           STARTUP SEQUENCE COMPLETE                     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('  Total duration: ' + total + 'ms');
    console.log('  Steps executed: ' + this.steps.length);
    console.log('  Passed:         ' + this.steps.filter(function(s: any) { return s.status === 'PASS'; }).length);
    console.log('  Failed:         ' + this.steps.filter(function(s: any) { return s.status === 'FAIL'; }).length);
    console.log('  Skipped:        ' + this.steps.filter(function(s: any) { return s.status === 'SKIP'; }).length);
    console.log('');

    // Print per-step duration breakdown
    if (this.steps.length > 0) {
      console.log('  ── Phase Duration Breakdown ──');
      for (var i = 0; i < this.steps.length; i++) {
        var s = this.steps[i];
        var statusIcon = s.status === 'PASS' ? '✓' : (s.status === 'FAIL' ? '✗' : '–');
        var paddedName = String(s.step).padStart(STEP_PAD, '0');
        console.log('    ' + statusIcon + ' [STEP ' + paddedName + '] ' + s.duration + 'ms');
      }
      console.log('');
    }

    if (this.failures.length > 0) {
      console.log('  ── Failure Summary ──');
      for (var j = 0; j < this.failures.length; j++) {
        var f = this.failures[j];
        var fp = String(f.step).padStart(STEP_PAD, '0');
        console.log('    [STEP ' + fp + '] ' + f.rootCause);
      }
      console.log('');
    }

    return {
      totalDuration: total,
      steps: this.steps,
      failures: this.failures,
      passed: this.steps.filter(function(s: any) { return s.status === 'PASS'; }).length,
      failed: this.steps.filter(function(s: any) { return s.status === 'FAIL'; }).length
    };
  }
}

export default StepLogger;
