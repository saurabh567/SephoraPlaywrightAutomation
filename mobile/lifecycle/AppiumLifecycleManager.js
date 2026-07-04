/**
 * AppiumLifecycleManager.js
 *
 * Enterprise-grade Appium server lifecycle management.
 * Features:
 *   - Start Appium server with retry logic
 *   - Wait for health endpoint (/status) readiness
 *   - Configurable host, port, base path
 *   - Graceful shutdown
 *   - Persistent state tracking (PID, started-by-framework)
 *
 * This is an improved version of the existing mobile/utils/appiumServerManager.js.
 */

'use strict';

const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class AppiumLifecycleManager {
  constructor(options) {
    options = options || {};

    this.protocol = options.protocol || process.env.APPIUM_PROTOCOL || 'http';
    this.host = options.host || process.env.APPIUM_HOST || '127.0.0.1';
    this.port = Number(options.port || process.env.APPIUM_PORT || 4723);
    this.basePath = options.basePath || process.env.APPIUM_BASE_PATH || '/';
    this.autoStart = options.autoStart !== undefined ? options.autoStart : (process.env.APPIUM_AUTO_START !== 'false');
    this.autoStop = options.autoStop !== undefined ? options.autoStop : (process.env.APPIUM_AUTO_STOP !== 'false');
    this.startTimeout = Number(options.startTimeout || process.env.APPIUM_START_TIMEOUT || 30000);
    this.retryCount = Number(options.retryCount || process.env.APPIUM_RETRY_COUNT || 3);
    this.retryDelay = Number(options.retryDelay || process.env.APPIUM_RETRY_DELAY || 5000);

    this.logDir = options.logDir || path.join(process.cwd(), 'mobile', 'logs');
    this.logPath = options.logPath || path.join(this.logDir, 'appium-server.log');
    this.pidPath = options.pidPath || path.join(this.logDir, 'appium-server.pid');
    this.statePath = options.statePath || path.join(this.logDir, 'appium-server-state.json');

    this.statusUrl = this.protocol + '://' + this.host + ':' + this.port + '/status';
    this.serverUrl = this.protocol + '://' + this.host + ':' + this.port + this.basePath;

    this._child = null;
    this._startedByFramework = false;

    // Ensure log directory exists
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /**
   * Ensure log directory exists.
   */
  _ensureLogDir() {
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
  }

  /**
   * Append a message to the Appium server log.
   */
  _appendLog(message) {
    this._ensureLogDir();
    var line = '[' + new Date().toISOString() + '] ' + message + '\n';
    fs.appendFileSync(this.logPath, line);
  }

  /**
   * Check if the Appium health endpoint responds.
   * @returns {Promise<{running: boolean, healthy: boolean, body: object|null, error: string|null}>}
   */
  async checkStatus() {
    return new Promise(function(resolve) {
      var req = http.get(this.statusUrl, { timeout: 5000 }, function(res) {
        var body = '';
        res.on('data', function(chunk) { body += chunk; });
        res.on('end', function() {
          var parsed = null;
          var healthy = false;
          try {
            parsed = JSON.parse(body);
            healthy = parsed.value && parsed.value.ready !== false;
          } catch (_) {
            healthy = res.statusCode === 200;
          }
          resolve({
            running: true,
            healthy: healthy,
            body: parsed,
            error: null
          });
        });
      }.bind(this));

      req.on('error', function(err) {
        resolve({
          running: false,
          healthy: false,
          body: null,
          error: err.message
        });
      });

      req.on('timeout', function() {
        req.destroy();
        resolve({
          running: false,
          healthy: false,
          body: null,
          error: 'Connection timed out'
        });
      });
    }.bind(this));
  }

  /**
   * Check if the Appium port is open (TCP check).
   */
  _isPortOpen() {
    return new Promise(function(resolve) {
      var socket = net.createConnection({ host: this.host, port: this.port });

      socket.once('connect', function() {
        socket.destroy();
        resolve(true);
      });

      socket.once('error', function() {
        socket.destroy();
        resolve(false);
      });

      socket.setTimeout(2000, function() {
        socket.destroy();
        resolve(false);
      });
    }.bind(this));
  }

  /**
   * Write Appium server state to disk.
   */
  _writeState(pid) {
    this._ensureLogDir();
    fs.writeFileSync(this.pidPath, String(pid));
    fs.writeFileSync(this.statePath, JSON.stringify({
      pid: pid,
      startedByFramework: true,
      host: this.host,
      port: this.port,
      basePath: this.basePath,
      startedAt: new Date().toISOString()
    }, null, 2));
  }

  /**
   * Read Appium server state from disk.
   */
  _readState() {
    if (!fs.existsSync(this.statePath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  /**
   * Clear Appium server state files.
   */
  _clearState() {
    for (var i = 0; i < [this.pidPath, this.statePath].length; i++) {
      var p = [this.pidPath, this.statePath][i];
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  }

  /**
   * Wait for the Appium health endpoint to report healthy.
   * @param {number} timeoutMs - Maximum time to wait
   */
  async waitForHealthy(timeoutMs) {
    var deadline = Date.now() + (timeoutMs || this.startTimeout);

    while (Date.now() < deadline) {
      var status = await this.checkStatus();
      if (status.running && status.healthy) {
        return status;
      }
      await this._sleep(1000);
    }

    throw new Error('Timed out waiting for Appium health at ' + this.statusUrl +
      ' after ' + (timeoutMs || this.startTimeout) + 'ms');
  }

  /**
   * Spawn the Appium server process.
   */
  _spawn() {
    this._ensureLogDir();
    var logFd = fs.openSync(this.logPath, 'a');

    this._appendLog('Starting Appium server on ' + this.host + ':' + this.port + this.basePath);

    var args = [
      'appium',
      '--address', this.host,
      '--port', String(this.port),
      '--base-path', this.basePath
    ];

    // Use --use-plugins if set
    if (process.env.APPIUM_USE_PLUGINS) {
      args.push('--use-plugins', process.env.APPIUM_USE_PLUGINS);
    }

    // Use --driver if set (for xcuitest)
    if (process.env.APPIUM_USE_DRIVERS) {
      args.push('--use-drivers', process.env.APPIUM_USE_DRIVERS);
    }

    this._child = spawn('npx', args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env
    });

    this._child.unref();
    this._writeState(this._child.pid);
    this._startedByFramework = true;
    this._appendLog('Appium server process started with pid ' + this._child.pid);
    return this._child;
  }

  /**
   * Start the Appium server with retry logic.
   * @returns {Promise<{startedByFramework: boolean, status: object}>}
   */
  async start() {
    // First check if already running
    var status = await this.checkStatus();
    if (status.running && status.healthy) {
      this._appendLog('Appium server already running');
      return { startedByFramework: false, status: status };
    }

    // Check if port is occupied by a non-Appium process
    if (await this._isPortOpen()) {
      throw new Error('Port ' + this.port + ' is already in use but ' +
        this.statusUrl + ' is not healthy. Kill the process or use a different port.');
    }

    if (!this.autoStart) {
      throw new Error('Appium server is not running and APP_AUTO_START is disabled. ' +
        'Start it manually or set APP_AUTO_START=true');
    }

    // Retry loop
    var lastError = null;
    for (var attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        this._appendLog('Appium startup attempt ' + attempt + '/' + this.retryCount);
        this._spawn();
        var healthyStatus = await this.waitForHealthy(this.startTimeout);
        this._appendLog('Appium server started successfully (attempt ' + attempt + ')');
        return { startedByFramework: true, status: healthyStatus };
      } catch (error) {
        lastError = error;
        this._appendLog('Appium startup attempt ' + attempt + ' failed: ' + error.message);
        await this.stop(true);

        if (attempt < this.retryCount) {
          this._appendLog('Retrying in ' + this.retryDelay + 'ms...');
          await this._sleep(this.retryDelay);
        }
      }
    }

    throw new Error('Appium server failed to start after ' + this.retryCount + ' attempts. ' +
      'Last error: ' + (lastError ? lastError.message : 'unknown'));
  }

  /**
   * Stop the Appium server.
   * @param {boolean} force - Force stop even if autoStop is disabled
   */
  async stop(force) {
    force = force || false;

    if (!this._startedByFramework) {
      var state = this._readState();
      if (!state || !state.startedByFramework) {
        this._appendLog('Appium stop skipped — not started by this instance');
        return { stopped: false, reason: 'not-started-by-this-instance' };
      }
      this._startedByFramework = true;
    }

    if (!this.autoStop && !force) {
      this._appendLog('Appium stop skipped — autoStop disabled');
      return { stopped: false, reason: 'auto-stop-disabled' };
    }

    var pid = this._child ? this._child.pid : null;
    if (!pid) {
      var state = this._readState();
      pid = state ? state.pid : null;
    }

    if (!pid) {
      this._clearState();
      return { stopped: false, reason: 'no-pid-found' };
    }

    this._appendLog('Stopping Appium server (pid ' + pid + ')');

    // Try SIGTERM on process group first
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (_) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (_) {}
    }

    await this._sleep(2000);

    // Check if still running
    var stillRunning = await this._isPortOpen();
    if (stillRunning) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (_) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (_) {}
      }
      await this._sleep(1000);
    }

    this._clearState();
    this._child = null;
    this._startedByFramework = false;
    this._appendLog('Appium server stopped');
    return { stopped: true };
  }

  /**
   * Get the Appium configuration for driver creation.
   */
  getAppiumConfig() {
    return {
      protocol: this.protocol,
      hostname: this.host,
      port: this.port,
      path: this.basePath,
      serverUrl: this.serverUrl,
      statusUrl: this.statusUrl
    };
  }

  /**
   * Sleep helper.
   */
  _sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
}

module.exports = AppiumLifecycleManager;
