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
 *
 * Warmup:
 *   The warmup session ONLY verifies that Appium and WDA can create a Safari
 *   session. It MUST never visit amazon.in, never create cookies, and never
 *   modify Safari state. Navigation is omitted entirely — the session is
 *   created, contexts are listed (to confirm WDA is operational), and then
 *   the session is deleted immediately.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

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

// --- Check Appium /status endpoint ------------------------------------------

function checkAppiumHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${APPIUM_HOST}:${APPIUM_PORT}/status`,
      { timeout: 5000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const ready = json.value && json.value.ready !== false;
            resolve({ running: true, healthy: ready, body: json });
          } catch (e) {
            resolve({ running: true, healthy: false, body: body });
          }
        });
        res.on('error', () => resolve({ running: true, healthy: false }));
      }
    );
    req.on('error', () => resolve({ running: false, healthy: false }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false, healthy: false }); });
  });
}

// --- Wait for Appium to be healthy ------------------------------------------

function waitForAppiumHealthy(timeoutMs = 60_000) {
  return waitFor(
    'Appium /status to report healthy',
    () => checkAppiumHealth().then(s => s.healthy),
    timeoutMs,
    2000
  );
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

// --- Start Appium with health check -----------------------------------------

async function startAppium() {
  console.log('[lifecycle] Checking Appium ...');

  const listening = await isPortListening(APPIUM_HOST, APPIUM_PORT);

  if (listening) {
    console.log(`[lifecycle] Appium port ${APPIUM_HOST}:${APPIUM_PORT} is open. Checking health ...`);
    try {
      await waitForAppiumHealthy(30_000);
      console.log('[lifecycle] Appium is healthy and ready.');
      pass('appiumAutoStart');
      return;
    } catch (e) {
      console.warn(`[lifecycle] Appium port open but /status not healthy: ${e.message}. Restarting ...`);
      try {
        execSync("pkill -f 'node.*appium' || true", { stdio: 'pipe' });
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log('[lifecycle] Starting Appium server ...');
  const appium = spawn('npx', ['appium'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, APPIUM_HOST, APPIUM_PORT },
  });
  appium.unref();

  // Wait for port to open
  await waitFor(
    `Appium listening on ${APPIUM_HOST}:${APPIUM_PORT}`,
    () => isPortListening(APPIUM_HOST, APPIUM_PORT),
    60_000,
    2000
  );
  console.log('[lifecycle] Appium port is open. Waiting for healthy /status ...');

  // Wait for /status to report healthy (Appium may be listening but not ready)
  try {
    await waitForAppiumHealthy(30_000);
    console.log('[lifecycle] Appium is healthy and ready.');
  } catch (e) {
    throw new Error(`Appium started but never became healthy: ${e.message}`);
  }

  pass('appiumAutoStart');
}

// --- WDA warmup — no navigation, no state modification -----------------------

async function warmupWDA() {
  console.log('[lifecycle] Warming up WebDriverAgent (WDA) with a minimal Safari session ...');

  // ── Pre-check: verify Appium is truly ready ─────────────────────────
  console.log('[lifecycle] Running pre-warmup Appium readiness check ...');
  let appiumReady = false;
  const preCheckStart = Date.now();
  const PRE_CHECK_TIMEOUT = 60_000;

  while (Date.now() - preCheckStart < PRE_CHECK_TIMEOUT) {
    const portOpen = await isPortListening(APPIUM_HOST, APPIUM_PORT);
    if (!portOpen) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const health = await checkAppiumHealth();
    if (health.running && health.healthy) {
      console.log('[lifecycle] Appium /status reports healthy.');
      appiumReady = true;
      break;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!appiumReady) {
    console.warn('[lifecycle] Appium did not become healthy within pre-check timeout. Attempting warmup anyway ...');
  } else {
    console.log('[lifecycle] Pre-check passed — Appium is ready for sessions.');
  }

  // ── Session creation (one attempt, no retry loop for warmup) ────────
  const basePaths = ['/', '/wd/hub'];
  let lastError;

  for (const basePath of basePaths) {
    try {
      console.log(`[lifecycle] Warmup: creating Safari session via path="${basePath}" ...`);

      const { remote } = require('webdriverio');

      const warmupCaps = {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': process.env.DEVICE_NAME || SIMULATOR_NAME,
        'appium:platformVersion': process.env.PLATFORM_VERSION || undefined,
        'appium:browserName': 'Safari',
        browserName: 'Safari',
        'safari:useSimulator': true,
        'appium:udid': process.env.UDID || undefined,
        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:newCommandTimeout': 180,
        'appium:wdaLaunchTimeout': 300000,
        'appium:wdaConnectionTimeout': 300000,
        'appium:useNewWDA': false,
        'appium:autoAcceptAlerts': true,
        'appium:autoDismissAlerts': false,
        // Intentionally omit appium:appIdKey — it is only for native apps,
        // not Safari. Setting it for Safari causes 'Missing parameter: appIdKey'.
      };

      if (process.env.UDID) warmupCaps['appium:udid'] = process.env.UDID;

      const warmupDriver = await remote({
        protocol: 'http',
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        path: basePath,
        logLevel: 'error',
        connectionRetryTimeout: 180000,
        connectionRetryCount: 2,
        capabilities: warmupCaps,
      });

      console.log('[lifecycle] WDA warmup session created successfully.');

      // Get contexts to confirm Safari/WDA is fully operational
      // No navigation to amazon.in — this warmup must never modify Safari state.
      try {
        const contexts = await warmupDriver.getContexts();
        console.log(`[lifecycle] Available contexts: ${contexts.join(', ')}`);
      } catch (e) {
        console.log(`[lifecycle] Context check: ${e.message}`);
      }

      // Close warmup session immediately — no navigation, no cookies, no state.
      await warmupDriver.deleteSession();
      console.log('[lifecycle] WDA warmup session closed cleanly.');

      pass('wdaWarmup');
      return;
    } catch (err) {
      lastError = err;
      const msg = String(err.message || '');
      console.warn(
        `[lifecycle] Warmup path="${basePath}" failed: ${msg.substring(0, 150)}`
      );

      // If connection-level error, verify Appium is still up
      if (msg.includes('Unable to connect') || msg.includes('ECONNREFUSED') || msg.includes('socket hang up')) {
        console.log('[lifecycle] Connection issue — checking Appium health ...');
        const h = await checkAppiumHealth();
        if (!h.running) {
          console.warn('[lifecycle] Appium appears down. Attempting restart ...');
          try {
            execSync("pkill -f 'node.*appium' || true", { stdio: 'pipe' });
          } catch (_) {}
          await new Promise((r) => setTimeout(r, 2000));
          const appium = spawn('npx', ['appium'], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, APPIUM_HOST, APPIUM_PORT },
          });
          appium.unref();
          try {
            await waitFor(`Appium listening on ${APPIUM_HOST}:${APPIUM_PORT}`,
              () => isPortListening(APPIUM_HOST, APPIUM_PORT), 60_000, 2000);
            await waitForAppiumHealthy(30_000);
          } catch (restartErr) {
            console.warn(`[lifecycle] Appium restart failed: ${restartErr.message}`);
          }
        }
      }
    }
  }

  console.warn(`[lifecycle] WDA warmup failed: ${lastError ? lastError.message : 'unknown error'}`);
  fail('wdaWarmup');
}


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
    console.log('[lifecycle] KEEP_IOS_SIMULATOR=true — simulator left running.');
    pass('simulatorAutoStop');
    return;
  }

  console.log('[lifecycle] Shutting down simulator ...');
  const state = getSimulatorState(udid);

  if (state === 'Shutdown') {
    console.log('[lifecycle] Simulator already shut down.');
    pass('simulatorAutoStop');
    return;
  }

  shutdownSimulator(udid);

  try {
    await waitFor('simulator shutdown', () => getSimulatorState(udid) === 'Shutdown', 60_000, 2000);
    console.log('[lifecycle] Simulator shut down successfully.');
    pass('simulatorAutoStop');
  } catch (e) {
    console.warn(`[lifecycle] Simulator did not shut down cleanly: ${e.message}`);
    fail('simulatorAutoStop');
  }
}

// --- Stop Appium ------------------------------------------------------------

async function stopAppium() {
  if (KEEP_APPIUM) {
    console.log('[lifecycle] KEEP_APPIUM_SERVER=true — Appium left running.');
    pass('appiumAutoStop');
    return;
  }

  console.log('[lifecycle] Stopping Appium server ...');
  try {
    execSync("pkill -f 'node.*appium' || true", { stdio: 'pipe' });
    await new Promise((r) => setTimeout(r, 2000));
    const portOpen = await isPortListening(APPIUM_HOST, APPIUM_PORT);
    if (!portOpen) {
      console.log('[lifecycle] Appium server stopped.');
      pass('appiumAutoStop');
    } else {
      console.warn('[lifecycle] Appium server may still be running.');
      fail('appiumAutoStop');
    }
  } catch (e) {
    console.warn(`[lifecycle] Appium stop warning: ${e.message}`);
    fail('appiumAutoStop');
  }
}

// --- Generate lifecycle report ----------------------------------------------

function generateLifecycleReport() {
  const lines = [
    '# iOS Execution Lifecycle Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Simulator: ${SIMULATOR_NAME}`,
    `Appium: ${APPIUM_HOST}:${APPIUM_PORT}`,
    '',
    '## Lifecycle Steps',
    '',
    '| Step | Result |',
    '|------|--------|',
  ];

  for (const [key, value] of Object.entries(results)) {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
    lines.push(`| ${label} | ${value} |`);
  }

  const allPassed = Object.values(results).every((r) => r === 'PASS');
  lines.push('');
  lines.push('**Overall: ' + (allPassed ? 'PASS' : 'FAIL') + '**');
  lines.push('');

  if (allPassed) {
    lines.push('All lifecycle steps completed successfully.');
  } else {
    lines.push('Some lifecycle steps failed. Review the table above for details.');
  }

  fs.mkdirSync(LIFECYCLE_REPORT_DIR, { recursive: true });
  fs.writeFileSync(LIFECYCLE_REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`[lifecycle] Report generated: ${LIFECYCLE_REPORT_PATH}`);
}

// --- Main -------------------------------------------------------------------

async function main() {
  const lifecycleStart = Date.now();
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  iOS Execution Lifecycle');
  console.log(`  Simulator: ${SIMULATOR_NAME}`);
  console.log(`  Appium: ${APPIUM_HOST}:${APPIUM_PORT}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  let udid;
  let testsPassed = false;
  let fatalError = null;

  try {
    // Step 1 — Boot Simulator
    const simInfo = await startSimulator();
    udid = simInfo.udid;

    // Step 2 — Start Appium
    await startAppium();

    // Step 3 — WDA warmup (no navigation, no cookies, no state)
    await warmupWDA();

    // Step 4 — Execute iOS tests
    testsPassed = await runIOSTests();
  } catch (err) {
    fatalError = err;
    console.error(`\n[lifecycle] FATAL: ${err.message}`);
  }

  // Step 5 — Stop simulator
  if (udid) {
    try { await stopSimulator(udid); } catch (e) {
      console.warn(`[lifecycle] Simulator stop error: ${e.message}`);
    }
  }

  // Step 6 — Stop Appium
  try { await stopAppium(); } catch (e) {
    console.warn(`[lifecycle] Appium stop error: ${e.message}`);
  }

  // Step 7 — Generate report
  generateLifecycleReport();

  const durationSec = ((Date.now() - lifecycleStart) / 1000).toFixed(1);
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`  Lifecycle complete in ${durationSec}s`);
  console.log(`  Tests: ${testsPassed ? 'PASSED' : 'FAILED'}`);
  if (fatalError) console.log(`  Fatal: ${fatalError.message}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(testsPassed ? 0 : 1);
}

main();
