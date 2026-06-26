#!/usr/bin/env node

/**
 * runIOSWithLifecycle.js
 *
 * Zero-manual iOS execution lifecycle:
 * 1. Start the configured iOS Simulator (default: iPhone 17 Pro Max)
 * 2. Boot the simulator if it is shutdown
 * 3. Wait until simulator is fully booted
 * 4. Start/check Appium server automatically
 * 5. Create a warmup WebDriver session to pre-compile WDA
 * 6. Close warmup session cleanly
 * 7. Execute iOS test scenarios (npm run test:ios:raw)
 * 8. Stop simulator after execution unless KEEP_IOS_SIMULATOR=true
 * 9. Stop Appium after execution unless KEEP_APPIUM_SERVER=true
 * 10. Generate lifecycle report under reports/ai/ios-execution-lifecycle-summary.md
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// --- Configuration ----------------------------------------------------------

const SIMULATOR_NAME = process.env.IOS_SIMULATOR_NAME || 'iPhone 17 Pro Max';

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT, 10) || 4723;
const KEEP_SIMULATOR = process.env.KEEP_IOS_SIMULATOR === 'true';
const KEEP_APPIUM = process.env.KEEP_APPIUM_SERVER === 'true';

const ROOT = path.resolve(__dirname, '..');
const LIFECYCLE_REPORT_DIR = path.join(ROOT, 'reports', 'ai');
const LIFECYCLE_REPORT_PATH = path.join(LIFECYCLE_REPORT_DIR, 'ios-execution-lifecycle-summary.md');

const IOS_TEST_CMD = 'npm run test:ios:raw';

// --- Result tracker ---------------------------------------------------------

const results = {
  simulatorAutoStart: 'SKIPPED',
  appiumAutoStart: 'SKIPPED',
  wdaWarmup: 'SKIPPED',
  iosTestExecuted: 'SKIPPED',
  simulatorAutoStop: 'SKIPPED',
  appiumAutoStop: 'SKIPPED',
};

function pass(label) { results[label] = 'PASS'; }
function fail(label) { results[label] = 'FAIL'; }

// --- Helper: wait for condition with polling --------------------------------

function waitFor(description, fn, timeoutMs = 120_000, intervalMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        return reject(new Error(`Timeout waiting for: ${description} (${timeoutMs}ms)`));
      }
      try {
        const ok = fn();
        if (ok) return resolve(true);
      } catch (e) {
        // ignore, retry
      }
      setTimeout(poll, intervalMs);
    };
    poll();
  });
}

// --- Check if a TCP port is listening ---------------------------------------

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// --- Simulator helper functions ---------------------------------------------

function xcrun(args) {
  const out = execSync('xcrun ' + args.join(' '), {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 512 * 1024,
  });
  return out.trim();
}

function getSimulatorUDID(name) {
  try {
    const out = xcrun(['simctl', 'list', 'devices', '--json']);
    const data = JSON.parse(out);
    const allDevices = data.devices || {};
    for (const runtime of Object.keys(allDevices)) {
      const devices = allDevices[runtime];
      for (const device of devices) {
        if (device.name === name) {
          return device.udid;
        }
      }
    }
    return null;
  } catch (e) {
    console.warn('[lifecycle] Could not list simulators:', e.message);
    return null;
  }
}

function getSimulatorState(udid) {
  try {
    const out = xcrun(['simctl', 'list', 'devices', '--json']);
    const data = JSON.parse(out);
    const allDevices = data.devices || {};
    for (const runtime of Object.keys(allDevices)) {
      const devices = allDevices[runtime];
      for (const device of devices) {
        if (device.udid === udid) {
          return device.state;
        }
      }
    }
    return 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

function isSimulatorBooted(udid) {
  return getSimulatorState(udid) === 'Booted';
}

function bootSimulator(udid) {
  console.log(`[lifecycle] Booting simulator ${udid} ...`);
  xcrun(['simctl', 'boot', udid]);
}

function shutdownSimulator(udid) {
  console.log(`[lifecycle] Shutting down simulator ${udid} ...`);
  try {
    xcrun(['simctl', 'shutdown', udid]);
  } catch (e) {
    console.warn('[lifecycle] Shutdown command returned:', e.message);
  }
}

function waitForBootComplete() {
  return waitFor('SpringBoard to launch', () => {
    try {
      const out = execSync('pgrep -x SpringBoard', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return out.trim().length > 0;
    } catch (e) {
      return false;
    }
  }, 120_000, 2000);
}

// --- Start simulator --------------------------------------------------------

async function startSimulator() {
  console.log(`[lifecycle] Checking iOS simulator (name: "${SIMULATOR_NAME}") ...`);

  const udid = getSimulatorUDID(SIMULATOR_NAME);

  if (!udid) {
    throw new Error(
      `Simulator "${SIMULATOR_NAME}" not found. ` +
      'Use "xcrun simctl list devices" to see available simulators.'
    );
  }

  console.log(`[lifecycle] Found simulator UDID: ${udid}`);

  const state = getSimulatorState(udid);
  console.log(`[lifecycle] Simulator state: ${state}`);

  if (state === 'Booted') {
    console.log('[lifecycle] Simulator is already booted.');
    pass('simulatorAutoStart');
    return { udid };
  }

  console.log('[lifecycle] Booting simulator ...');
  bootSimulator(udid);

  await waitFor('simulator to be booted', () => isSimulatorBooted(udid), 120_000, 2000);
  console.log('[lifecycle] Simulator is now booted.');

  await waitForBootComplete();
  console.log('[lifecycle] Simulator SpringBoard is running — fully ready.');

  pass('simulatorAutoStart');
  return { udid };
}

// --- Start Appium -----------------------------------------------------------

async function startAppium() {
  console.log('[lifecycle] Checking Appium ...');

  const listening = await isPortListening(APPIUM_HOST, APPIUM_PORT);

  if (listening) {
    console.log(`[lifecycle] Appium already listening on ${APPIUM_HOST}:${APPIUM_PORT}.`);
    pass('appiumAutoStart');
    return;
  }

  console.log('[lifecycle] Starting Appium server ...');
  const appium = spawn('npx', ['appium'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, APPIUM_HOST, APPIUM_PORT },
  });
  appium.unref();

  await waitFor(
    `Appium listening on ${APPIUM_HOST}:${APPIUM_PORT}`,
    () => isPortListening(APPIUM_HOST, APPIUM_PORT),
    60_000,
    2000
  );
  console.log('[lifecycle] Appium is now listening.');

  pass('appiumAutoStart');
}

// --- WDA warmup: create a lightweight session to compile WDA -----------------

async function warmupWDA() {
  console.log('[lifecycle] Warming up WebDriverAgent (WDA) with a test session ...');

  try {
    const { remote } = require('webdriverio');

    const warmupCaps = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': process.env.DEVICE_NAME || SIMULATOR_NAME,
      'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
      'appium:browserName': 'Safari',
      'appium:udid': process.env.UDID || undefined,
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 180,
      'appium:wdaLaunchTimeout': 180000,
      'appium:wdaConnectionTimeout': 180000,
      'appium:useNewWDA': false,
      'appium:autoAcceptAlerts': true,
      'appium:autoDismissAlerts': false,
    };

    if (process.env.UDID) warmupCaps['appium:udid'] = process.env.UDID;

    const warmupDriver = await remote({
      protocol: 'http',
      hostname: APPIUM_HOST,
      port: APPIUM_PORT,
      path: '/',
      logLevel: 'error',
      connectionRetryTimeout: 180000,
      connectionRetryCount: 2,
      capabilities: warmupCaps,
    });

    console.log('[lifecycle] WDA warmup session created successfully.');

    // Get a context to confirm Safari/WDA is fully ready
    try {
      const contexts = await warmupDriver.getContexts();
      console.log(`[lifecycle] Available contexts: ${contexts.join(', ')}`);
    } catch (e) {
      console.log(`[lifecycle] Context check: ${e.message}`);
    }

    // Navigate to a simple page to fully load Safari
    try {
      await warmupDriver.url('https://www.amazon.in');
      console.log('[lifecycle] Warmup navigation completed.');
    } catch (e) {
      console.log(`[lifecycle] Warmup navigation: ${e.message}`);
    }

    // Close warmup session
    await warmupDriver.deleteSession();
    console.log('[lifecycle] WDA warmup session closed cleanly.');

    pass('wdaWarmup');
  } catch (err) {
    console.warn(`[lifecycle] WDA warmup failed (tests may still work): ${err.message}`);
    fail('wdaWarmup');
  }
}

// --- Run iOS tests ----------------------------------------------------------

async function runIOSTests() {
  console.log('[lifecycle] Running iOS tests ...');
  console.log(`[lifecycle] Command: ${IOS_TEST_CMD}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  return new Promise((resolve) => {
    const child = spawn(IOS_TEST_CMD, [], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        APPIUM_HOST,
        APPIUM_PORT,
      },
    });

    child.on('exit', (code) => {
      console.log('\n────────────────────────────────────────────────────────────────');
      if (code === 0) {
        console.log('[lifecycle] iOS test scenarios completed successfully.');
        pass('iosTestExecuted');
      } else {
        console.log('[lifecycle] iOS test scenarios finished with exit code ' + code);
        fail('iosTestExecuted');
      }
      resolve(code === 0);
    });

    child.on('error', (err) => {
      console.error('[lifecycle] Failed to spawn test command:', err.message);
      fail('iosTestExecuted');
      resolve(false);
    });
  });
}

// --- Stop simulator ---------------------------------------------------------

async function stopSimulator(udid) {
  if (KEEP_SIMULATOR) {
    console.log('[lifecycle] KEEP_IOS_SIMULATOR=true — skipping simulator shutdown.');
    pass('simulatorAutoStop');
    return;
  }

  if (!udid) {
    console.warn('[lifecycle] No UDID available — cannot stop simulator.');
    fail('simulatorAutoStop');
    return;
  }

  console.log('[lifecycle] Shutting down simulator ...');
  try {
    shutdownSimulator(udid);
    await waitFor('simulator to shut down', () => {
      const s = getSimulatorState(udid);
      return s === 'Shutdown';
    }, 30_000, 2000);
    console.log('[lifecycle] Simulator shut down successfully.');
    pass('simulatorAutoStop');
  } catch (e) {
    console.warn('[lifecycle] Could not shut down simulator:', e.message);
    fail('simulatorAutoStop');
  }
}

// --- Stop Appium ------------------------------------------------------------

async function stopAppium() {
  if (KEEP_APPIUM) {
    console.log('[lifecycle] KEEP_APPIUM_SERVER=true — skipping Appium shutdown.');
    pass('appiumAutoStop');
    return;
  }

  console.log('[lifecycle] Stopping Appium ...');
  try {
    execSync("pkill -f 'node.*appium' || true", { stdio: 'pipe' });
    await waitFor(
      'Appium port to free',
      async () => !(await isPortListening(APPIUM_HOST, APPIUM_PORT)),
      15_000,
      1000
    );
    console.log('[lifecycle] Appium stopped.');
    pass('appiumAutoStop');
  } catch (e) {
    console.warn('[lifecycle] Could not stop Appium:', e.message);
    fail('appiumAutoStop');
  }
}

// --- Generate lifecycle report ----------------------------------------------

function generateLifecycleReport(exitCode) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const succeeded = exitCode === 0;

  var cucumberJsonPath = path.join(ROOT, 'reports', 'ios', 'cucumber-report.json');
  var cucumberReportFound = fs.existsSync(cucumberJsonPath);
  var cucumberReportStatus = cucumberReportFound ? 'Found' : 'Not found';
  var allureResultsPath = path.join(ROOT, 'reports', 'allure', 'ios', 'allure-results');
  var allureResultsFound = fs.existsSync(allureResultsPath) && fs.readdirSync(allureResultsPath).length > 0;

  const report = `# iOS Execution Lifecycle Summary

**Generated:** ${timestamp}
**Simulator:** ${SIMULATOR_NAME}
**Appium:** ${APPIUM_HOST}:${APPIUM_PORT}
**Keep Simulator:** ${KEEP_SIMULATOR}
**Keep Appium:** ${KEEP_APPIUM}
**WDA Warmup:** ${results.wdaWarmup}
**Cucumber Report:** ${cucumberReportStatus}
**Allure Results:** ${allureResultsFound ? 'Found' : 'Not found'}

## Results

| Step | Status |
|------|--------|
| iOS Simulator Auto-Start | ${results.simulatorAutoStart} |
| Appium Auto-Start | ${results.appiumAutoStart} |
| WDA Warmup Session | ${results.wdaWarmup} |
| iOS Scenarios Executed | ${results.iosTestExecuted} |
| iOS Simulator Auto-Stop | ${results.simulatorAutoStop} |
| Appium Auto-Stop | ${results.appiumAutoStop} |

## Report Files

| Report | Status |
|--------|--------|
| Cucumber JSON | ${cucumberReportStatus} |
| Allure Results | ${allureResultsFound ? 'Found' : 'Not found'} |

## Overall

**Lifecycle Status:** ${succeeded ? 'PASS' : 'FAIL'}

---

*Report auto-generated by runIOSWithLifecycle.js*
`;

  fs.mkdirSync(LIFECYCLE_REPORT_DIR, { recursive: true });
  fs.writeFileSync(LIFECYCLE_REPORT_PATH, report, 'utf8');
  console.log(`[lifecycle] Report saved to ${LIFECYCLE_REPORT_PATH}`);
}

// --- Print summary ----------------------------------------------------------

function printSummary(exitCode) {
  console.log('\n========================================');
  console.log('      iOS LIFECYCLE REPORT');
  console.log('========================================');
  console.log(`  Simulator auto-start:                 ${results.simulatorAutoStart}`);
  console.log(`  Appium auto-start:                    ${results.appiumAutoStart}`);
  console.log(`  WDA warmup:                           ${results.wdaWarmup}`);
  console.log(`  iOS scenarios executed:               ${results.iosTestExecuted}`);
  console.log(`  Simulator auto-stop:                  ${results.simulatorAutoStop}`);
  console.log(`  Appium auto-stop:                     ${results.appiumAutoStop}`);
  console.log('========================================\n');
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('========================================');
  console.log('  iOS Lifecycle Manager');
  console.log(`  Simulator: ${SIMULATOR_NAME}`);
  console.log(`  Appium: ${APPIUM_HOST}:${APPIUM_PORT}`);
  console.log(`  KEEP_SIMULATOR=${KEEP_SIMULATOR}, KEEP_APPIUM=${KEEP_APPIUM}`);
  console.log('========================================\n');

  let exitCode = 0;
  let simUdid = null;

  // 1. Start simulator
  try {
    const simInfo = await startSimulator();
    simUdid = simInfo.udid;
  } catch (e) {
    console.error('[lifecycle] Simulator start failed:', e.message);
    fail('simulatorAutoStart');
    exitCode = 1;
  }

  // 2. Start Appium
  try {
    await startAppium();
  } catch (e) {
    console.error('[lifecycle] Appium start failed:', e.message);
    fail('appiumAutoStart');
    exitCode = 1;
  }

  // 3. Warm up WDA (pre-compile, pre-build) before real tests
  if (exitCode === 0) {
    try {
      await warmupWDA();
    } catch (e) {
      console.warn('[lifecycle] WDA warmup error (non-fatal):', e.message);
      fail('wdaWarmup');
    }
  } else {
    console.log('[lifecycle] Skipping WDA warmup due to setup failure.');
    fail('wdaWarmup');
  }

  // 4. Run tests (only if setup succeeded)
  if (exitCode === 0) {
    const testOk = await runIOSTests();
    if (!testOk) exitCode = 1;

    // Check if cucumber JSON report was generated
    const iosJsonPath = path.join(ROOT, 'reports', 'ios', 'cucumber-report.json');
    var iosReportGenerated = fs.existsSync(iosJsonPath);
    if (iosReportGenerated) {
      console.log('[lifecycle] iOS Cucumber JSON report found at ' + iosJsonPath);
    } else {
      console.log('[lifecycle] iOS Cucumber JSON report NOT found at ' + iosJsonPath);
    }

    // Generate iOS Cucumber HTML report if JSON exists
    if (iosReportGenerated) {
      try {
        const { execSync: exec } = require('child_process');
        exec(`node "${__dirname}/generateReports.js" ios`, { stdio: 'inherit', timeout: 60000 });
        console.log('[lifecycle] iOS Cucumber HTML report generated');
      } catch (e) {
        console.log('[lifecycle] iOS Cucumber HTML report generation failed (non-fatal):', e.message);
      }
    } else {
      console.log('[lifecycle] iOS Cucumber JSON not found at reports/ios/cucumber-report.json - skipping HTML report');
    }
  } else {
    console.log('[lifecycle] Skipping tests due to setup failure.');
    fail('iosTestExecuted');
  }

  // 5. Stop simulator (always, even on error)
  try {
    await stopSimulator(simUdid);
  } catch (e) {
    console.warn('[lifecycle] Simulator stop error:', e.message);
    fail('simulatorAutoStop');
  }

  // 6. Stop Appium (always, even on error)
  try {
    await stopAppium();
  } catch (e) {
    console.warn('[lifecycle] Appium stop error:', e.message);
    fail('appiumAutoStop');
  }

  // 7. Generate lifecycle report
  generateLifecycleReport(exitCode);

  // 8. Print summary and exit
  printSummary(exitCode);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[lifecycle] Unexpected error:', err);
  stopSimulator(null).catch(() => {});
  stopAppium().catch(() => {});
  // Attempt HTML report generation even on unexpected errors
  const iosJsonPathErr = path.join(ROOT, 'reports', 'ios', 'cucumber-report.json');
  if (fs.existsSync(iosJsonPathErr)) {
    try {
      const { execSync: exec } = require('child_process');
      exec(`node "${__dirname}/generateReports.js" ios`, { stdio: 'inherit', timeout: 60000 });
    } catch (e) {}
  }
  generateLifecycleReport(1);
  printSummary(1);
  process.exit(1);
});
