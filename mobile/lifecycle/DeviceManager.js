/**
 * DeviceManager.js
 *
 * Manages device and emulator/simulator lifecycle:
 *   - Detect connected devices (Android/iOS)
 *   - Boot emulators/simulators if needed
 *   - Wait for boot completion
 *   - Unlock devices
 *
 * Supports retry logic for device detection.
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeviceManager {
  /**
   * Detect Android emulator or device.
   * @param {object} options
   * @param {number} options.retries - Number of retry attempts (default 3)
   * @param {number} options.retryDelay - Delay between retries in ms (default 3000)
   * @returns {Promise<{detected: boolean, devices: Array, message: string}>}
   */
  static async detectAndroidDevice(options) {
    options = options || {};
    var retries = options.retries || 3;
    var retryDelay = options.retryDelay || 3000;

    for (var attempt = 1; attempt <= retries; attempt++) {
      var result = DeviceManager._exec('adb devices -l 2>&1');
      if (result.code !== 0) {
        if (attempt < retries) {
          await DeviceManager._sleep(retryDelay);
          continue;
        }
        return {
          detected: false,
          devices: [],
          message: 'adb command failed: ' + (result.stderr || result.stdout)
        };
      }

      var lines = result.stdout.split('\n').filter(function(l) { return l.trim().length > 0; });
      var devices = [];
      var inList = false;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line === 'List of devices attached') {
          inList = true;
          continue;
        }
        if (inList && line.length > 0) {
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

      var readyDevices = devices.filter(function(d) { return d.state === 'device'; });

      if (readyDevices.length > 0) {
        return {
          detected: true,
          devices: readyDevices,
          message: readyDevices.length + ' device(s) detected via adb'
        };
      }

      if (attempt < retries) {
        await DeviceManager._sleep(retryDelay);
      }
    }

    return {
      detected: false,
      devices: [],
      message: 'No Android device/emulator detected after ' + retries + ' attempts'
    };
  }

  /**
   * Boot an Android emulator.
   * @param {string} avdName - Name of the AVD to boot
   * @param {number} timeoutMs - Max time to wait for boot (default 180000)
   * @returns {Promise<{booted: boolean, message: string, bootTime: number}>}
   */
  static async bootAndroidEmulator(avdName, timeoutMs) {
    if (!avdName) {
      avdName = process.env.ANDROID_AVD || process.env.AVD_NAME || 'Pixel_6_API_34';
    }
    timeoutMs = timeoutMs || 180000;

    var startTime = Date.now();

    // Check if emulator is already running
    var deviceCheck = await DeviceManager.detectAndroidDevice({ retries: 1, retryDelay: 1000 });
    if (deviceCheck.detected) {
      return {
        booted: true,
        message: 'Emulator already running',
        bootTime: 0
      };
    }

    // Get emulator path
    var androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    var emulatorPath = path.join(androidHome, 'emulator', 'emulator');

    if (!fs.existsSync(emulatorPath)) {
      // Try alternative locations
      var altPaths = [
        path.join(androidHome, 'tools', 'emulator'),
        'emulator'
      ];
      for (var i = 0; i < altPaths.length; i++) {
        if (fs.existsSync(altPaths[i]) || altPaths[i] === 'emulator') {
          emulatorPath = altPaths[i];
          break;
        }
      }
    }

    // Launch emulator in background
    var logFile = path.join(process.cwd(), 'mobile', 'logs', 'emulator-boot.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    var logFd = fs.openSync(logFile, 'a');

    var emulatorArgs = [
      '-avd', avdName,
      '-no-audio',
      '-no-boot-anim',
      '-gpu', 'auto',
      '-accel', 'auto'
    ];

    // Support headless mode
    if (process.env.EMULATOR_HEADLESS === 'true') {
      emulatorArgs.push('-no-window');
    }

    var child = spawn(emulatorPath, emulatorArgs, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env
    });
    child.unref();

    // Wait for boot to complete
    var booted = await DeviceManager._waitForAndroidBoot(timeoutMs - (Date.now() - startTime));

    if (booted) {
      return {
        booted: true,
        message: 'Emulator booted successfully',
        bootTime: Date.now() - startTime
      };
    }

    return {
      booted: false,
      message: 'Emulator failed to boot within ' + timeoutMs + 'ms',
      bootTime: Date.now() - startTime
    };
  }

  /**
   * Wait for Android device boot to complete.
   */
  static async _waitForAndroidBoot(timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      var result = DeviceManager._exec(
        'adb shell getprop sys.boot_completed 2>/dev/null | tr -d \'\\r\' | tr -d \'\\n\'',
        5000
      );
      if (result.code === 0 && result.stdout === '1') {
        // Also verify device is unlocked
        var lockedResult = DeviceManager._exec(
          'adb shell dumpsys window 2>/dev/null | grep -i "mDreamingLockscreen=false\\|isStatusBarKeyguard=false\\|mShowingLockscreen=false" | head -1',
          5000
        );
        await DeviceManager._sleep(2000); // Settling time
        return true;
      }
      await DeviceManager._sleep(2000);
    }
    return false;
  }

  /**
   * Verify device connectivity and get device info.
   * @returns {Promise<{connected: boolean, deviceInfo: object|null, message: string}>}
   */
  static async verifyAndroidDeviceConnectivity() {
    var deviceResult = await DeviceManager.detectAndroidDevice({ retries: 2, retryDelay: 2000 });
    if (!deviceResult.detected) {
      return { connected: false, deviceInfo: null, message: deviceResult.message };
    }

    var serial = deviceResult.devices[0].serial;

    // Get device info
    var propsResult = DeviceManager._exec(
      'adb -s ' + serial + ' shell getprop ro.product.model 2>/dev/null | tr -d \'\\r\'',
      5000
    );
    var model = propsResult.code === 0 ? propsResult.stdout.trim() : 'unknown';

    var apiResult = DeviceManager._exec(
      'adb -s ' + serial + ' shell getprop ro.build.version.sdk 2>/dev/null | tr -d \'\\r\'',
      5000
    );
    var apiLevel = apiResult.code === 0 ? apiResult.stdout.trim() : 'unknown';

    var releaseResult = DeviceManager._exec(
      'adb -s ' + serial + ' shell getprop ro.build.version.release 2>/dev/null | tr -d \'\\r\'',
      5000
    );
    var release = releaseResult.code === 0 ? releaseResult.stdout.trim() : 'unknown';

    return {
      connected: true,
      deviceInfo: {
        serial: serial,
        model: model,
        apiLevel: apiLevel,
        release: release
      },
      message: 'Device ' + model + ' (API ' + apiLevel + ', Android ' + release + ') connected'
    };
  }

  /**
   * Unlock Android device.
   * @param {string} pin - PIN/password for lock screen
   * @returns {Promise<boolean>}
   */
  static async unlockAndroidDevice(pin) {
    pin = pin || process.env.APPIUM_UNLOCK_KEY || '1234';
    try {
      // Wake up device
      DeviceManager._exec('adb shell input keyevent KEYCODE_WAKEUP 2>/dev/null', 3000);
      await DeviceManager._sleep(500);

      // Dismiss keyguard
      DeviceManager._exec('adb shell am broadcast -a android.intent.action.USER_PRESENT 2>/dev/null', 3000);
      await DeviceManager._sleep(300);

      // Try swipe to unlock
      DeviceManager._exec(
        'adb shell input swipe 300 1000 300 300 200 2>/dev/null',
        3000
      );
      await DeviceManager._sleep(500);

      // Check if still locked
      var checkResult = DeviceManager._exec(
        'adb shell dumpsys window 2>/dev/null | grep -E "mDreamingLockscreen|isStatusBarKeyguard|mShowingLockscreen" | head -3',
        5000
      );

      if (checkResult.stdout && checkResult.stdout.includes('false')) {
        return true;
      }

      // Try PIN entry
      if (pin) {
        for (var i = 0; i < pin.length; i++) {
          DeviceManager._exec('adb shell input keyevent KEYCODE_' + pin[i] + ' 2>/dev/null', 2000);
          await DeviceManager._sleep(100);
        }
        DeviceManager._exec('adb shell input keyevent KEYCODE_ENTER 2>/dev/null', 2000);
        await DeviceManager._sleep(1000);
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // iOS Simulator Methods
  // ────────────────────────────────────────────────────────────────

  /**
   * Detect iOS simulator or device.
   * @param {object} options
   * @returns {Promise<{detected: boolean, simulators: Array, message: string}>}
   */
  static async detectIOSSimulator(options) {
    options = options || {};
    var udid = options.udid || process.env.UDID || '';

    var result = DeviceManager._exec('xcrun simctl list devices --json 2>&1', 15000);
    if (result.code !== 0) {
      return {
        detected: false,
        simulators: [],
        message: 'simctl failed: ' + (result.stderr || result.stdout)
      };
    }

    try {
      var data = JSON.parse(result.stdout);
      var allSims = [];
      var runtimes = data.devices || {};

      for (var runtime in runtimes) {
        if (runtimes.hasOwnProperty(runtime)) {
          for (var j = 0; j < runtimes[runtime].length; j++) {
            var sim = runtimes[runtime][j];
            if (sim.isAvailable !== false) {
              allSims.push({
                udid: sim.udid,
                name: sim.name,
                state: sim.state,
                runtime: runtime,
                isBooted: sim.state === 'Booted'
              });
            }
          }
        }
      }

      // Filter by UDID if specified
      var matchedSims = allSims;
      if (udid) {
        matchedSims = allSims.filter(function(s) { return s.udid === udid; });
      }

      // Look for booted sim first, then any available
      var bootedSims = matchedSims.filter(function(s) { return s.isBooted; });
      var availableSims = matchedSims;

      if (bootedSims.length > 0) {
        return {
          detected: true,
          simulators: bootedSims,
          message: bootedSims[0].name + ' (' + bootedSims[0].udid + ') already booted'
        };
      }

      if (availableSims.length > 0) {
        return {
          detected: true,
          simulators: availableSims,
          message: availableSims.length + ' simulator(s) available (none booted)'
        };
      }

      return {
        detected: false,
        simulators: [],
        message: 'No iOS simulators found. Create one via: xcrun simctl create'
      };

    } catch (parseErr) {
      return {
        detected: false,
        simulators: [],
        message: 'Failed to parse simctl output: ' + parseErr.message
      };
    }
  }

  /**
   * Boot an iOS simulator.
   * @param {string} udid - UDID of the simulator to boot
   * @param {number} timeoutMs - Max wait time (default 180000)
   * @returns {Promise<{booted: boolean, message: string, bootTime: number}>}
   */
  static async bootIOSSimulator(udid, timeoutMs) {
    timeoutMs = timeoutMs || 180000;
    var startTime = Date.now();

    if (!udid) {
      udid = process.env.UDID || '';
    }

    if (!udid) {
      // Auto-discover first available simulator
      var detectResult = await DeviceManager.detectIOSSimulator();
      if (detectResult.detected && detectResult.simulators.length > 0) {
        udid = detectResult.simulators[0].udid;
        // If already booted, return immediately
        if (detectResult.simulators[0].isBooted) {
          return {
            booted: true,
            message: 'Simulator already booted: ' + detectResult.simulators[0].name,
            bootTime: 0
          };
        }
      } else {
        return {
          booted: false,
          message: 'No simulator found to boot',
          bootTime: 0
        };
      }
    }

    // Boot the simulator
    var bootResult = DeviceManager._exec(
      'xcrun simctl boot ' + udid + ' 2>&1',
      30000
    );

    if (bootResult.code !== 0 && !bootResult.stdout.includes('already booted')) {
      return {
        booted: false,
        message: 'Failed to boot simulator: ' + (bootResult.stderr || bootResult.stdout),
        bootTime: Date.now() - startTime
      };
    }

    // Open Simulator.app (optional, for visibility)
    if (process.env.SIMULATOR_APP_VISIBLE !== 'false') {
      DeviceManager._exec('open -a Simulator 2>/dev/null', 5000);
    }

    // Wait for boot to complete
    var booted = await DeviceManager._waitForIOSBoot(udid, timeoutMs - (Date.now() - startTime));

    if (booted) {
      return {
        booted: true,
        message: 'Simulator booted successfully',
        bootTime: Date.now() - startTime
      };
    }

    return {
      booted: false,
      message: 'Simulator failed to boot within ' + timeoutMs + 'ms',
      bootTime: Date.now() - startTime
    };
  }

  /**
   * Wait for iOS simulator to finish booting.
   */
  static async _waitForIOSBoot(udid, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      var result = DeviceManager._exec(
        'xcrun simctl bootstatus ' + udid + ' 2>&1',
        10000
      );
      if (result.code === 0) {
        await DeviceManager._sleep(2000);
        return true;
      }
      // If bootstatus is not available, check state as fallback
      var stateResult = DeviceManager._exec(
        'xcrun simctl list devices --json 2>&1',
        10000
      );
      if (stateResult.code === 0) {
        try {
          var data = JSON.parse(stateResult.stdout);
          for (var runtime in data.devices) {
            if (data.devices.hasOwnProperty(runtime)) {
              for (var i = 0; i < data.devices[runtime].length; i++) {
                var sim = data.devices[runtime][i];
                if (sim.udid === udid && sim.state === 'Booted') {
                  await DeviceManager._sleep(3000);
                  return true;
                }
              }
            }
          }
        } catch (_) {}
      }
      await DeviceManager._sleep(3000);
    }
    return false;
  }

  /**
   * Unlock iOS simulator (dismiss lock screen).
   */
  static async unlockIOSSimulator(udid) {
    udid = udid || process.env.UDID || '';
    try {
      // Tap to wake / dismiss lock screen
      if (udid) {
        DeviceManager._exec('xcrun simctl ' + udid + ' button Home 2>/dev/null', 3000);
        await DeviceManager._sleep(500);
        DeviceManager._exec('xcrun simctl ' + udid + ' swipe up 2>/dev/null', 3000);
      } else {
        DeviceManager._exec('xcrun simctl booted button Home 2>/dev/null', 3000);
        await DeviceManager._sleep(500);
        DeviceManager._exec('xcrun simctl booted swipe up 2>/dev/null', 3000);
      }
      await DeviceManager._sleep(2000);
      return true;
    } catch (err) {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // General utilities
  // ────────────────────────────────────────────────────────────────

  static _exec(cmd, timeout) {
    timeout = timeout || 10000;
    try {
      var stdout = execSync(cmd, {
        encoding: 'utf8',
        timeout: timeout,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { stdout: stdout.trim(), stderr: '', code: 0 };
    } catch (err) {
      return {
        stdout: (err.stdout || '').toString().trim(),
        stderr: (err.stderr || '').toString().trim(),
        code: err.status || 1
      };
    }
  }

  static _sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
}

module.exports = DeviceManager;
