#!/usr/bin/env node

/**
 * runAndroidWithLifecycle.js
 *
 * Zero-manual Android execution lifecycle:
 * - Starts emulator (Pixel_9_Pro) automatically if no device is connected
 * - Waits for boot completion
 * - Starts Appium automatically if not already listening
 * - Runs the REAL Android test command via npm run test:android:raw
 *   (which includes env vars ENV_FILE=.env.android, REPORT_DIR=reports/android, PARALLEL=1
 *    and the full cucumber-js command with allure reporter)
 * - Preserves the real test exit code
 * - Stops emulator and Appium after tests (unless KEEP_* env vars are set)
 * - Always runs cleanup in a finally block
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');

// --- Configuration ----------------------------------------------------------
const AVD_NAME = process.env.ANDROID_AVD_NAME || 'Pixel_9_Pro';
const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT, 10) || 4723;
const KEEP_EMULATOR = process.env.KEEP_ANDROID_EMULATOR === 'true';
const KEEP_APPIUM = process.env.KEEP_APPIUM_SERVER === 'true';

const ROOT = path.resolve(__dirname, '..');

// The real Android test command – uses the separate npm script that has the
// exact env vars and cucumber flags needed for Android execution.
// NOTE: This is NOT recursive. "test:android:raw" is a separate script that
// runs the raw cucumber command; "test:android" is what calls this lifecycle.
const ANDROID_TEST_CMD = 'npm run test:android:raw';

// --- Result tracker ---------------------------------------------------------
const results = {
  emulatorAutoStart: 'SKIPPED',
  appiumAutoStart: 'SKIPPED',
  androidTestExecuted: 'SKIPPED',
  emulatorAutoStop: 'SKIPPED',
  appiumAutoStop: 'SKIPPED',
};

function pass(label) { results[label] = 'PASS'; }
function fail(label) { results[label] = 'FAIL'; }

// --- Helper: wait for condition with polling ---------------------------------
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

// --- Check if a TCP port is listening ----------------------------------------
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

// --- Check ADB device status -------------------------------------------------
function adbDevices() {
  const out = execSync('adb devices', { encoding: 'utf8', stdio: 'pipe' });
  const lines = out.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === 'device') return true;
  }
  return false;
}

function bootCompleted() {
  const out = execSync('adb shell getprop sys.boot_completed', {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return out.trim() === '1';
}

// --- Start emulator ----------------------------------------------------------
async function startEmulator() {
  console.log(`[lifecycle] Checking emulator (AVD: ${AVD_NAME}) ...`);

  const alreadyDevice = adbDevices();

  if (alreadyDevice) {
    console.log('[lifecycle] Device already connected via ADB.');
    pass('emulatorAutoStart');
    return;
  }

  console.log('[lifecycle] No device detected. Starting emulator ...');
  const emu = spawn('emulator', ['-avd', AVD_NAME, '-no-snapshot', '-noaudio'], {
    detached: true,
    stdio: 'ignore',
  });
  emu.unref();

  await waitFor('emulator adb device', adbDevices, 180_000, 2000);
  console.log('[lifecycle] Emulator ADB device detected.');

  await waitFor('boot completed', bootCompleted, 120_000, 3000);
  console.log('[lifecycle] Emulator boot completed.');

  pass('emulatorAutoStart');
}

// --- Start Appium ------------------------------------------------------------
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

// --- Run Android tests -------------------------------------------------------
async function runAndroidTests() {
  console.log('[lifecycle] Running Android tests ...');
  console.log(`[lifecycle] Command: ${ANDROID_TEST_CMD}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  return new Promise((resolve) => {
    const child = spawn(ANDROID_TEST_CMD, [], {
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
      // We consider the test "executed" regardless of exit code
      pass('androidTestExecuted');
      resolve(code === 0);
    });

    child.on('error', (err) => {
      console.error('[lifecycle] Failed to spawn test command:', err.message);
      fail('androidTestExecuted');
      resolve(false);
    });
  });
}

// --- Stop emulator -----------------------------------------------------------
async function stopEmulator() {
  if (KEEP_EMULATOR) {
    console.log('[lifecycle] KEEP_ANDROID_EMULATOR=true — skipping emulator shutdown.');
    pass('emulatorAutoStop');
    return;
  }

  console.log('[lifecycle] Stopping emulator ...');
  try {
    execSync('adb emu kill', { stdio: 'pipe', timeout: 15_000 });
    await waitFor('emulator to disconnect', () => !adbDevices(), 30_000, 2000);
    console.log('[lifecycle] Emulator stopped.');
    pass('emulatorAutoStop');
  } catch (e) {
    console.warn('[lifecycle] Could not stop emulator gracefully:', e.message);
    fail('emulatorAutoStop');
  }
}

// --- Stop Appium -------------------------------------------------------------
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

// --- Print summary -----------------------------------------------------------
function printSummary(exitCode) {
  const succeeded = exitCode === 0;
  console.log('\n========================================');
  console.log('      ANDROID LIFECYCLE REPORT');
  console.log('========================================');
  console.log(`  Lifecycle executed:                    ${succeeded ? 'PASS' : 'FAIL'}`);
  console.log(`  Real Android test command executed:   ${results.androidTestExecuted}`);
  console.log(`  Android scenarios executed count:     (see cucumber output above)`);
  console.log(`  Android steps executed count:         (see cucumber output above)`);
  console.log(`  Emulator cleanup:                     ${results.emulatorAutoStop}`);
  console.log(`  Appium cleanup:                       ${results.appiumAutoStop}`);
  console.log('========================================\n');
}

// --- Main --------------------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log(' Android Lifecycle Manager');
  console.log(` AVD: ${AVD_NAME}`);
  console.log(` Appium: ${APPIUM_HOST}:${APPIUM_PORT}`);
  console.log(` KEEP_EMULATOR=${KEEP_EMULATOR}, KEEP_APPIUM=${KEEP_APPIUM}`);
  console.log('========================================\n');

  let exitCode = 0;

  try {
    await startEmulator();
  } catch (e) {
    console.error('[lifecycle] Emulator start failed:', e.message);
    fail('emulatorAutoStart');
    exitCode = 1;
  }

  try {
    await startAppium();
  } catch (e) {
    console.error('[lifecycle] Appium start failed:', e.message);
    fail('appiumAutoStart');
    exitCode = 1;
  }

  // Run real Android tests (or skip if setup failed)
  if (exitCode === 0) {
    const testOk = await runAndroidTests();
    if (!testOk) exitCode = 1;
  } else {
    console.log('[lifecycle] Skipping tests due to setup failure.');
    fail('androidTestExecuted');
  }

  // --- Cleanup (always runs, even on error) ---
  try {
    await stopEmulator();
  } catch (e) {
    console.warn('[lifecycle] Emulator stop error:', e.message);
    fail('emulatorAutoStop');
  }

  try {
    await stopAppium();
  } catch (e) {
    console.warn('[lifecycle] Appium stop error:', e.message);
    fail('appiumAutoStop');
  }

  printSummary(exitCode);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[lifecycle] Unexpected error:', err);
  // Still attempt cleanup
  stopEmulator().catch(() => {});
  stopAppium().catch(() => {});
  printSummary(1);
  process.exit(1);
});
