#!/usr/bin/env node
/**
 * runAndroidWithOrchestrator.js
 *
 * Unified Android execution using the enterprise StartupOrchestrator.
 * Replaces the ad-hoc lifecycle in utils/runAndroidWithLifecycle.js.
 *
 * Lifecycle (via AndroidStartupPipeline):
 *   [01] Validate Environment     — Java, Android SDK, adb, Appium, Node
 *   [02] Detect Device(s)         — adb devices with retry
 *   [03] Boot Emulator            — Boot AVD, wait for boot completed
 *   [04] Verify Device Connectivity — adb shell, unlock
 *   [05] Start Appium Server      — Spawn Appium with retry
 *   [06] Verify Appium Health     — Wait for /status endpoint
 *   [07] Create Android Driver    — WebDriverIO session
 *   [08] Launch Chrome            — Open browser
 *   [09] Navigate to Target URL   — Go to BASE_URL
 *   [10] Execute Tests            — Run Cucumber
 *   [11] Cleanup                  — Stop Appium, stop emulator
 *
 * Usage:
 *   node mobile/runAndroidWithOrchestrator.js
 */

const path = require('path');
const { StartupOrchestrator } = require('./lifecycle');

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  Android Execution via StartupOrchestrator');
  console.log('══════════════════════════════════════════════\n');

  const orchestrator = new StartupOrchestrator({
    platform: 'android',
    appiumHost: process.env.APPIUM_HOST || '127.0.0.1',
    appiumPort: process.env.APPIUM_PORT || 4723
  });

  // Test function that runs Cucumber
  async function runAndroidTests(driver) {
    console.log('[Android] Driver ready, launching Cucumber tests...');
    const { spawnSync } = require('child_process');
    const env = {
      ...process.env,
      TEST_PLATFORM: 'ANDROID',
      APPIUM_AUTO_LAUNCH: 'false',  // Lifecycle already launched
      DEVICE_READY: 'true'
    };

    const result = spawnSync('npm', ['run', 'test:android:raw'], {
      stdio: 'inherit',
      env,
      shell: true,
      timeout: 600000
    });
    return result && result.status === 0 ? 0 : (result ? result.status : 1);
  }

  const pipelineResult = await orchestrator.startAndroid(runAndroidTests);

  if (pipelineResult.success) {
    console.log('\n  [✓] Android tests completed successfully');
    await orchestrator.shutdown();
    process.exit(0);
  } else {
    console.error('\n  [✗] Android tests failed');
    await orchestrator.shutdown(true);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Android Orchestrator] Fatal:', err.message);
  process.exit(2);
});
