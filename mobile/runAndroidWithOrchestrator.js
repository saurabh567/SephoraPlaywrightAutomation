#!/usr/bin/env node
/**
 * runAndroidWithOrchestrator.js — ENTERPRISE REFACTOR
 *
 * Unified Android execution using the deterministic StartupOrchestrator.
 *
 * ════════════════════════════════════════════════════════════════
 * CRITICAL: Loads .env.android BEFORE any module initialization
 * so that ExecutionMode correctly detects ANDROID_NATIVE or
 * ANDROID_WEB based on environment variables.
 * ════════════════════════════════════════════════════════════════
 *
 * Enterprise lifecycle (16 deterministic steps):
 *   [01] Validate Environment
 *   [02] Kill Stale ADB + Emulator Processes
 *   [03] Boot Emulator (ANDROID_AVD only, no snapshots unless enabled)
 *   [04] Verify Device Connectivity
 *   [05] Verify Application Installed (native mode)
 *   [06] Start Appium Server
 *   [07] Verify Appium Health
 *   [08] Create Android Driver
 *   [09] Launch Amazon App
 *   [10] Initialize Application (language, permissions, onboarding, sign-in skip)
 *   [11] Verify Dashboard
 *   [12] Execute Tests (Cucumber)
 *   [13] Cleanup — driver quit → Appium shutdown → emulator shutdown
 *
 * ERROR HANDLING:
 *   - Every phase logs retry count + elapsed time
 *   - If device goes "offline", auto-recover via ADB restart
 *   - Cucumber failures include full stack trace and diagnostic output
 *   - Never report success when any phase fails
 *
 * Usage:
 *   node mobile/runAndroidWithOrchestrator.js
 *   HEADLESS=true node mobile/runAndroidWithOrchestrator.js
 *
 * Environment:
 *   TEST_PLATFORM=ANDROID (from .env.android is loaded automatically)
 *   BROWSER_NAME=Chrome    → ANDROID_WEB mode
 *   APP_PACKAGE set        → ANDROID_NATIVE mode
 *   ANDROID_AVD=Pixel_9_Pro  (required — no hardcoded fallback)
 *   ANDROID_ALLOW_SNAPSHOTS=false (default) — use -no-snapshot-load -no-snapshot-save
 */

// ════════════════════════════════════════════════════════════════
// Load .env.android FIRST — before any module requires
// This ensures TEST_PLATFORM, APP_PACKAGE, BROWSER_NAME, etc.
// are available for ExecutionMode detection.
// ════════════════════════════════════════════════════════════════
try {
  var dotenv = require('dotenv');
  var envPath = require('path').join(__dirname, '..', '.env.android');
  dotenv.config({ path: envPath });
  console.log('[runAndroid] Loaded .env.android from: ' + envPath);
} catch (_) {
  console.log('[runAndroid] dotenv unavailable — using existing environment');
}
process.env.TEST_PLATFORM = 'ANDROID';

var path = require('path');
var fs = require('fs');
var { StartupOrchestrator } = require('./lifecycle');
var ExecutionMode = require('../framework/common/ExecutionMode');

// ════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    ANDROID EXECUTION — ENTERPRISE STARTUP PIPELINE           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Verify critical configuration ───────────────────────────
  var avdName = process.env.ANDROID_AVD || process.env.ANDROID_AVD_NAME || '';
  if (!avdName) {
    console.error('[FATAL] ANDROID_AVD is not configured.');
    console.error('  Set ANDROID_AVD in .env.android or export it before running.');
    console.error('  Example: ANDROID_AVD=Pixel_9_Pro');
    process.exit(1);
  }

  var executionMode = ExecutionMode.getExecutionMode();
  console.log('  Configuration:');
  console.log('    Execution Mode:  ' + executionMode);
  console.log('    ANDROID_AVD:     ' + avdName);
  console.log('    HEADLESS:        ' + (process.env.HEADLESS || 'false'));
  console.log('    APP_PACKAGE:     ' + (process.env.APP_PACKAGE || '(web mode)'));
  console.log('    BROWSER_NAME:    ' + (process.env.BROWSER_NAME || '(native mode)'));
  console.log('    Allow Snapshots: ' + (process.env.ANDROID_ALLOW_SNAPSHOTS || 'false'));
  console.log('');

  // ── Orchestrator setup ─────────────────────────────────────
  var orchestrator = new StartupOrchestrator({
    platform: 'android',
    appiumHost: process.env.APPIUM_HOST || '127.0.0.1',
    appiumPort: process.env.APPIUM_PORT || 4723,
    config: {
      avdName: avdName,
      allowSnapshots: process.env.ANDROID_ALLOW_SNAPSHOTS === 'true'
    }
  });

  // ── Cucumber test function ─────────────────────────────────
  async function runCucumberTests(driver) {
    console.log('[Pipeline] 🧪 Driver ready — launching Cucumber...');
    console.log('[Pipeline] Cucumber will execute Android feature files');
    console.log('');

    var { spawnSync } = require('child_process');

    var env = Object.assign({}, process.env, {
      TEST_PLATFORM: 'ANDROID',
      APPIUM_AUTO_LAUNCH: 'false',  // Lifecycle already launched the app
      DEVICE_READY: 'true',
      STARTUP_COMPLETED: 'true'
    });

    console.time('cucumber-execution');

    var result = spawnSync('npm', ['run', 'test:android:raw'], {
      stdio: 'pipe',
      env: env,
      shell: true,
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024
    });

    console.timeEnd('cucumber-execution');

    var exitCode = (result && result.status !== null) ? result.status : 1;
    var stdout   = (result.stdout || '').toString();
    var stderr   = (result.stderr || '').toString();

    // Always print Cucumber output
    if (stdout.trim()) { console.log(stdout); }
    if (stderr.trim()) { console.error(stderr); }

    if (exitCode !== 0) {
      var errorParts = [
        'CucumberExecutionFailed',
        'Cucumber exited with code ' + exitCode
      ];

      var fullOutput = stderr + '\n' + stdout;
      var errorLines = fullOutput.split('\n').filter(function(l) {
        return l.indexOf('Error') >= 0 ||
               l.indexOf('ReferenceError') >= 0 ||
               l.indexOf('TypeError') >= 0 ||
               l.indexOf('SyntaxError') >= 0 ||
               l.indexOf('FAIL') >= 0 ||
               l.indexOf('Exception') >= 0 ||
               l.indexOf('AssertionError') >= 0;
      });

      if (errorLines.length > 0) {
        errorParts.push('Errors detected:');
        errorLines.forEach(function(l) { errorParts.push('  ' + l.trim()); });
      }

      var errorMessage = errorParts.join('\n');
      console.error('\n[Orchestrator] ❌ Cucumber execution FAILED (exit code: ' + exitCode + ')');

      // Extract and print stack trace
      var stackMatch = fullOutput.match(/(\s+at\s+[\s\S]{1,500})/);
      if (stackMatch) {
        console.error('[Orchestrator] Stack trace:\n' + stackMatch[0]);
      }

      throw new Error(errorMessage);
    }

    console.log('[Orchestrator] ✅ Cucumber tests completed (exit code: 0)');
    return 0;
  }

  // ── Execute pipeline ──────────────────────────────────────
  try {
    var pipelineResult = await orchestrator.startAndroid(runCucumberTests);

    if (pipelineResult.success) {
      console.log('\n  ✅ Android pipeline completed successfully');
      console.log('  Total duration: ' + pipelineResult.metrics.totalDuration + 'ms');
      await orchestrator.shutdown();
      process.exit(0);
    } else {
      console.error('\n  ❌ Android pipeline failed');
      console.error('  See failure details above for the specific phase that failed.');
      await orchestrator.shutdown(true);
      process.exit(1);
    }
  } catch (err) {
    console.error('\n  ❌ Android execution failed with exception:');
    console.error('  ' + err.message);
    if (err.stack) {
      console.error('  Stack trace:');
      console.error(err.stack);
    }
    try {
      await orchestrator.shutdown(true);
    } catch (shutdownErr) {
      console.error('[Orchestrator] Shutdown error: ' + shutdownErr.message);
    }
    process.exit(1);
  }
}

main().catch(function(err) {
  console.error('[Android Orchestrator] Fatal error:', err.message);
  if (err.stack) { console.error(err.stack); }
  process.exit(2);
});
