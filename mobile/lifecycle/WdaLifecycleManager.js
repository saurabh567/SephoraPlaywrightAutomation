/**
 * WdaLifecycleManager.js
 *
 * Enterprise-grade WebDriverAgent lifecycle management for iOS.
 * Features:
 *   - Detect WDA installation
 *   - Build WDA from source when required
 *   - Launch WDA on target simulator
 *   - Verify WDA health endpoint
 *   - Retry logic for WDA startup
 */

'use strict';

const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

class WdaLifecycleManager {
  constructor(options) {
    options = options || {};

    this.wdaPort = Number(options.wdaPort || process.env.WDA_PORT || 8100);
    this.wdaBaseUrl = 'http://127.0.0.1:' + this.wdaPort;
    this.wdaHealthUrl = this.wdaBaseUrl + '/health';
    this.wdaStatusUrl = this.wdaBaseUrl + '/status';

    this.derivedDataPath = options.derivedDataPath ||
      process.env.WDA_DERIVED_DATA_PATH ||
      path.join(process.cwd(), 'mobile', 'build', 'wda-derived-data');

    this.buildTimeout = Number(options.buildTimeout || process.env.WDA_BUILD_TIMEOUT || 300000);
    this.startTimeout = Number(options.startTimeout || process.env.WDA_START_TIMEOUT || 60000);
    this.retryCount = Number(options.retryCount || process.env.WDA_RETRY_COUNT || 3);
    this.retryDelay = Number(options.retryDelay || process.env.WDA_RETRY_DELAY || 5000);

    this.logDir = options.logDir || path.join(process.cwd(), 'mobile', 'logs');
    this.wdaLogPath = options.wdaLogPath || path.join(this.logDir, 'wda-server.log');
    this.pidPath = options.pidPath || path.join(this.logDir, 'wda-server.pid');

    this.udid = options.udid || process.env.UDID || '';

    this._child = null;
    this._launched = false;

    fs.mkdirSync(this.logDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.derivedDataPath), { recursive: true });
  }

  /**
   * Append log message.
   */
  _log(message) {
    var line = '[' + new Date().toISOString() + '] [WDA] ' + message + '\n';
    fs.appendFileSync(this.wdaLogPath, line);
  }

  /**
   * Find the WDA project path.
   * @returns {string|null}
   */
  findWdaProjectPath() {
    var possiblePaths = [
      path.join(process.cwd(), 'node_modules', 'appium-xcuitest-driver', 'node_modules', 'appium-webdriveragent', 'WebDriverAgent.xcodeproj'),
      path.join(process.cwd(), 'node_modules', 'appium-xcuitest-driver', 'WebDriverAgent.xcodeproj'),
      path.join(process.cwd(), 'node_modules', 'appium-webdriveragent', 'WebDriverAgent.xcodeproj'),
      path.join(process.cwd(), 'node_modules', '@appium', 'webdriveragent', 'WebDriverAgent.xcodeproj'),
    ];

    // Search for any WebDriverAgent.xcodeproj
    for (var i = 0; i < possiblePaths.length; i++) {
      if (fs.existsSync(possiblePaths[i])) {
        return possiblePaths[i];
      }
    }

    // Broader search via find (expensive but thorough)
    try {
      var searchPaths = [
        path.join(process.cwd(), 'node_modules'),
        '/usr/local/lib/node_modules/appium',
        path.join(process.env.HOME || '', '.appium')
      ];

      for (var j = 0; j < searchPaths.length; j++) {
        if (fs.existsSync(searchPaths[j])) {
          var result = execSync(
            'find ' + searchPaths[j] +
            ' -name "WebDriverAgent.xcodeproj" -maxdepth 6 2>/dev/null | head -3',
            { encoding: 'utf8', timeout: 10000 }
          ).trim();
          if (result) {
            var firstPath = result.split('\n')[0].trim();
            if (firstPath) {
              return firstPath;
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  /**
   * Check if WDA is already built.
   * @returns {boolean}
   */
  isBuilt() {
    var projectPath = this.findWdaProjectPath();
    if (!projectPath) {
      return false;
    }

    var wdaRoot = path.dirname(projectPath);
    var derivedData = path.join(wdaRoot, 'DerivedData');
    var buildDir = path.join(wdaRoot, 'Build');

    // Check for built products
    var possibleProducts = [
      path.join(derivedData, 'Build', 'Products'),
      path.join(buildDir, 'Products'),
      path.join(this.derivedDataPath, 'Build', 'Products')
    ];

    for (var i = 0; i < possibleProducts.length; i++) {
      if (fs.existsSync(possibleProducts[i])) {
        return true;
      }
    }

    // Also check via xcodebuild with DerivedData
    if (fs.existsSync(this.derivedDataPath)) {
      var checkResult = execSync(
        'find ' + this.derivedDataPath + ' -name "WebDriverAgentRunner.app" -maxdepth 5 2>/dev/null | head -1',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (checkResult) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build WDA from source.
   * @returns {Promise<{built: boolean, message: string, duration: number}>}
   */
  async build() {
    var startTime = Date.now();
    var projectPath = this.findWdaProjectPath();

    if (!projectPath) {
      return {
        built: false,
        message: 'WebDriverAgent.xcodeproj not found. Install appium-xcuitest-driver.',
        duration: 0
      };
    }

    this._log('Building WDA from: ' + projectPath);
    this._log('DerivedData path: ' + this.derivedDataPath);

    var wdaRoot = path.dirname(projectPath);
    var scheme = 'WebDriverAgentRunner';
    var sdk = 'iphonesimulator';
    var destination = '';

    if (this.udid) {
      destination = 'id=' + this.udid;
    } else {
      destination = 'platform=iOS Simulator,name=iPhone 15';
      // Try to get the booted simulator
      try {
        var bootedResult = execSync(
          'xcrun simctl list devices --json 2>&1',
          { encoding: 'utf8', timeout: 10000 }
        );
        var data = JSON.parse(bootedResult);
        for (var runtime in data.devices) {
          if (data.devices.hasOwnProperty(runtime)) {
            for (var i = 0; i < data.devices[runtime].length; i++) {
              var sim = data.devices[runtime][i];
              if (sim.state === 'Booted') {
                destination = 'id=' + sim.udid;
                break;
              }
            }
          }
          if (destination && destination.startsWith('id=')) { break; }
        }
      } catch (_) {}
    }

    return new Promise(function(resolve) {
      var logFd = fs.openSync(this.wdaLogPath, 'a');

      var args = [
        'xcodebuild',
        '-project', projectPath,
        '-scheme', scheme,
        '-sdk', sdk,
        '-destination', destination,
        '-derivedDataPath', this.derivedDataPath,
        'build',
        'CODE_SIGNING_ALLOWED=NO',
        'COMPILER_INDEX_STORE_ENABLE=NO'
      ];

      this._log('Running: ' + args.join(' '));
      console.log('[WDA] Building WDA with: xcrun ' + args.join(' '));
      console.log('[WDA] This may take 5-30 minutes on first run...');
      console.log('[WDA] Build logs: ' + this.wdaLogPath);

      var child = spawn('xcrun', args, {
        stdio: ['ignore', logFd, logFd],
        env: process.env
      });

      var timeout = setTimeout(function() {
        child.kill('SIGTERM');
        resolve({
          built: false,
          message: 'WDA build timed out after ' + (this.buildTimeout / 1000) + 's',
          duration: Date.now() - startTime
        });
      }.bind(this), this.buildTimeout);

      child.on('close', function(code) {
        clearTimeout(timeout);
        var duration = Date.now() - startTime;
        if (code === 0) {
          this._log('WDA built successfully (' + duration + 'ms)');
          resolve({
            built: true,
            message: 'WDA built successfully',
            duration: duration
          });
        } else {
          this._log('WDA build failed (exit code ' + code + ')');
          resolve({
            built: false,
            message: 'WDA build failed with exit code ' + code + '. Check logs: ' + this.wdaLogPath,
            duration: duration
          });
        }
      }.bind(this));
    }.bind(this));
  }

  /**
   * Check if WDA health endpoint is responding.
   * @returns {Promise<{running: boolean, healthy: boolean, error: string|null}>}
   */
  async checkHealth() {
    return new Promise(function(resolve) {
      // Try /health first, then /status
      var urls = [this.wdaHealthUrl, this.wdaStatusUrl];
      console.log('[WDA] Checking health at: ' + urls.join(', '));

      var tryUrl = function(urlIndex) {
        if (urlIndex >= urls.length) {
          resolve({ running: false, healthy: false, error: 'All endpoints unreachable' });
          return;
        }

        var req = http.get(urls[urlIndex], { timeout: 3000 }, function(res) {
          var body = '';
          res.on('data', function(chunk) { body += chunk; });
          res.on('end', function() {
            var healthy = res.statusCode >= 200 && res.statusCode < 400;
            resolve({
              running: true,
              healthy: healthy,
              error: null
            });
          });
        });

        req.on('error', function(err) {
          tryUrl(urlIndex + 1);
        });

        req.on('timeout', function() {
          req.destroy();
          tryUrl(urlIndex + 1);
        });
      }.bind(this);

      tryUrl(0);
    }.bind(this));
  }

  /**
   * Launch WDA on the target simulator.
   * @returns {Promise<{launched: boolean, message: string, duration: number}>}
   */
  async launch() {
    var startTime = Date.now();
    var projectPath = this.findWdaProjectPath();

    if (!projectPath) {
      return {
        launched: false,
        message: 'WebDriverAgent.xcodeproj not found',
        duration: 0
      };
    }

    // Check if already running
    var health = await this.checkHealth();
    if (health.running && health.healthy) {
      this._log('WDA already running on port ' + this.wdaPort);
      this._launched = true;
      return {
        launched: true,
        message: 'WDA already running',
        duration: 0
      };
    }

    // Ensure WDA is built
    if (!this.isBuilt()) {
      this._log('WDA not built, building first...');
      var buildResult = await this.build();
      if (!buildResult.built) {
        return {
          launched: false,
          message: 'WDA build failed: ' + buildResult.message,
          duration: Date.now() - startTime
        };
      }
    }

    // Launch WDA test runner
    this._log('Launching WDA on port ' + this.wdaPort);

    var wdaRoot = path.dirname(projectPath);
    var scheme = 'WebDriverAgentRunner';
    var sdk = 'iphonesimulator';
    var destination = '';

    if (this.udid) {
      destination = 'id=' + this.udid;
    } else {
      try {
        var bootedResult = execSync(
          'xcrun simctl list devices --json 2>&1',
          { encoding: 'utf8', timeout: 10000 }
        );
        var data = JSON.parse(bootedResult);
        for (var runtime in data.devices) {
          if (data.devices.hasOwnProperty(runtime)) {
            for (var i = 0; i < data.devices[runtime].length; i++) {
              var sim = data.devices[runtime][i];
              if (sim.state === 'Booted') {
                destination = 'id=' + sim.udid;
                break;
              }
            }
          }
          if (destination && destination.startsWith('id=')) { break; }
        }
      } catch (_) {}
      if (!destination) {
        destination = 'platform=iOS Simulator,name=iPhone 15';
      }
    }

    var logFd = fs.openSync(this.wdaLogPath, 'a');

    var args = [
      'xcodebuild',
      '-project', projectPath,
      '-scheme', scheme,
      '-sdk', sdk,
      '-destination', destination,
      '-derivedDataPath', this.derivedDataPath,
      'test-without-building',
      // Xcode 16+ requires signing for test execution even on simulator.
      // CODE_SIGNING_ALLOWED=NO is REMOVED from the test command because it
      // causes xcodebuild 16+ to fail with "No signing certificate found".
      // The build step still uses CODE_SIGNING_ALLOWED=NO (it works for build).
      // For test-without-building, we allow automatic provisioning.
      '-allowProvisioningUpdates',
      'COMPILER_INDEX_STORE_ENABLE=NO',
      'WDA_PORT=' + this.wdaPort
    ];

    this._log('Launching: ' + args.join(' '));
    console.log('[WDA] Launching WDA with: xcrun ' + args.join(' '));
    console.log('[WDA] WDA logs: ' + this.wdaLogPath);
    console.log('[WDA] Waiting for health endpoint at ' + this.wdaHealthUrl + ' (timeout: ' + this.startTimeout + 'ms)');

    this._child = spawn('xcrun', args, {
      stdio: ['ignore', logFd, logFd],
      env: process.env
    });

    fs.writeFileSync(this.pidPath, String(this._child.pid));
    this._launched = true;

    // Wait for health endpoint
    var deadline = Date.now() + this.startTimeout;
    var healthy = false;

    while (Date.now() < deadline) {
      await this._sleep(2000);
      var currentHealth = await this.checkHealth();
      if (currentHealth.running && currentHealth.healthy) {
        healthy = true;
        break;
      }
    }

    if (healthy) {
      this._log('WDA launched successfully (' + (Date.now() - startTime) + 'ms)');
      return {
        launched: true,
        message: 'WDA launched successfully',
        duration: Date.now() - startTime
      };
    }

    // Retry
    this._log('WDA health check failed, retrying...');
    await this._sleep(this.retryDelay);

    // Check one more time
    var retryHealth = await this.checkHealth();
    if (retryHealth.running && retryHealth.healthy) {
      return {
        launched: true,
        message: 'WDA launched successfully (after retry)',
        duration: Date.now() - startTime
      };
    }

    return {
      launched: false,
      message: 'WDA health endpoint not responding after ' + this.startTimeout + 'ms',
      duration: Date.now() - startTime
    };
  }

  /**
   * Verify WDA health with retry logic.
   * @returns {Promise<{verified: boolean, message: string}>}
   */
  async verifyHealth() {
    for (var attempt = 1; attempt <= this.retryCount; attempt++) {
      var health = await this.checkHealth();
      if (health.running && health.healthy) {
        return {
          verified: true,
          message: 'WDA healthy on port ' + this.wdaPort
        };
      }
      this._log('WDA health check attempt ' + attempt + '/' + this.retryCount + ' failed');
      if (attempt < this.retryCount) {
        await this._sleep(this.retryDelay);
      }
    }
    return {
      verified: false,
      message: 'WDA health check failed after ' + this.retryCount + ' attempts'
    };
  }

  /**
   * Stop WDA.
   */
  async stop() {
    if (this._child) {
      try {
        this._child.kill('SIGTERM');
      } catch (_) {}
      this._child = null;
    }

    // Also kill any lingering xcodebuild processes for WDA
    try {
      execSync(
        'pkill -f "WebDriverAgentRunner" 2>/dev/null || true',
        { timeout: 3000 }
      );
    } catch (_) {}

    if (fs.existsSync(this.pidPath)) {
      try { fs.unlinkSync(this.pidPath); } catch (_) {}
    }

    this._launched = false;
    this._log('WDA stopped');
  }

  /**
   * Sleep helper.
   */
  _sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
}

module.exports = WdaLifecycleManager;
