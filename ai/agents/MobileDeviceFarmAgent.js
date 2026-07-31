// MobileDeviceFarmAgent - Phase 8
// Manages cross-platform mobile device execution across emulators, simulators, real devices,
// and cloud device farms (BrowserStack / Sauce Labs).
// Supports parallel device execution and unified reporting.
const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const appiumConfig = require('../../config/appium.config');

// ---------- Device definitions ----------
const BUILTIN_DEVICES = {
  'android-emulator': {
    platform: 'android',
    type: 'emulator',
    deviceName: 'Android Emulator',
    automationName: 'UiAutomator2',
    // AVD resolved at runtime — no hardcoded default
    // Use getAndroidEmulatorConfig() to obtain a full config with dynamic AVD
  },
  'ios-simulator': {
    platform: 'ios',
    type: 'simulator',
    deviceName: 'iPhone 15',
    automationName: 'XCUITest',
    udid: process.env.IOS_SIM_UDID || '',
  },
};

// Cloud device farm configurations
/**
 * Return a complete Android emulator device config with dynamically resolved AVD.
 * Never hardcodes an AVD name — uses getPreferredAVD() from DeviceManager.
 */
function getAndroidEmulatorConfig() {
  try {
    const DeviceManager = require('../../mobile/lifecycle/DeviceManager');
    const avd = DeviceManager.getPreferredAVD();
    console.log('[MobileDeviceFarmAgent] Dynamic AVD resolution: ' + avd);
    return {
      ...BUILTIN_DEVICES['android-emulator'],
      avd: avd,
    };
  } catch (err) {
    console.warn('[MobileDeviceFarmAgent] AVD auto-detection failed: ' + err.message);
    console.warn('[MobileDeviceFarmAgent] Falling back to raw device config (no AVD specified)');
    return BUILTIN_DEVICES['android-emulator'];
  }
}

const CLOUD_PROVIDERS = {
  browserstack: {
    serverUrl: 'https://hub-cloud.browserstack.com/wd/hub',
    username: process.env.BROWSERSTACK_USERNAME || '',
    accessKey: process.env.BROWSERSTACK_ACCESS_KEY || '',
    buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Amazon Mobile Tests',
    projectName: process.env.BROWSERSTACK_PROJECT_NAME || 'AmazonWebMobile',
  },
  saucelabs: {
    serverUrl: process.env.SAUCE_URL || 'https://ondemand.us-west-1.saucelabs.com/wd/hub',
    username: process.env.SAUCE_USERNAME || '',
    accessKey: process.env.SAUCE_ACCESS_KEY || '',
  },
};

const REPORTS_DIR = path.join(process.cwd(), 'reports', 'mobile', 'device-farm');
const EXECUTION_STATE_PATH = path.join(process.cwd(), 'ai/memory/device-farm-state.json');

// ---------- Utilities ----------
function ensureDirs() {
  fs.ensureDirSync(REPORTS_DIR);
  fs.ensureDirSync(path.dirname(EXECUTION_STATE_PATH));
}

function loadExecutionState() {
  ensureDirs();
  if (!fs.existsSync(EXECUTION_STATE_PATH)) {
    fs.writeJsonSync(EXECUTION_STATE_PATH, { runs: [], activeDevices: [] }, { spaces: 2 });
  }
  return fs.readJsonSync(EXECUTION_STATE_PATH);
}

function saveExecutionState(state) {
  fs.writeJsonSync(EXECUTION_STATE_PATH, state, { spaces: 2 });
}

function getCapabilities(deviceConfig, appConfig = {}) {
  const platform = deviceConfig.platform || 'android';
  const isCloud = deviceConfig.cloudProvider;

  const caps = {
    platformName: platform === 'android' ? 'Android' : 'iOS',
    'appium:automationName': deviceConfig.automationName || (platform === 'android' ? 'UiAutomator2' : 'XCUITest'),
    'appium:deviceName': deviceConfig.deviceName || 'Device',
    'appium:platformVersion': deviceConfig.platformVersion || undefined,
    'appium:noReset': deviceConfig.noReset !== false,
    'appium:fullReset': deviceConfig.fullReset === true,
    'appium:newCommandTimeout': Number(process.env.NEW_COMMAND_TIMEOUT || 120),
  };

  // App under test
  if (appConfig.appPath) caps['appium:app'] = appConfig.appPath;
  if (appConfig.appPackage) caps['appium:appPackage'] = appConfig.appPackage;
  if (appConfig.appActivity) caps['appium:appActivity'] = appConfig.appActivity;
  if (appConfig.bundleId) caps['appium:bundleId'] = appConfig.bundleId;

  // Real device / UDID
  if (deviceConfig.udid) caps['appium:udid'] = deviceConfig.udid;

  // AVD for Android emulator
  if (deviceConfig.avd) caps['appium:avd'] = deviceConfig.avd;

  // iOS-specific native config
  if (platform === 'ios') {
    if (process.env.XCODE_ORG_ID) caps['appium:xcodeOrgId'] = process.env.XCODE_ORG_ID;
    if (process.env.XCODE_SIGNING_ID) caps['appium:xcodeSigningId'] = process.env.XCODE_SIGNING_ID;
    if (process.env.UPDATED_WDA_BUNDLE_ID) caps['appium:updatedWDABundleId'] = process.env.UPDATED_WDA_BUNDLE_ID;
    if (process.env.WDA_LOCAL_PORT) caps['appium:wdaLocalPort'] = Number(process.env.WDA_LOCAL_PORT);
    if (process.env.WDA_LAUNCH_TIMEOUT) caps['appium:wdaLaunchTimeout'] = Number(process.env.WDA_LAUNCH_TIMEOUT);
    if (process.env.AUTO_ACCEPT_ALERTS) caps['appium:autoAcceptAlerts'] = process.env.AUTO_ACCEPT_ALERTS === 'true';
    if (process.env.AUTO_DISMISS_ALERTS) caps['appium:autoDismissAlerts'] = process.env.AUTO_DISMISS_ALERTS === 'true';
  }

  // Cloud provider overlays
  if (isCloud === 'browserstack') {
    const bs = CLOUD_PROVIDERS.browserstack;
    caps['bstack:options'] = {
      userName: bs.username,
      accessKey: bs.accessKey,
      projectName: bs.projectName,
      buildName: bs.buildName,
      sessionName: deviceConfig.sessionName || `Mobile Test - ${deviceConfig.deviceName}`,
      local: process.env.BROWSERSTACK_LOCAL === 'true',
      localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER || '',
      appiumLogs: process.env.BROWSERSTACK_APPIUM_LOGS !== 'false',
      networkLogs: process.env.BROWSERSTACK_NETWORK_LOGS === 'true',
      debug: process.env.BROWSERSTACK_DEBUG === 'true',
      consoleLogs: process.env.BROWSERSTACK_CONSOLE_LOGS || 'errors',
    };
    if (!caps['appium:platformVersion'] && deviceConfig.realMobile) {
      caps['appium:platformVersion'] = platform === 'android' ? '14.0' : '17.0';
    }
    if (deviceConfig.realMobile) {
      caps['bstack:options'].realMobile = true;
    }
  }

  if (isCloud === 'saucelabs') {
    const sl = CLOUD_PROVIDERS.saucelabs;
    caps['sauce:options'] = {
      username: sl.username,
      accessKey: sl.accessKey,
      name: deviceConfig.sessionName || `Mobile Test - ${deviceConfig.deviceName}`,
      build: process.env.SAUCE_BUILD_NAME || `build-${Date.now()}`,
      appiumVersion: process.env.SAUCE_APPIUM_VERSION || '2.11.2',
    };
  }

  return caps;
}

// ---------- Device Farm Agent ----------
const MobileDeviceFarmAgent = {
  name: 'MobileDeviceFarmAgent',
  version: '1.0.0',

  // List available builtin device configurations
  listDevices() {
    return Object.entries(BUILTIN_DEVICES).map(([key, dev]) => ({
      id: key,
      platform: dev.platform,
      type: dev.type,
      deviceName: dev.deviceName,
      automationName: dev.automationName,
    }));
  },

  // Check Appium server health
  async checkAppiumHealth() {
    const AppiumAgent = require('./AppiumAgent');
    const status = await AppiumAgent.status();
    return status;
  },

  // Run tests on a single device
  async runOnDevice(deviceConfig, appConfig = {}, testOptions = {}) {
    const runId = `device-run-${deviceConfig.id || deviceConfig.deviceName}-${Date.now()}`;
    const deviceType = deviceConfig.type || 'emulator';
    const platform = deviceConfig.platform || 'android';

    console.log(`[MobileDeviceFarmAgent] Starting run ${runId} on ${deviceConfig.deviceName} (${deviceType})`);

    const state = loadExecutionState();
    const runInfo = {
      runId,
      device: deviceConfig.deviceName,
      platform,
      type: deviceType,
      cloudProvider: deviceConfig.cloudProvider || null,
      startedAt: new Date().toISOString(),
      status: 'running',
      tags: testOptions.tags || '',
      artifacts: { reports: [], logs: [] },
    };
    state.activeDevices.push(runInfo);
    saveExecutionState(state);

    try {
      const caps = getCapabilities(deviceConfig, appConfig);
      const configDir = path.join(REPORTS_DIR, runId);
      fs.ensureDirSync(configDir);
      const capsPath = path.join(configDir, 'capabilities.json');
      fs.writeJsonSync(capsPath, caps, { spaces: 2 });

      const env = {
        ...process.env,
        TEST_PLATFORM: platform.toUpperCase(),
        DEVICE_NAME: deviceConfig.deviceName,
        REPORT_DIR: configDir,
        APPIUM_HOST: deviceConfig.cloudProvider
          ? CLOUD_PROVIDERS[deviceConfig.cloudProvider]?.serverUrl?.split('://')[1]?.split(':')[0]
          : appiumConfig.host,
        APPIUM_PORT: String(appiumConfig.port),
        CLOUD_PROVIDER: deviceConfig.cloudProvider || '',
        DEVICE_CAPABILITIES_PATH: capsPath,
        TAGS: testOptions.tags || '',
      };

      if (deviceConfig.cloudProvider === 'browserstack') {
        env.APPIUM_HOST = 'hub-cloud.browserstack.com';
        env.APPIUM_PORT = '443';
        env.APPIUM_PROTOCOL = 'https';
        env.CLOUD_URL = CLOUD_PROVIDERS.browserstack.serverUrl;
      }
      if (deviceConfig.cloudProvider === 'saucelabs') {
        env.APPIUM_HOST = CLOUD_PROVIDERS.saucelabs.serverUrl.split('://')[1].split(':')[0];
        env.APPIUM_PORT = '443';
        env.APPIUM_PROTOCOL = 'https';
        env.CLOUD_URL = CLOUD_PROVIDERS.saucelabs.serverUrl;
      }

      const scriptName = platform === 'android' ? 'test:android' : 'test:ios';
      const result = spawnSync('npm', ['run', scriptName], {
        stdio: 'inherit',
        env,
        shell: false,
        timeout: testOptions.timeout || 600000,
      });

      const exitCode = result && typeof result.status === 'number' ? result.status : -1;
      runInfo.status = exitCode === 0 ? 'passed' : 'failed';
      runInfo.exitCode = exitCode;
      runInfo.completedAt = new Date().toISOString();

      if (fs.existsSync(configDir)) {
        const files = fs.readdirSync(configDir);
        for (const f of files) {
          runInfo.artifacts.reports.push(path.join(configDir, f));
        }
      }

      state.activeDevices = state.activeDevices.filter((d) => d.runId !== runId);
      state.runs = state.runs || [];
      state.runs.push(runInfo);
      saveExecutionState(state);

      console.log(`[MobileDeviceFarmAgent] Run ${runId} completed: ${runInfo.status} (exit: ${exitCode})`);

      return {
        ok: exitCode === 0,
        runId,
        status: runInfo.status,
        exitCode,
        device: deviceConfig.deviceName,
        artifacts: runInfo.artifacts,
        caps,
      };
    } catch (err) {
      runInfo.status = 'error';
      runInfo.error = err.message;
      runInfo.completedAt = new Date().toISOString();

      state.activeDevices = state.activeDevices.filter((d) => d.runId !== runId);
      state.runs = state.runs || [];
      state.runs.push(runInfo);
      saveExecutionState(state);

      return { ok: false, runId, status: 'error', error: err.message };
    }
  },

  // Run tests across multiple devices in parallel
  async runParallel(deviceConfigs, appConfig = {}, testOptions = {}) {
    const runId = `parallel-run-${Date.now()}`;
    console.log(`[MobileDeviceFarmAgent] Starting parallel run ${runId} across ${deviceConfigs.length} device(s)`);

    const promises = deviceConfigs.map((deviceCfg) =>
      this.runOnDevice(deviceCfg, appConfig, { ...testOptions, deviceId: deviceCfg.id })
    );

    const settled = await Promise.allSettled(promises);
    const results = settled.map((s) =>
      s.status === 'fulfilled' ? s.value : { ok: false, error: s.reason?.message || 'Unknown parallel error' }
    );

    const allPassed = results.every((r) => r.ok);
    const passedCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok).length;

    // Generate parallel run report
    const reportPath = path.join(REPORTS_DIR, `${runId}-parallel-report.md`);
    const lines = [];
    lines.push('# Parallel Mobile Device Execution Report');
    lines.push('');
    lines.push(`Run ID: ${runId}`);
    lines.push(`Executed At: ${new Date().toISOString()}`);
    lines.push(`Overall Status: **${allPassed ? 'PASSED' : 'PARTIAL / FAILED'}**`);
    lines.push(`Devices: ${deviceConfigs.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
    lines.push('');
    lines.push('## Device Results');
    lines.push('');
    lines.push('| Device | Platform | Type | Status | Exit Code |');
    lines.push('|---|---|---|---|---|');
    for (const r of results) {
      const pName = r.caps?.platformName || 'N/A';
      const dName = r.caps?.['appium:deviceName'] || r.device || 'N/A';
      const icon = r.ok ? '✅' : '❌';
      const code = r.exitCode !== undefined ? r.exitCode : (r.error ? '-' : '?');
      lines.push(`| ${icon} ${dName} | ${pName} | ${r.caps?.['appium:automationName'] || 'N/A'} | ${r.status || 'error'} | ${code} |`);
    }
    lines.push('');
    lines.push('## Errors');
    lines.push('');
    const errors = results.filter((r) => !r.ok);
    if (errors.length > 0) {
      for (const e of errors) {
        lines.push(`- **${e.device || 'Unknown device'}**: ${e.error || 'Exit code non-zero'}`);
      }
    } else {
      lines.push('*(none)*');
    }

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

    return {
      ok: allPassed,
      runId,
      totalDevices: deviceConfigs.length,
      passed: passedCount,
      failed: failedCount,
      results,
      reportPath: path.relative(process.cwd(), reportPath),
    };
  },

  // Convenience: run on built-in Android emulator
  async runAndroidEmulator(appConfig = {}, testOptions = {}) {
    const deviceConfig = getAndroidEmulatorConfig();
    return this.runOnDevice(deviceConfig, appConfig, testOptions);
  },

  // Convenience: run on built-in iOS simulator
  async runIOSSimulator(appConfig = {}, testOptions = {}) {
    return this.runOnDevice(BUILTIN_DEVICES['ios-simulator'], appConfig, testOptions);
  },

  // Run on a real Android device via USB
  async runAndroidRealDevice(udid, appConfig = {}, testOptions = {}) {
    const deviceCfg = {
      id: `android-real-${udid}`,
      platform: 'android',
      type: 'real',
      deviceName: udid || 'Android Real Device',
      automationName: 'UiAutomator2',
      udid,
      noReset: true,
    };
    return this.runOnDevice(deviceCfg, appConfig, testOptions);
  },

  // Run on a real iOS device via USB
  async runIOSRealDevice(udid, appConfig = {}, testOptions = {}) {
    const deviceCfg = {
      id: `ios-real-${udid}`,
      platform: 'ios',
      type: 'real',
      deviceName: udid || 'iOS Real Device',
      automationName: 'XCUITest',
      udid,
      noReset: true,
    };
    return this.runOnDevice(deviceCfg, appConfig, testOptions);
  },

  // Run on BrowserStack cloud
  async runOnBrowserStack(deviceConfig = {}, appConfig = {}, testOptions = {}) {
    const cloudCfg = { ...deviceConfig, cloudProvider: 'browserstack' };
    return this.runOnDevice(cloudCfg, appConfig, testOptions);
  },

  // Run on Sauce Labs cloud
  async runOnSauceLabs(deviceConfig = {}, appConfig = {}, testOptions = {}) {
    const cloudCfg = { ...deviceConfig, cloudProvider: 'saucelabs' };
    return this.runOnDevice(cloudCfg, appConfig, testOptions);
  },

  // Get execution history
  getRunHistory() {
    const state = loadExecutionState();
    return state.runs || [];
  },

  // Get active device runs
  getActiveRuns() {
    const state = loadExecutionState();
    return state.activeDevices || [];
  },

  // Main run method (for orchestrator compatibility)
  async run(input = {}) {
    console.log('[MobileDeviceFarmAgent] Cross-platform mobile device farm execution');

    const mode = input.mode || process.env.DEVICE_FARM_MODE || 'single';
    const platform = (input.platform || process.env.TEST_PLATFORM || 'android').toLowerCase();
    const devices = input.devices || [];
    const appConfig = {
      appPath: input.appPath || process.env.APP_PATH || '',
      appPackage: input.appPackage || process.env.APP_PACKAGE || '',
      appActivity: input.appActivity || process.env.APP_ACTIVITY || '',
      bundleId: input.bundleId || process.env.BUNDLE_ID || '',
    };
    const testOptions = {
      tags: input.tags || process.env.TAGS || '',
      timeout: input.timeout || 600000,
    };

    // Ensure Appium is running for local devices
    if (!input.cloudProvider) {
      try {
        const AppiumAgent = require('./AppiumAgent');
        await AppiumAgent.startServerIfNeeded();
      } catch (e) {
        console.warn('[MobileDeviceFarmAgent] Appium start warning:', e.message);
      }
    }

    let result;

    if (mode === 'parallel' && devices.length > 0) {
      const deviceConfigs = devices.map((d) => {
        if (typeof d === 'string') {
          return BUILTIN_DEVICES[d] || {
            id: d,
            platform,
            deviceName: d,
            type: 'emulator',
            automationName: platform === 'android' ? 'UiAutomator2' : 'XCUITest',
          };
        }
        return d;
      });
      result = await this.runParallel(deviceConfigs, appConfig, testOptions);
    } else if (mode === 'parallel' && platform === 'android') {
      result = await this.runParallel([BUILTIN_DEVICES['android-emulator']], appConfig, testOptions);
    } else if (mode === 'parallel' && platform === 'ios') {
      result = await this.runParallel([BUILTIN_DEVICES['ios-simulator']], appConfig, testOptions);
    } else if (input.cloudProvider === 'browserstack') {
      const cloudCfg = input.cloudDeviceConfig || {
        id: 'bs-android',
        platform: 'android',
        type: 'cloud',
        deviceName: process.env.BROWSERSTACK_DEVICE || 'Google Pixel 8',
        platformVersion: process.env.BROWSERSTACK_OS_VERSION || '14.0',
        realMobile: true,
      };
      result = await this.runOnBrowserStack(cloudCfg, appConfig, testOptions);
    } else if (input.cloudProvider === 'saucelabs') {
      const cloudCfg = input.cloudDeviceConfig || {
        id: 'sl-ios',
        platform: 'ios',
        type: 'cloud',
        deviceName: process.env.SAUCE_DEVICE || 'iPhone 15 Pro Max',
        platformVersion: process.env.SAUCE_OS_VERSION || '17.0',
        realMobile: true,
      };
      result = await this.runOnSauceLabs(cloudCfg, appConfig, testOptions);
    } else if (input.udid && platform === 'android') {
      result = await this.runAndroidRealDevice(input.udid, appConfig, testOptions);
    } else if (input.udid && platform === 'ios') {
      result = await this.runIOSRealDevice(input.udid, appConfig, testOptions);
    } else if (platform === 'android') {
      result = await this.runAndroidEmulator(appConfig, testOptions);
    } else {
      result = await this.runIOSSimulator(appConfig, testOptions);
    }

    // Cleanup Appium if started by this agent
    if (!input.cloudProvider) {
      try {
        const AppiumAgent = require('./AppiumAgent');
        await AppiumAgent.stopServerIfStartedByFramework();
      } catch (e) {
        console.warn('[MobileDeviceFarmAgent] Appium cleanup warning:', e.message);
      }
    }

    return result;
  },
};

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  if (command === 'list') {
    const devices = MobileDeviceFarmAgent.listDevices();
    console.log('Available builtin devices:');
    for (const d of devices) {
      console.log(`  ${d.id}: ${d.deviceName} (${d.platform}/${d.type})`);
    }
    return;
  }

  if (command === 'run') {
    const platform = args[1] || process.env.TEST_PLATFORM || 'android';
    const result = await MobileDeviceFarmAgent.run({ platform });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'parallel') {
    const platforms = args.slice(1).length > 0 ? args.slice(1) : ['android', 'ios'];
    const deviceConfigs = platforms.map((p) =>
      BUILTIN_DEVICES[`${p}-emulator`] ||
      BUILTIN_DEVICES[`${p}-simulator`] || {
        id: p,
        platform: p,
        deviceName: p === 'android' ? 'Android Emulator' : 'iPhone 15',
        type: 'emulator',
        automationName: p === 'android' ? 'UiAutomator2' : 'XCUITest',
      }
    );
    const result = await MobileDeviceFarmAgent.runParallel(deviceConfigs);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'browserstack') {
    const result = await MobileDeviceFarmAgent.runOnBrowserStack();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'saucelabs') {
    const result = await MobileDeviceFarmAgent.runOnSauceLabs();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'history') {
    const history = MobileDeviceFarmAgent.getRunHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  if (command === 'health') {
    const status = await MobileDeviceFarmAgent.checkAppiumHealth();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`Unknown command: ${command}`);
  console.log('Available commands: list, run [platform], parallel [platforms...], browserstack, saucelabs, history, health');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[MobileDeviceFarmAgent] CLI error:', e.message);
    process.exit(1);
  });
}

module.exports = MobileDeviceFarmAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Mobile Device Farm Agent",
  "version": "1.0.0",
  "description": "Cross-platform device farm execution on emulators, real devices, BrowserStack, SauceLabs",
  "dependencies": [
    "AppiumAgent"
  ],
  "platforms": [
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "mobile",
    "device-farm"
  ],
  "executionStage": "execution",
  "priority": 45,
  "conditions": [
    {
      "type": "platform",
      "value": "mobile"
    },
    {
      "type": "deviceFarm"
    }
  ],
  "retryPolicy": {
    "maxRetries": 2,
    "backoff": "linear"
  },
  "lifecycle": "active"
};
