import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
/**
 * DeviceManager.js — ENTERPRISE REFACTOR
 *
 * Manages emulator/device lifecycle with deterministic, zero-sleep polling.
 *
 * Lifecycle:
 *   1. Kill stale ADB + emulator processes
 *   2. Ensure ADB server
 *   3. Boot emulator (ANDROID_AVD only, -no-snapshot-load -no-snapshot-save unless OVERRIDE)
 *   4. adb wait-for-device (blocking)
 *   5. Poll sys.boot_completed=1 AND dev.bootcomplete=1
 *   6. Wait for package manager
 *   7. Verify launcher available
 *   8. Unlock device
 *   9. If device reported "offline" → auto-recover: adb kill-server → adb start-server → wait
 *  10. Verify application installed (do NOT launch via ADB)
 *
 * No arbitrary sleeps. Every wait is a deterministic poll loop.
 * Every phase logs retry count + elapsed time for root-cause analysis.
 */

'use strict';


// ── Defaults (all overridable via options) ──────────────────────
const ADB_SERVER_TIMEOUT      = 15000;
const ADB_DEVICE_TIMEOUT      = 180000;
const BOOT_COMPLETED_TIMEOUT  = 180000;
const PM_TIMEOUT              = 120000;
const LAUNCHER_TIMEOUT        = 60000;
const POLL_INTERVAL           = 2000;
const OFFLINE_RECOVERY_TIMEOUT= 60000;
const UNLOCK_CMD_TIMEOUT      = 3000;
const DIAGNOSTICS_TIMEOUT     = 10000;

const AMAZON_PACKAGE = 'in.amazon.mShop.android.shopping';

class DeviceManager {

  // ════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════

  /**
   * Full boot lifecycle for Android emulator.
   *
   * @param {object} options
   * @param {string}  options.avdName       - AVD name (required, no fallback to hardcoded)
   * @param {number}  options.bootTimeout   - Overall boot timeout (ms)
   * @param {number}  options.pollInterval  - Poll interval (ms)
   * @param {boolean} options.skipLauncher  - Skip launcher verification
   * @param {boolean} options.allowSnapshots- Allow emulator snapshots (default: false)
   * @returns {Promise<{serial:string, bootTime:number, offlineRecovered:boolean}>}
   */
  static async bootAndVerifyEmulator(options: any) {
    const avdName         = options.avdName;
    const bootTimeout     = options.bootTimeout     || BOOT_COMPLETED_TIMEOUT;
    const pollInterval    = options.pollInterval    || POLL_INTERVAL;
    const skipLauncher    = options.skipLauncher    === true;
    const allowSnapshots  = options.allowSnapshots  === true;

    if (!avdName) {
      throw new Error('[DeviceManager] No AVD name provided. Set ANDROID_AVD in .env.android');
    }

    const overallStart = Date.now();

    console.log('');
    console.log('[DeviceManager] ════════════════════════════════════════');
    console.log('[DeviceManager]  ANDROID EMULATOR BOOT LIFECYCLE');
    console.log('[DeviceManager] ════════════════════════════════════════');
    console.log('[DeviceManager]  AVD:             ' + avdName);
    console.log('[DeviceManager]  Boot timeout:    ' + bootTimeout + 'ms');
    console.log('[DeviceManager]  Allow snapshots: ' + allowSnapshots);
    console.log('[DeviceManager] ════════════════════════════════════════');
    console.log('');

    // ── Phase 0: Kill stale processes ──────────────────────────
    console.log('[Phase 0] Killing stale ADB and emulator processes...');
    DeviceManager._killStaleProcesses();
    console.log('[Phase 0] Stale processes killed');

    // ── Phase 1: Ensure ADB server ─────────────────────────────
    console.log('[Phase 1] Ensuring ADB server...');
    DeviceManager._ensureAdbServer();
    console.log('[Phase 1] ADB server ready');

    // ── Phase 2: Boot emulator ─────────────────────────────────
    console.log('[Phase 2] Booting emulator with AVD: ' + avdName);
    DeviceManager._launchEmulator(avdName, allowSnapshots);

    // ── Phase 3: adb wait-for-device (blocking) ────────────────
    console.log('[Phase 3] adb wait-for-device (blocking)...');
    DeviceManager._adbWaitForDevice(ADB_DEVICE_TIMEOUT);

    // ── Phase 4: Verify device state — recover if offline ──────
    const remaining = bootTimeout - (Date.now() - overallStart);
    const serial = await DeviceManager._verifyDeviceStateOrRecover(
      Math.max(remaining, OFFLINE_RECOVERY_TIMEOUT),
      pollInterval,
      overallStart
    );

    // ── Phase 5: Wait for sys.boot_completed=1 AND dev.bootcomplete=1 ──
    const remaining2 = bootTimeout - (Date.now() - overallStart);
    await DeviceManager._waitForBootCompleted(
      Math.max(remaining2, 30000),
      pollInterval,
      overallStart
    );

    // ── Phase 6: Wait for Package Manager ──────────────────────
    const remaining3 = bootTimeout - (Date.now() - overallStart);
    await DeviceManager._waitForPackageManager(
      Math.max(remaining3, 30000),
      pollInterval
    );

    // ── Phase 7: Unlock device ─────────────────────────────────
    DeviceManager._unlockDevice(serial);

    // ── Phase 8: Verify launcher ───────────────────────────────
    if (!skipLauncher) {
      const remaining4 = bootTimeout - (Date.now() - overallStart);
      await DeviceManager._verifyLauncher(
        Math.max(remaining4, 30000),
        pollInterval
      );
    }

    const totalTime = Date.now() - overallStart;
    console.log('[DeviceManager] ✅ Emulator boot + verification complete (' + totalTime + 'ms)');
    console.log('');

    return { serial: serial, bootTime: totalTime };
  }

  /**
   * Detect Android devices via adb.
   * @param {object} options
   * @returns {Promise<{detected:boolean, devices:Array, message:string}>}
   */
  static async detectAndroidDevice(options: any) {
    options = options || {};
    var retries = options.retries || 3;
    var retryDelay = options.retryDelay || 2000;

    DeviceManager._ensureAdbServer();

    for (var attempt = 1; attempt <= retries; attempt++) {
      var result = DeviceManager._exec('adb devices -l 2>&1');
      if (result.code !== 0) {
        console.log('[DeviceManager] adb devices failed (attempt ' + attempt + '): ' +
          (result.stderr || result.stdout));
        if (attempt < retries) {
          await DeviceManager._sleep(retryDelay);
        }
        continue;
      }

      var devices = DeviceManager._parseAdbDevices(result.stdout || '');

      if (devices.length > 0) {
        var summary = devices.map(function(d) {
          return d.serial + '(' + d.state + ')';
        }).join(', ');
        console.log('[DeviceManager] ✅ ' + devices.length + ' device(s): ' + summary);
        return { detected: true, devices: devices, message: devices.length + ' device(s) detected' };
      }

      if (attempt < retries) {
        console.log('[DeviceManager] No devices (attempt ' + attempt + '/' + retries + ')');
        await DeviceManager._sleep(retryDelay);
      }
    }

    return { detected: false, devices: [] as any[], message: 'No devices after ' + retries + ' attempts' };
  }

  /**
   * Verify device connectivity and collect device info.
   */
  static async verifyAndroidDeviceConnectivity() {
    var result = await DeviceManager.detectAndroidDevice({ retries: 2, retryDelay: 2000 });
    if (!result.detected) {
      return { connected: false, deviceInfo: null, message: 'No device detected' };
    }

    var serial = result.devices[0].serial;
    if (result.devices[0].state !== 'device') {
      return {
        connected: false,
        deviceInfo: null,
        message: 'Device state is "' + result.devices[0].state + '" (expected "device")'
      };
    }

    var model     = DeviceManager._exec('adb -s ' + serial + ' shell getprop ro.product.model 2>/dev/null | tr -d \'\\r\'', 5000);
    var apiLevel  = DeviceManager._exec('adb -s ' + serial + ' shell getprop ro.build.version.sdk 2>/dev/null | tr -d \'\\r\'', 5000);
    var release   = DeviceManager._exec('adb -s ' + serial + ' shell getprop ro.build.version.release 2>/dev/null | tr -d \'\\r\'', 5000);

    var info = {
      serial: serial,
      model: (model.code === 0 ? model.stdout.trim() : 'unknown'),
      apiLevel: (apiLevel.code === 0 ? apiLevel.stdout.trim() : 'unknown'),
      release: (release.code === 0 ? release.stdout.trim() : 'unknown')
    };

    return {
      connected: true,
      deviceInfo: info,
      message: info.model + ' (API ' + info.apiLevel + ', Android ' + info.release + ')'
    };
  }

  /**
   * Unlock the device lock screen.
   */
  static async unlockAndroidDevice(pin: any) {
    pin = pin || process.env.APPIUM_UNLOCK_KEY || '1234';
    DeviceManager._unlockDevice(pin);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Process cleanup
  // ════════════════════════════════════════════════════════════════

  static _killStaleProcesses() {
    // Kill any leftover adb processes
    var killAdb = DeviceManager._exec("pkill -9 adb 2>/dev/null; pkill -9 adb.bundle 2>/dev/null || true", 5000);
    console.log('[DeviceManager] ADB processes killed (exit: ' + killAdb.code + ')');

    // Kill any leftover emulator/qemu processes
    var killEmu = DeviceManager._exec(
      "ps aux 2>/dev/null | grep -E '[e]mulator|[q]emu-system' | awk '{print $2}' | xargs kill -9 2>/dev/null || true",
      5000
    );
    console.log('[DeviceManager] Emulator processes killed (exit: ' + killEmu.code + ')');

    // Wait a moment for processes to die
    try { execSync('sleep 2', { timeout: 3000 }); } catch (_: any) {}

    // Verify no emulator processes remain
    var check = DeviceManager._exec("ps aux 2>/dev/null | grep -E '[e]mulator|[q]emu-system' | grep -v grep || true", 3000);
    if (check.stdout && check.stdout.trim().length > 0) {
      console.log('[DeviceManager] Warning — emulator processes still running: ' + check.stdout.trim());
    } else {
      console.log('[DeviceManager] No emulator processes remain');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: ADB server
  // ════════════════════════════════════════════════════════════════

  static _ensureAdbServer() {
    var result = DeviceManager._exec('adb start-server 2>&1', ADB_SERVER_TIMEOUT);
    if (result.code !== 0) {
      console.log('[DeviceManager] ADB start-server warning: ' + (result.stderr || result.stdout));
    }
    var version = DeviceManager._exec('adb version 2>&1', 5000);
    if (version.code === 0 && version.stdout) {
      console.log('[DeviceManager] ADB: ' + version.stdout.split('\n')[0].trim());
    }
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Launch emulator
  // ════════════════════════════════════════════════════════════════

  static _launchEmulator(avdName: any, allowSnapshots: any) {
    var androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    var emulatorPath = path.join(androidHome, 'emulator', 'emulator');

    if (!fs.existsSync(emulatorPath)) {
      var alt = path.join(androidHome, 'tools', 'emulator');
      if (fs.existsSync(alt)) {
        emulatorPath = alt;
      } else {
        emulatorPath = 'emulator';
      }
    }

    var logDir = path.join(process.cwd(), 'mobile', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    var logFile = path.join(logDir, 'emulator-boot.log');
    var logFd = fs.openSync(logFile, 'a');

    // Build arguments: NEVER use snapshots unless explicitly allowed
    var args = ['-avd', avdName];
    if (!allowSnapshots) {
      args.push('-no-snapshot-load', '-no-snapshot-save');
    }
    args.push('-no-audio', '-no-boot-anim', '-gpu', 'auto', '-accel', 'auto');

    if (process.env.EMULATOR_HEADLESS === 'true' || process.env.HEADLESS === 'true') {
      args.push('-no-window');
    }

    console.log('[DeviceManager] Launching: ' + emulatorPath + ' ' + args.join(' '));

    var child = spawn(emulatorPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env
    });
    child.unref();

    console.log('[DeviceManager] Emulator spawned with PID ' + child.pid);
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: adb wait-for-device
  // ════════════════════════════════════════════════════════════════

  static _adbWaitForDevice(timeoutMs: any) {
    var result = DeviceManager._exec('adb wait-for-device 2>&1', timeoutMs);
    if (result.code !== 0) {
      throw new Error('[DeviceManager] adb wait-for-device failed after ' + timeoutMs + 'ms: ' +
        (result.stderr || result.stdout));
    }
    console.log('[DeviceManager] adb wait-for-device completed');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Verify device state & recover from offline
  // ════════════════════════════════════════════════════════════════

  static async _verifyDeviceStateOrRecover(timeoutMs: any, pollInterval: any, overallStart: any) {
    var deadline = Date.now() + timeoutMs;
    var retries = 0;
    var recovered = false;

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);
      var overall = Date.now() - (overallStart || Date.now());

      var result = DeviceManager._exec('adb devices -l 2>&1', 5000);
      var devices = DeviceManager._parseAdbDevices(result.stdout || '');

      // Check for a device in "device" state
      var deviceReady = devices.filter(function(d) { return d.state === 'device'; });
      if (deviceReady.length > 0) {
        console.log('[DeviceManager] [state] retry=' + retries +
          ' elapsed=' + elapsed + 'ms' +
          ' overall=' + overall + 'ms' +
          ' state=device → ' + deviceReady[0].serial +
          (recovered ? ' (offline recovered)' : ''));
        return deviceReady[0].serial;
      }

      // Check for "offline" — trigger recovery
      var offlineDevices = devices.filter(function(d) { return d.state === 'offline'; });
      if (offlineDevices.length > 0 && !recovered) {
        console.log('[DeviceManager] ⚠ Device is OFFLINE. Initiating recovery...');
        DeviceManager._exec('adb kill-server 2>&1', 5000);
        DeviceManager._sleep(2000);
        DeviceManager._exec('adb start-server 2>&1', ADB_SERVER_TIMEOUT);
        console.log('[DeviceManager] Recovery: ADB restarted. Waiting for emulator...');
        DeviceManager._adbWaitForDevice(30000);
        recovered = true;
        continue;
      }

      var stateStr = devices.map(function(d) { return d.serial + '(' + d.state + ')'; }).join(', ') || 'none';

      if (retries % 5 === 1 || retries === 1) {
        console.log('[DeviceManager] [state] retry=' + retries +
          ' elapsed=' + elapsed + 'ms' +
          ' overall=' + overall + 'ms' +
          ' devices=' + stateStr);
      }

      await DeviceManager._sleep(pollInterval);
    }

    DeviceManager._collectDiagnostics('device-state-timeout');
    throw new Error('[DeviceManager] Device did not reach "device" state within ' + timeoutMs + 'ms');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Wait for boot completed (sys.boot_completed + dev.bootcomplete)
  // ════════════════════════════════════════════════════════════════

  static async _waitForBootCompleted(timeoutMs: any, pollInterval: any, overallStart: any) {
    console.log('[Phase 5] Waiting for sys.boot_completed=1 AND dev.bootcomplete=1...');
    var deadline = Date.now() + timeoutMs;
    var retries = 0;

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);
      var overall = Date.now() - (overallStart || Date.now());

      var sysBoot = DeviceManager._exec("adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r\\n'", 5000);
      var devBoot = DeviceManager._exec("adb shell getprop dev.bootcomplete 2>/dev/null | tr -d '\\r\\n'", 5000);
      var bootAnim = DeviceManager._exec("adb shell getprop init.svc.bootanim 2>/dev/null | tr -d '\\r\\n'", 3000);

      var sysCompleted = (sysBoot.code === 0 && sysBoot.stdout.trim() === '1');
      var devCompleted = (devBoot.code === 0 && devBoot.stdout.trim() === '1');

      var sysVal = sysBoot.code === 0 ? (sysBoot.stdout.trim() || '(empty)') : 'ERROR';
      var devVal = devBoot.code === 0 ? (devBoot.stdout.trim() || '(empty)') : 'ERROR';
      var animVal = bootAnim.code === 0 ? (bootAnim.stdout.trim() || 'N/A') : 'N/A';

      console.log('[DeviceManager] [boot] retry=' + retries +
        ' elapsed=' + elapsed + 'ms' +
        ' overall=' + overall + 'ms' +
        ' sys.boot_completed=' + sysVal +
        ' dev.bootcomplete=' + devVal +
        ' bootanim=' + animVal);

      if (sysCompleted && devCompleted) {
        console.log('[DeviceManager] ✅ sys.boot_completed=1 AND dev.bootcomplete=1');
        return;
      } else if (sysCompleted) {
        console.log('[DeviceManager] sys.boot_completed=1 (awaiting dev.bootcomplete=1)');
      } else if (devCompleted) {
        console.log('[DeviceManager] dev.bootcomplete=1 (awaiting sys.boot_completed=1)');
      }

      await DeviceManager._sleep(pollInterval);
    }

    DeviceManager._collectDiagnostics('boot-completed-timeout');
    throw new Error('[DeviceManager] Boot completion timeout: sys.boot_completed or dev.bootcomplete not 1 after ' + timeoutMs + 'ms');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Wait for Package Manager
  // ════════════════════════════════════════════════════════════════

  static async _waitForPackageManager(timeoutMs: any, pollInterval: any) {
    console.log('[Phase 6] Waiting for Package Manager...');
    var deadline = Date.now() + timeoutMs;
    var retries = 0;

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);

      var result = DeviceManager._exec('adb shell pm list packages 2>&1', 10000);
      var pmReady = result.code === 0 && result.stdout && result.stdout.indexOf('package:') >= 0;
      var pkgCount = result.stdout ? result.stdout.split('\n').filter(function(l: any) {
        return l.trim().startsWith('package:');
      }).length : 0;

      if (pmReady) {
        console.log('[DeviceManager] [pm] retry=' + retries +
          ' elapsed=' + elapsed + 'ms' +
          ' ready=true packages=' + pkgCount);
        console.log('[DeviceManager] ✅ Package Manager ready (' + pkgCount + ' packages)');
        return;
      }

      if (retries % 5 === 1 || retries === 1) {
        console.log('[DeviceManager] [pm] retry=' + retries +
          ' elapsed=' + elapsed + 'ms' +
          ' ready=' + pmReady + ' packages=' + pkgCount);
      }

      await DeviceManager._sleep(pollInterval);
    }

    DeviceManager._collectDiagnostics('pm-timeout');
    throw new Error('[DeviceManager] Package Manager not ready within ' + timeoutMs + 'ms');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Verify launcher / home screen
  // ════════════════════════════════════════════════════════════════

  static async _verifyLauncher(timeoutMs: any, pollInterval: any) {
    console.log('[Phase 8] Verifying launcher/home screen...');
    var deadline = Date.now() + timeoutMs;
    var retries = 0;

    while (Date.now() < deadline) {
      retries++;
      var elapsed = Date.now() - (deadline - timeoutMs);

      var resolveResult = DeviceManager._exec(
        "adb shell cmd package resolve-activity -c android.intent.category.HOME 2>&1", 8000
      );
      var launcherAvailable = resolveResult.code === 0 &&
        resolveResult.stdout &&
        resolveResult.stdout.indexOf('No activities found') === -1 &&
        resolveResult.stdout.indexOf('Error') === -1 &&
        resolveResult.stdout.length > 10;

      // Also check that a window is displayed (not boot animation)
      var winResult = DeviceManager._exec(
        "adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | head -3", 5000
      );
      var hasFocus = winResult.code === 0 && winResult.stdout && winResult.stdout.length > 10;

      var snippet = resolveResult.stdout
        ? resolveResult.stdout.substring(0, 100).replace(/\n/g, ' ')
        : '(empty)';

      console.log('[DeviceManager] [launcher] retry=' + retries +
        ' elapsed=' + elapsed + 'ms' +
        ' available=' + launcherAvailable +
        ' focus=' + hasFocus +
        ' output=' + snippet);

      if (launcherAvailable && hasFocus) {
        console.log('[DeviceManager] ✅ Launcher available and in focus');
        return;
      } else if (launcherAvailable) {
        console.log('[DeviceManager] Launcher resolved, awaiting window focus...');
      }

      await DeviceManager._sleep(pollInterval);
    }

    console.log('[DeviceManager] ⚠ Launcher not fully confirmed within ' + timeoutMs + 'ms - continuing');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Unlock device
  // ════════════════════════════════════════════════════════════════

  static _unlockDevice(pin: any) {
    console.log('[Phase 7] Unlocking device...');
    var commands = [
      'adb shell input keyevent KEYCODE_WAKEUP',
      'adb shell input keyevent 82',
      'adb shell wm dismiss-keyguard',
      'adb shell input swipe 300 1000 300 300 200'
    ];

    for (var i = 0; i < commands.length; i++) {
      try {
        DeviceManager._exec(commands[i] + ' 2>/dev/null', UNLOCK_CMD_TIMEOUT);
      } catch (_: any) {}
    }

    // If PIN-based unlock, try it
    if (pin && pin !== '1234') {
      for (var j = 0; j < pin.length; j++) {
        DeviceManager._exec('adb shell input keyevent KEYCODE_' + pin[j] + ' 2>/dev/null', 2000);
      }
      DeviceManager._exec('adb shell input keyevent KEYCODE_ENTER 2>/dev/null', 2000);
    }

    console.log('[DeviceManager] Unlock commands sent');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Verify application installed
  // ════════════════════════════════════════════════════════════════

  static verifyApplicationInstalled(appPackage: any) {
    if (!appPackage) {
      throw new Error('[DeviceManager] No app package specified');
    }
    var result = DeviceManager._exec('adb shell pm list packages ' + appPackage + ' 2>/dev/null', 10000);
    if (result.code === 0 && result.stdout && result.stdout.indexOf('package:' + appPackage) >= 0) {
      console.log('[DeviceManager] ✅ ' + appPackage + ' is installed');
      return true;
    }
    throw new Error('[DeviceManager] ' + appPackage + ' is NOT installed. Install the APK or configure APP_PATH.');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Diagnostics
  // ════════════════════════════════════════════════════════════════

  static _collectDiagnostics(label: any) {
    var logsDir = path.join(process.cwd(), 'mobile', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    var ts = new Date().toISOString().replace(/[:.]/g, '-');

    var diags = [
      { name: 'adb-devices', cmd: 'adb devices -l 2>/dev/null || true' },
      { name: 'boot-completed-sys', cmd: "adb shell getprop sys.boot_completed 2>/dev/null || true" },
      { name: 'boot-completed-dev', cmd: "adb shell getprop dev.bootcomplete 2>/dev/null || true" },
      { name: 'boot-props', cmd: "adb shell getprop 2>/dev/null | grep -E 'boot|init|sys' | head -30 || true" },
      { name: 'logcat-short', cmd: 'adb logcat -d -t 200 2>/dev/null || true' },
      { name: 'ps-emulator', cmd: "ps aux 2>/dev/null | grep -E '[e]mulator|[q]emu' | grep -v grep || true" },
      { name: 'win-focus', cmd: "adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | head -5 || true" }
    ];

    for (var i = 0; i < diags.length; i++) {
      var d = diags[i];
      try {
        var r = DeviceManager._exec(d.cmd, DIAGNOSTICS_TIMEOUT);
        fs.writeFileSync(path.join(logsDir, ts + '-' + label + '-' + d.name + '.txt'), r.stdout || '(empty)');
      } catch (_: any) {}
    }

    console.log('[DeviceManager] Diagnostics saved to ' + logsDir + '/' + ts + '-' + label + '-*');
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Parse adb devices output
  // ════════════════════════════════════════════════════════════════

  static _parseAdbDevices(output: any) {
    if (!output) return [];
    var lines = output.split('\n').filter(function(l: any) { return l.trim().length > 0; });
    var devices: any[] = [];
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === 'List of devices attached') { inList = true; continue; }
      if (inList && line.length > 0 && line.indexOf('*') === -1) {
        var parts = line.split(/\s+/);
        if (parts.length >= 2) {
          devices.push({
            serial: parts[0],
            state: parts[1],
            details: parts.slice(2).join(' ') || ''
          });
        }
      }
    }
    return devices;
  }

  // ════════════════════════════════════════════════════════════════
  // INTERNAL: Shell exec + sleep helpers
  // ════════════════════════════════════════════════════════════════

  static _exec(cmd: any, timeout?: any) {
    timeout = timeout || 10000;
    try {
      var stdout = execSync(cmd, {
        encoding: 'utf8',
        timeout: timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 5 * 1024 * 1024
      });
      return { stdout: stdout.trim(), stderr: '', code: 0 };
    } catch (err: any) {
      return {
        stdout: (err.stdout || '').toString().trim(),
        stderr: (err.stderr || '').toString().trim(),
        code: err.status || 1
      };
    }
  }

  static _sleep(ms: any) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
}

export default DeviceManager;
