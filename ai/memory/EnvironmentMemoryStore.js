/**
 * EnvironmentMemoryStore.js
 *
 * Captures environment state for each execution run.
 * Tracks: platform, browser, Node version, OS, environment variables,
 * service versions (Appium, ADB, Xcode), and run context.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const STORE_PATH = path.join(__dirname, 'environment-memory.json');

class EnvironmentMemoryStore {
  constructor() {
    this._ensure();
  }

  _ensure() {
    fs.ensureDirSync(path.dirname(STORE_PATH));
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeJsonSync(STORE_PATH, { environments: [], latest: null }, { spaces: 2 });
    }
  }

  _read() { return fs.readJsonSync(STORE_PATH); }
  _write(data) { fs.writeJsonSync(STORE_PATH, data, { spaces: 2 }); }

  /**
   * Capture current environment state.
   */
  capture(options = {}) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      runId: options.runId || `run-${Date.now()}`,
      platform: options.platform || process.env.TEST_PLATFORM || 'WEB',
      browser: options.browser || process.env.BROWSER || 'chromium',
      headless: process.env.HEADLESS !== 'false',
      nodeVersion: process.version,
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + 'GB'
      },
      environment: {
        ci: !!process.env.CI,
        parallel: Number(process.env.PARALLEL || 1),
        reportDir: process.env.REPORT_DIR || 'reports',
        baseUrl: process.env.BASE_URL || ''
      },
      appium: {
        host: process.env.APPIUM_HOST || '127.0.0.1',
        port: Number(process.env.APPIUM_PORT || 4723)
      }
    };

    const data = this._read();
    data.environments.push(snapshot);
    data.latest = snapshot;

    // Keep last 100 entries
    if (data.environments.length > 100) {
      data.environments = data.environments.slice(-100);
    }

    this._write(data);
    return snapshot;
  }

  /**
   * Get the latest environment snapshot.
   */
  getLatest() {
    const data = this._read();
    return data.latest;
  }

  /**
   * Get environment history.
   */
  getHistory(limit = 10) {
    const data = this._read();
    return data.environments.slice(-limit);
  }
}

module.exports = EnvironmentMemoryStore;
