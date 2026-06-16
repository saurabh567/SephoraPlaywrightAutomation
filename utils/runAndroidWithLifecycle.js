#!/usr/bin/env node

/**
 * runAndroidWithLifecycle.js
 *
 * Zero-manual Android execution lifecycle – fully stable.
 * Always writes android-execution-lifecycle-summary.md in finally.
 *
 * Phases (each with timeout, no infinite waits):
 *   1. Clean stale Appium processes on port 4723
 *   2. Start emulator (if no adb device) with stable flags (no snapshot)
 *   3. Wait for adb device → boot completed → extra settle
 *      - Monitors emulator PID health every poll cycle
 *      - If emulator dies within 60s of start, cold-boot recovery (once)
 *   4. Start single Appium server on 127.0.0.1:4723
 *   5. Verify device health (boot, provisioned, pm list, etc.)
 *   6. Verify Amazon app installed + launch (fail-fast if not installed)
 *   7. Run real Android tests (npm run test:android:raw)
 *   8. Cleanup (only in finally, only if owned)
 *
 * Environment variables:
 *   ANDROID_AVD_NAME          – AVD name (default: Pixel_9_Pro)
 *   APPIUM_HOST               – (default: 127.0.0.1)
 *   APPIUM_PORT               – (default: 4723)
 *   KEEP_ANDROID_EMULATOR     – if 'true', do NOT stop emulator at end
 *   KEEP_APPIUM_SERVER        – if 'true', do NOT stop Appium at end
 *   FORCE_ANDROID_CLEANUP     – if 'true', stop emulator even if not owned
 *   FORCE_APPIUM_CLEANUP      – if 'true', stop Appium even if not owned
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const AVD_NAME = process.env.ANDROID_AVD_NAME || 'Pixel_9_Pro';
const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT, 10) || 4723;
const KEEP_EMULATOR = process.env.KEEP_ANDROID_EMULATOR === 'true';
const KEEP_APPIUM = process.env.KEEP_APPIUM_SERVER === 'true';
const FORCE_ANDROID_CLEANUP = process.env.FORCE_ANDROID_CLEANUP === 'true';
const FORCE_APPIUM_CLEANUP = process.env.FORCE_APPIUM_CLEANUP === 'true';

const AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';

const ROOT = path.resolve(__dirname, '..');

let emulatorOwned = false;
let appiumOwned = false;
let emulatorProcess = null;
let appiumProcess = null;

// ─────────────────────────────────────────────────────────────────────────────
// executionState – maintained from beginning, always written in finally
// ─────────────────────────────────────────────────────────────────────────────
const executionState = {
  startTime: new Date().toISOString(),
  endTime: null,
  avdName: AVD_NAME,
  emulatorStarted: false,
  emulatorPid: null,
  adbDeviceId: null,
  bootCompleted: false,
  appiumStarted: false,
  appiumPid: null,
  amazonInstalled: false,
  amazonLaunched: false,
  rawTestCommand: 'npm run test:android:raw',
  rawTestStarted: false,
  rawTestExitCode: null,
  scenariosExecuted: null,
  scenariosPassed: null,
  scenariosFailed: null,
  stepsExecuted: null,
  stepsPassed: null,
  stepsFailed: null,
  failedStage: null,
  errorMessage: null,
  cleanupStatus: 'pending',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().split('.')[0].replace('T', ' ');
  console.log(`[android-lifecycle] ${ts} ${msg}`);
}

function setFailedStage(stage) {
  executionState.failedStage = stage;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns true if the given PID refers to a running process.
 * Uses process.kill(pid, 0) which throws ESRCH if process is gone.
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function waitFor(description, fn, timeoutMs = 120_000, intervalMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        clearInterval(id);
        return reject(new Error(`[android-lifecycle] TIMEOUT waiting for: ${description} (${timeoutMs}ms)`));
      }
      try {
        const ok = fn();
        if (ok) {
          clearInterval(id);
          return resolve(true);
        }
      } catch (_) { /* ignore polling errors */ }
    }, intervalMs);
  });
}

function waitForWithPidCheck(description, fn, pid, timeoutMs = 120_000, intervalMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        clearInterval(id);
        return reject(new Error(`[android-lifecycle] TIMEOUT waiting for: ${description} (${timeoutMs}ms)`));
      }
      if (!isPidAlive(pid)) {
        clearInterval(id);
        return reject(new Error(`[android-lifecycle] EMULATOR PROCESS DIED (PID ${pid}) while waiting for: ${description}`));
      }
      try {
        const ok = fn();
        if (ok) {
          clearInterval(id);
          return resolve(true);
        }
      } catch (_) { /* ignore polling errors */ }
    }, intervalMs);
  });
}

function runCmd(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30000,
    ...opts,
  });
}

function runCmdOptional(cmd, opts = {}) {
  try {
    return runCmd(cmd, opts).trim();
  } catch (_) {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port check / Appium management
// ─────────────────────────────────────────────────────────────────────────────

function isPortListeningSync(host, port) {
  return new Promise((resolve) => {
    try {
      const s = new net.Socket();
      s.setTimeout(2000);
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => { s.destroy(); resolve(false); });
      s.on('timeout', () => { s.destroy(); resolve(false); });
      s.connect(port, host);
    } catch (_) {
      resolve(false);
    }
  });
}

async function waitForPortFree(host, port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const listening = await isPortListeningSync(host, port);
    if (!listening) return true;
    await sleep(1000);
  }
  throw new Error(`[android-lifecycle] TIMEOUT waiting for port ${host}:${port} to free (${timeoutMs}ms)`);
}

async function waitForAppiumHealthy(host, port, timeoutMs = 60000) {
  const url = `http://${host}:${port}/status`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const out = runCmd(`curl -sf ${url}`, { timeout: 5000 });
      if (out) {
        const json = JSON.parse(out);
        if (json.value && json.value.ready !== false) return true;
      }
    } catch (_) { /* not ready yet */ }
    await sleep(2000);
  }
  throw new Error(`[android-lifecycle] TIMEOUT waiting for Appium /status at ${url} (${timeoutMs}ms)`);
}

function killProcessOnPort(port) {
  try {
    const lines = runCmd(`lsof -ti :${port} 2>/dev/null || true`);
    if (!lines.trim()) return false;
    const pids = lines.trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGKILL');
        log(`killed stale process PID ${pid} on port ${port}`);
      } catch (_) { /* already dead */ }
    }
    return pids.length > 0;
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADB helpers
// ─────────────────────────────────────────────────────────────────────────────

function getAdbDeviceId() {
  try {
    const out = runCmd('adb devices');
    const lines = out.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === 'device' && parts[0].startsWith('emulator-')) {
        return parts[0];
      }
    }
  } catch (_) {}
  return null;
}

function adbDeviceConnected() {
  return getAdbDeviceId() !== null;
}

function bootCompleted() {
  try {
    const out = runCmd('adb shell getprop sys.boot_completed');
    return out.trim() === '1';
  } catch (_) {
    return false;
  }
}

function bootAnimationStopped() {
  try {
    const out = runCmd('adb shell getprop init.svc.bootanim');
    return out.trim() === 'stopped';
  } catch (_) {
    return false;
  }
}

function deviceProvisioned() {
  try {
    const out = runCmd('adb shell settings get global device_provisioned');
    return out.trim() === '1';
  } catch (_) {
    return false;
  }
}

function pmListWorks() {
  try {
    const out = runCmd('adb shell pm list packages');
    return out.includes('package:');
  } catch (_) {
    return false;
  }
}

function isAmazonAppInstalled() {
  try {
    const out = runCmd(`adb shell pm list packages | grep ${AMAZON_PACKAGE}`);
    return out.includes(AMAZON_PACKAGE);
  } catch (_) {
    return false;
  }
}

function getForegroundPackage() {
  try {
    let out = runCmd("adb shell dumpsys window 2>/dev/null | grep mCurrentFocus");
    if (out) {
      const m = out.match(/in\.amazon[^\s)]+/);
      if (m) return m[0];
    }
    out = runCmd("adb shell dumpsys activity activities 2>/dev/null | grep mResumedActivity");
    if (out) {
      const m = out.match(/in\.amazon[^\s)]+/);
      if (m) return m[0];
    }
  } catch (_) {}
  return null;
}

function adbRebootDevice() {
  try {
    execSync('adb kill-server', { stdio: 'pipe', timeout: 10000 });
  } catch (_) {}
  try {
    execSync('adb start-server', { stdio: 'pipe', timeout: 15000 });
  } catch (_) {}
  try {
    execSync('adb reconnect', { stdio: 'pipe', timeout: 10000 });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Clean stale Appium
// ─────────────────────────────────────────────────────────────────────────────
async function phaseCleanStaleAppium() {
  log('cleaning stale Appium');
  setFailedStage('clean-stale-appium');

  const wasBusy = killProcessOnPort(APPIUM_PORT);
  if (wasBusy) {
    await waitForPortFree(APPIUM_HOST, APPIUM_PORT, 15000);
    log('stale Appium cleaned');
  } else {
    log('no stale Appium found');
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Start emulator (with cold-boot recovery)
// ─────────────────────────────────────────────────────────────────────────────
async function phaseStartEmulator() {
  log('starting emulator');
  setFailedStage('start-emulator');

  const existingDevice = getAdbDeviceId();
  if (existingDevice) {
    log(`adb device detected: ${existingDevice}`);
    executionState.adbDeviceId = existingDevice;
    executionState.bootCompleted = bootCompleted();
    emulatorOwned = false;
    return true;
  }

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      log(`cold-boot recovery attempt ${attempt}/${maxAttempts}`);
    }

    try {
      runCmdOptional("pkill -f 'emulator.*avd' 2>/dev/null || true");
    } catch (_) {}
    await sleep(3000);

    adbRebootDevice();
    await sleep(2000);

    log(`launching emulator -avd ${AVD_NAME} (attempt ${attempt})`);
    const emu = spawn('emulator', [
      '-avd', AVD_NAME,
      '-no-snapshot',
      '-no-audio',
      '-gpu', 'swiftshader_indirect',
      '-no-boot-anim',
      '-netdelay', 'none',
      '-netspeed', 'full',
      '-memory', '2048',
      '-cores', '2',
    ], {
      detached: true,
      stdio: 'ignore',
    });

    emulatorProcess = emu;
    const currentPid = emu.pid;
    executionState.emulatorPid = currentPid;
    executionState.emulatorStarted = true;
    emulatorOwned = true;
    emu.unref();

    log(`emulator PID: ${currentPid}`);

    const deviceStartTime = Date.now();
    try {
      await waitForWithPidCheck(
        'adb device to appear',
        adbDeviceConnected,
        currentPid,
        180_000,
        3000
      );
    } catch (err) {
      const elapsed = (Date.now() - deviceStartTime) / 1000;
      log(`adb device detection failed after ${elapsed}s: ${err.message}`);

      if (elapsed < 60 && attempt < maxAttempts) {
        log('emulator died quickly, attempting cold-boot recovery');
        try { process.kill(currentPid, 'SIGKILL'); } catch (_) {}
        await sleep(3000);
        continue;
      }
      throw err;
    }

    const deviceId = getAdbDeviceId();
    executionState.adbDeviceId = deviceId;
    log(`adb device detected: ${deviceId}`);

    try {
      await waitForWithPidCheck(
        'boot completed',
        bootCompleted,
        currentPid,
        120_000,
        3000
      );
    } catch (err) {
      if (attempt < maxAttempts) {
        log('boot failed, attempting cold-boot recovery');
        try { process.kill(currentPid, 'SIGKILL'); } catch (_) {}
        await sleep(3000);
        continue;
      }
      throw err;
    }

    executionState.bootCompleted = true;
    log('boot completed');

    try {
      runCmd('adb shell input keyevent 82 || true', { timeout: 5000 });
    } catch (_) {}
    await sleep(5000);

    const postCheck = getAdbDeviceId();
    if (!postCheck) {
      log('adb device went offline after boot – restarting ADB server');
      adbRebootDevice();
      try {
        await waitForWithPidCheck(
          'adb device reconnection',
          adbDeviceConnected,
          currentPid,
          120_000,
          3000
        );
        const reDevice = getAdbDeviceId();
        if (reDevice) {
          executionState.adbDeviceId = reDevice;
          log(`adb device reconnected: ${reDevice}`);
        } else {
          throw new Error('adb device could not be reconnected after ADB server restart');
        }
      } catch (err) {
        if (attempt < maxAttempts) {
          log('reconnection failed, attempting cold-boot recovery');
          try { process.kill(currentPid, 'SIGKILL'); } catch (_) {}
          await sleep(3000);
          continue;
        }
        throw err;
      }
    }

    return true;
  }

  throw new Error(`Failed to start emulator after ${maxAttempts} attempts`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Start Appium
// ─────────────────────────────────────────────────────────────────────────────
async function phaseStartAppium() {
  setFailedStage('start-appium');

  const alreadyListening = await isPortListeningSync(APPIUM_HOST, APPIUM_PORT);
  if (alreadyListening) {
    try {
      await waitForAppiumHealthy(APPIUM_HOST, APPIUM_PORT, 15000);
      log('Appium already healthy');
      executionState.appiumStarted = true;
      executionState.appiumPid = null;
      try {
        const pids = runCmd(`lsof -ti :${APPIUM_PORT} 2>/dev/null || true`).trim().split('\n').filter(Boolean);
        if (pids.length > 0) {
          executionState.appiumPid = pids[0];
        }
      } catch (_) {}
      appiumOwned = false;
      log('Appium ready');
      return true;
    } catch (_) {
      log('port busy but Appium not healthy – cleaning up');
      killProcessOnPort(APPIUM_PORT);
      await waitForPortFree(APPIUM_HOST, APPIUM_PORT, 15000);
    }
  }

  log('starting Appium server');
  const appiumLogPath = path.join(ROOT, 'mobile', 'logs', 'appium-server.log');
  fs.mkdirSync(path.dirname(appiumLogPath), { recursive: true });
  const logFd = fs.openSync(appiumLogPath, 'a');

  const appiumProc = spawn('npx', [
    'appium',
    '--address', APPIUM_HOST,
    '--port', String(APPIUM_PORT),
    '--base-path', '/',
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  appiumProcess = appiumProc;
  executionState.appiumPid = String(appiumProc.pid);
  executionState.appiumStarted = true;
  appiumOwned = true;
  appiumProc.unref();

  await waitForAppiumHealthy(APPIUM_HOST, APPIUM_PORT, 60000);
  log(`Appium ready (PID ${appiumProc.pid})`);

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Device health verification
// ─────────────────────────────────────────────────────────────────────────────
async function phaseVerifyDeviceHealth() {
  log('verifying device health');
  setFailedStage('device-health');

  const deviceId = getAdbDeviceId();
  if (!deviceId) throw new Error('FAILED: no adb device found');
  executionState.adbDeviceId = deviceId;

  if (!bootCompleted()) throw new Error('FAILED: boot not completed');
  executionState.bootCompleted = true;

  if (!bootAnimationStopped()) log('WARNING: boot animation not stopped yet, continuing anyway');
  if (!deviceProvisioned()) log('WARNING: device_provisioned is not 1, continuing');
  if (!pmListWorks()) throw new Error('FAILED: adb shell pm list packages does not work');

  log('device health checks passed');
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: Amazon app readiness
// ─────────────────────────────────────────────────────────────────────────────
async function phaseAmazonApp() {
  setFailedStage('amazon-app');

  if (!isAmazonAppInstalled()) {
    const msg = `Amazon Android app (${AMAZON_PACKAGE}) is NOT installed on the emulator. `
      + 'Please install the Amazon Shopping app before running Android tests. '
      + 'Alternatively, configure Android tests for Chrome mobile web instead.';
    log(`FAIL: ${msg}`);
    throw new Error(msg);
  }

  executionState.amazonInstalled = true;
  log('Amazon app is installed');

  log(`launching ${AMAZON_PACKAGE} via adb monkey`);
  try {
    runCmd(
      `adb shell monkey -p ${AMAZON_PACKAGE} -c android.intent.category.LAUNCHER 1`,
      { timeout: 15000 }
    );
  } catch (_) {
    log('WARNING: adb monkey launch returned non-zero, continuing anyway');
  }

  await waitFor('Amazon app to be in foreground', () => {
    const fg = getForegroundPackage();
    return fg !== null && fg.includes('in.amazon');
  }, 60000, 2000);

  executionState.amazonLaunched = true;
  log('Amazon app is in foreground');
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Run real Android tests
// ─────────────────────────────────────────────────────────────────────────────
async function phaseRunRealTests() {
  log('starting real Android tests');
  executionState.rawTestStarted = true;
  setFailedStage('real-tests');

  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'test:android:raw'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env },
    });

    child.on('exit', (code) => {
      executionState.rawTestExitCode = code;
      log(`real Android tests finished with exit code ${code}`);
      resolve(code === 0);
    });

    child.on('error', (err) => {
      log(`failed to spawn test command: ${err.message}`);
      executionState.rawTestExitCode = -1;
      executionState.errorMessage = err.message;
      resolve(false);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cucumber JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseCucumberJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return null;
    }

    let scenariosTotal = 0;
    let scenariosPassed = 0;
    let scenariosFailed = 0;
    let stepsTotal = 0;
    let stepsPassed = 0;
    let stepsFailed = 0;

    for (const feature of data) {
      const elements = feature.elements || [];
      for (const element of elements) {
        if (element.type === 'scenario' || element.keyword === 'Scenario' || element.keyword === 'Scenario Outline') {
          scenariosTotal++;
          const steps = element.steps || [];
          let scenarioFailed = false;
          for (const step of steps) {
            if (step.hidden) continue;
            stepsTotal++;
            if (step.result) {
              if (step.result.status === 'passed') {
                stepsPassed++;
              } else if (step.result.status === 'failed') {
                stepsFailed++;
                scenarioFailed = true;
              }
            }
          }
          if (scenarioFailed) {
            scenariosFailed++;
          } else {
            scenariosPassed++;
          }
        }
      }
    }

    return {
      scenariosTotal,
      scenariosPassed,
      scenariosFailed,
      stepsTotal,
      stepsPassed,
      stepsFailed,
    };
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Cleanup
// ─────────────────────────────────────────────────────────────────────────────

async function stopEmulator() {
  if (KEEP_EMULATOR) {
    log('KEEP_ANDROID_EMULATOR=true — skipping emulator shutdown');
    return;
  }

  if (!emulatorOwned && !FORCE_ANDROID_CLEANUP) {
    log('emulator was not started by this script, skipping stop (set FORCE_ANDROID_CLEANUP=true to override)');
    return;
  }

  log('emulator stopping');
  try {
    const deviceId = getAdbDeviceId();
    if (deviceId) {
      runCmdOptional(`adb -s ${deviceId} emu kill`, { timeout: 10000 });
      await sleep(5000);
    }

    const pidToKill = emulatorProcess ? emulatorProcess.pid : (executionState.emulatorPid ? parseInt(executionState.emulatorPid, 10) : null);
    if (pidToKill) {
      try { process.kill(pidToKill, 'SIGTERM'); } catch (_) {}
      await sleep(3000);
      try { process.kill(pidToKill, 'SIGKILL'); } catch (_) {}
      await sleep(1000);
    }
  } catch (e) {
    log(`emulator stop non-fatal error: ${e.message}`);
  }
  log('emulator stopped');
}

async function stopAppium() {
  if (KEEP_APPIUM) {
    log('KEEP_APPIUM_SERVER=true — skipping Appium shutdown');
    return;
  }

  if (!appiumOwned && !FORCE_APPIUM_CLEANUP) {
    log('Appium was not started by this script, skipping stop (set FORCE_APPIUM_CLEANUP=true to override)');
    return;
  }

  log('Appium stopping');
  try {
    const pidToKill = appiumProcess ? appiumProcess.pid : (executionState.appiumPid ? parseInt(executionState.appiumPid, 10) : null);
    if (pidToKill) {
      try { process.kill(pidToKill, 'SIGTERM'); } catch (_) {}
      await sleep(2000);
      try { process.kill(pidToKill, 'SIGKILL'); } catch (_) {}
    }
    killProcessOnPort(APPIUM_PORT);
    await sleep(1000);
  } catch (e) {
    log(`Appium stop non-fatal error: ${e.message}`);
  }
  log('Appium stopped');
}

// ─────────────────────────────────────────────────────────────────────────────
// Report generation – always called in finally, never skipped
// ─────────────────────────────────────────────────────────────────────────────

function generateLifecycleReport() {
  executionState.endTime = new Date().toISOString();

  // ── Try to parse Cucumber JSON ───────────────────────────────────────────
  const cucumberJsonPaths = [
    path.join(ROOT, 'reports', 'android', 'cucumber-report.json'),
    path.join(ROOT, 'reports', 'android', 'json', 'cucumber-report.json'),
    path.join(ROOT, 'reports', 'json', 'cucumber-report.json'),
    path.join(ROOT, 'reports', 'cucumber-report.json'),
  ];

  let parsed = null;
  let usedJsonPath = null;
  for (const p of cucumberJsonPaths) {
    parsed = parseCucumberJson(p);
    if (parsed) {
      usedJsonPath = p;
      break;
    }
  }

  if (parsed) {
    executionState.scenariosExecuted = parsed.scenariosTotal;
    executionState.scenariosPassed = parsed.scenariosPassed;
    executionState.scenariosFailed = parsed.scenariosFailed;
    executionState.stepsExecuted = parsed.stepsTotal;
    executionState.stepsPassed = parsed.stepsPassed;
    executionState.stepsFailed = parsed.stepsFailed;
  }

  // ── Determine overall status ─────────────────────────────────────────────
  const cucumberGenerated = parsed !== null;
  const testsExecuted = executionState.rawTestStarted;
  let overallStatus;
  if (!testsExecuted) {
    overallStatus = 'SKIPPED (tests did not start)';
  } else if (!cucumberGenerated && executionState.rawTestExitCode === 0) {
    overallStatus = 'WARNING (exit 0 but no cucumber report)';
  } else if (executionState.rawTestExitCode === 0 || (cucumberGenerated && parsed.scenariosFailed === 0)) {
    overallStatus = 'PASS';
  } else {
    overallStatus = 'FAIL';
  }

  // ── Check expected report files ──────────────────────────────────────────
  const expectedPaths = [
    'reports/android/cucumber-report.json',
    'reports/android/cucumber-html-report.html',
    'reports/android',
    'reports/ai',
  ];
  const reportFilesCheck = expectedPaths.map((p) => {
    const full = path.join(ROOT, p);
    return `  - ${p}: ${fs.existsSync(full) ? 'EXISTS' : 'MISSING'}`;
  }).join('\n');

  // ── Cucumber status details ──────────────────────────────────────────────
  let cucumberSection;
  if (cucumberGenerated) {
    cucumberSection = [
      `- Cucumber JSON path: ${usedJsonPath}`,
      `- Scenario count: ${parsed.scenariosTotal}`,
      `- Passed: ${parsed.scenariosPassed}`,
      `- Failed: ${parsed.scenariosFailed}`,
      `- Step count: ${parsed.stepsTotal}`,
      `- Steps passed: ${parsed.stepsPassed}`,
      `- Steps failed: ${parsed.stepsFailed}`,
    ].join('\n');
  } else {
    cucumberSection = [
      `- Cucumber JSON not found`,
      `- Expected paths checked:`,
      ...cucumberJsonPaths.map((p) => `    ${p}`),
    ].join('\n');
  }

  // ── Tests-executed-but-no-report check ───────────────────────────────────
  let testExecWarning = '';
  if (testsExecuted && !cucumberGenerated) {
    testExecWarning = [
      '',
      '## WARNING',
      'Android test executed but Cucumber report was not generated.',
      'This indicates Cucumber may have crashed or output was not written.',
      '',
    ].join('\n');
  }

  // ── Build markdown ───────────────────────────────────────────────────────
  const content = `# Android Execution Lifecycle Summary

> Generated at: ${executionState.endTime}
> Start time: ${executionState.startTime}

## Configuration
- AVD Name: \`${executionState.avdName}\`
- Emulator PID: ${executionState.emulatorPid || 'N/A (pre-existing)'}
- Appium PID: ${executionState.appiumPid || 'N/A (pre-existing)'}
- ADB Device ID: ${executionState.adbDeviceId || 'N/A'}
- Amazon Package: \`${AMAZON_PACKAGE}\`
- Raw Test Command: \`${executionState.rawTestCommand}\`

## Lifecycle Stages
| Stage | Status |
|-------|--------|
| Emulator Started | ${executionState.emulatorStarted ? 'YES' : 'NO'} |
| Boot Completed | ${executionState.bootCompleted ? 'YES' : 'NO'} |
| Appium Started | ${executionState.appiumStarted ? 'YES' : 'NO'} |
| Amazon App Installed | ${executionState.amazonInstalled ? 'YES' : 'NO'} |
| Amazon App Launched | ${executionState.amazonLaunched ? 'YES' : 'NO'} |
| Raw Test Started | ${executionState.rawTestStarted ? 'YES' : 'NO'} |

## Test Results
- Raw Test Exit Code: ${executionState.rawTestExitCode !== null ? executionState.rawTestExitCode : 'N/A (test not executed)'}
- Overall Status: **${overallStatus}**

### Cucumber Report
${cucumberSection}
${testExecWarning}
## Failed Stage
${executionState.failedStage || 'N/A (no failure)'}

## Error Message
${executionState.errorMessage || 'N/A'}

## Cleanup
- Cleanup Status: ${executionState.cleanupStatus}

## Report Files Check
${reportFilesCheck}
`;

  // ── Write report ─────────────────────────────────────────────────────────
  const reportDir = path.join(ROOT, 'reports', 'ai');
  try { fs.mkdirSync(reportDir, { recursive: true }); } catch (_) {}
  const reportPath = path.join(reportDir, 'android-execution-lifecycle-summary.md');
  try {
    fs.writeFileSync(reportPath, content, 'utf8');
    log(`lifecycle report written to ${reportPath}`);
  } catch (e) {
    log(`CRITICAL: failed to write lifecycle report: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main – try/catch/finally guarantees report always generated
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  log('starting');
  let exitCode = 0;

  try {
    await phaseCleanStaleAppium();
    await phaseStartEmulator();
    await phaseStartAppium();
    await phaseVerifyDeviceHealth();
    await phaseAmazonApp();

    const testOk = await phaseRunRealTests();
    if (!testOk) exitCode = 1;

  } catch (err) {
    log(`FAILED at stage "${executionState.failedStage}": ${err.message}`);
    executionState.errorMessage = err.message;
    if (executionState.rawTestExitCode === null) {
      exitCode = 1;
    }
  } finally {
    log('cleanup starting');

    try {
      await stopEmulator();
      await stopAppium();
      executionState.cleanupStatus = 'completed';
    } catch (e) {
      log(`cleanup error: ${e.message}`);
      executionState.cleanupStatus = 'error: ' + e.message;
    }

    // Generate Cucumber HTML report if JSON exists
    const androidJsonPath = path.join(ROOT, 'reports', 'android', 'cucumber-report.json');
    if (fs.existsSync(androidJsonPath)) {
      try {
        const { execSync: exec } = require('child_process');
        exec(`node "${__dirname}/generateReports.js" android`, { stdio: 'inherit', timeout: 60000 });
        log('Android Cucumber HTML report generated');
      } catch (e) {
        log('Android Cucumber HTML report generation failed (non-fatal): ' + e.message);
      }
    } else {
      log('Android Cucumber JSON not found at reports/android/cucumber-report.json - skipping HTML report');
    }

    // Lifecycle report is ALWAYS generated here, before process.exit
    generateLifecycleReport();
  }

  // Use original test exit code if tests actually ran
  const finalExitCode = executionState.rawTestExitCode !== null ? executionState.rawTestExitCode : exitCode;

  log(`final exit code: ${finalExitCode}`);
  process.exit(finalExitCode);
}

main().catch((err) => {
  log(`unexpected error in main(): ${err.message}`);
  executionState.errorMessage = err.message;
  executionState.cleanupStatus = 'unexpected error';
  // Attempt HTML report generation even on unexpected errors
  const androidJsonPath = path.join(ROOT, 'reports', 'android', 'cucumber-report.json');
  if (fs.existsSync(androidJsonPath)) {
    try {
      const { execSync: exec } = require('child_process');
      exec(`node "${__dirname}/generateReports.js" android`, { stdio: 'inherit', timeout: 60000 });
    } catch (e) {}
  }
  generateLifecycleReport();
  process.exit(1);
});
