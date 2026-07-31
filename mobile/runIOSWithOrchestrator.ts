#!/usr/bin/env node
import path from 'path';
import { StartupOrchestrator } from './lifecycle';
/**
 * runIOSWithOrchestrator.js
 *
 * Unified iOS execution using the enterprise StartupOrchestrator.
 * Replaces the ad-hoc lifecycle in utils/runIOSWithLifecycle.js.
 *
 * Lifecycle (via IosStartupPipeline):
 *   [01] Validate Environment     — Xcode, xcodebuild, simctl, Appium, Node
 *   [02] Detect Simulator         — simctl list with retry
 *   [03] Boot Simulator           — Boot simulator, wait for boot completed
 *   [04] Unlock Simulator         — Dismiss lock screen
 *   [05] Verify WDA Installation  — Check WebDriverAgent presence
 *   [06] Build WDA (if required)  — xcodebuild with retry
 *   [07] Launch WDA               — Start WDA on simulator
 *   [08] Verify WDA Health        — Wait for WDA health endpoint
 *   [09] Start Appium Server      — Spawn Appium with retry
 *   [10] Verify Appium Health     — Wait for /status endpoint
 *   [11] Create iOS Driver        — WebDriverIO Safari session
 *   [12] Launch Safari            — Open browser (only after WDA + Appium ready)
 *   [13] Navigate to Target URL   — Go to BASE_URL
 *   [14] Execute Tests            — Run Cucumber
 *   [15] Cleanup                  — Stop WDA, Appium, simulator
 *
 * Critical guarantee: Safari NEVER launches before WDA is healthy.
 * Steps 05-08 (WDA verification/build/launch/health) complete before
 * Steps 09-12 (Appium/Driver/Safari) start.
 *
 * Usage:
 *   node mobile/runIOSWithOrchestrator.js
 */

// Load iOS-specific environment variables (.env.ios)
// This ensures BROWSER_NAME, DEVICE_NAME, PLATFORM_VERSION, UDID, etc.
// are available when constructing capabilities for the Appium session.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.ios') });
} catch (_: any) {
  // dotenv may not be installed or .env.ios may not exist
  console.log('[iOS] Note: .env.ios not loaded (dotenv unavailable or file missing)');
}

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  iOS Execution via StartupOrchestrator');
  console.log('══════════════════════════════════════════════\n');

  const orchestrator = new StartupOrchestrator({
    platform: 'ios',
    appiumHost: process.env.APPIUM_HOST || '127.0.0.1',
    appiumPort: process.env.APPIUM_PORT || 4723
  });

  // Test function that runs Cucumber
  async function runIOSTests(driver: any) {
    console.log('[iOS] Driver ready, launching Cucumber tests...');
    const { spawnSync } = require('child_process');
    const env = {
      ...process.env,
      TEST_PLATFORM: 'IOS',
      APPIUM_AUTO_LAUNCH: 'false',  // Lifecycle already launched
      DEVICE_READY: 'true'
    };

    const result = spawnSync('npm', ['run', 'test:ios:raw'], {
      stdio: 'inherit',
      env,
      shell: true,
      timeout: 600000
    });
    return result && result.status === 0 ? 0 : (result ? result.status : 1);
  }

  const pipelineResult = await orchestrator.startIOS(runIOSTests);

  if (pipelineResult.success) {
    console.log('\n  [✓] iOS tests completed successfully');
  } else {
    console.error('\n  [✗] iOS tests failed');
  }

  // ── Shutdown everything ─────────────────────────────────────────────
  await orchestrator.shutdown(!pipelineResult.success);

  // ── Shutdown simulator (unless KEEP_IOS_SIMULATOR=true) ────────────
  if (process.env.KEEP_IOS_SIMULATOR !== 'true') {
    try {
      var DeviceManager = require('./lifecycle/DeviceManager');
      var udid = process.env.UDID || '';
      if (udid) {
        console.log('[iOS] Shutting down simulator ' + udid + '...');
        await DeviceManager.shutdownIOSSimulator(udid);
      }
    } catch (e: any) {
      console.warn('[iOS] Simulator shutdown warning: ' + e.message);
    }
  } else {
    console.log('[iOS] KEEP_IOS_SIMULATOR=true — simulator left running');
  }

  process.exit(pipelineResult.success ? 0 : 1);
}

main().catch(err => {
  console.error('[iOS Orchestrator] Fatal:', err.message);
  process.exit(2);
});
