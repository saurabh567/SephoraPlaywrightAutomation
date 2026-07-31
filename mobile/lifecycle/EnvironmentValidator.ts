import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
/**
 * EnvironmentValidator.js
 *
 * Validates all prerequisite tooling for mobile automation:
 *   - Android: Java, Android SDK, adb, Appium, emulator availability
 *   - iOS: Xcode, xcodebuild, simctl, WebDriverAgent source
 *
 * Each validator returns { valid: boolean, message: string, detail: string }
 */

'use strict';


class EnvironmentValidator {
  /**
   * Validate all Android prerequisites.
   * @returns {Promise<{valid: boolean, checks: Array}>}
   */
  static async validateAndroid() {
    var checks: any[] = [];
    var allValid = true;

    // 1. Java
    var javaCheck = await EnvironmentValidator._checkJava();
    checks.push(javaCheck);
    if (!javaCheck.valid) { allValid = false; }

    // 2. Android SDK
    var sdkCheck = await EnvironmentValidator._checkAndroidSdk();
    checks.push(sdkCheck);
    if (!sdkCheck.valid) { allValid = false; }

    // 3. adb
    var adbCheck = await EnvironmentValidator._checkAdb();
    checks.push(adbCheck);
    if (!adbCheck.valid) { allValid = false; }

    // 4. Appium
    var appiumCheck = await EnvironmentValidator._checkAppium();
    checks.push(appiumCheck);
    if (!appiumCheck.valid) { allValid = false; }

    // 5. Node + npm
    var nodeCheck = await EnvironmentValidator._checkNode();
    checks.push(nodeCheck);
    if (!nodeCheck.valid) { allValid = false; }

    return { valid: allValid, checks: checks };
  }

  /**
   * Validate all iOS prerequisites.
   * @returns {Promise<{valid: boolean, checks: Array}>}
   */
  static async validateIOS() {
    var checks: any[] = [];
    var allValid = true;

    // 1. Xcode
    var xcodeCheck = await EnvironmentValidator._checkXcode();
    checks.push(xcodeCheck);
    if (!xcodeCheck.valid) { allValid = false; }

    // 2. xcodebuild
    var xcodebuildCheck = await EnvironmentValidator._checkXcodebuild();
    checks.push(xcodebuildCheck);
    if (!xcodebuildCheck.valid) { allValid = false; }

    // 3. simctl
    var simctlCheck = await EnvironmentValidator._checkSimctl();
    checks.push(simctlCheck);
    if (!simctlCheck.valid) { allValid = false; }

    // 4. Appium
    var appiumCheck = await EnvironmentValidator._checkAppium();
    checks.push(appiumCheck);
    if (!appiumCheck.valid) { allValid = false; }

    // 5. WDA source (xcuitest-driver)
    var wdaCheck = await EnvironmentValidator._checkWdaSource();
    checks.push(wdaCheck);
    if (!wdaCheck.valid) { allValid = false; }

    // 6. Node + npm
    var nodeCheck = await EnvironmentValidator._checkNode();
    checks.push(nodeCheck);
    if (!nodeCheck.valid) { allValid = false; }

    return { valid: allValid, checks: checks };
  }

  /**
   * Execute a shell command and capture output.
   * @param {string} cmd
   * @param {number} timeout
   * @returns {{ stdout: string, stderr: string, code: number }}
   */
  static _exec(cmd: any, timeout?: any) {
    timeout = timeout || 10000;
    try {
      var stdout = execSync(cmd, {
        encoding: 'utf8',
        timeout: timeout,
        stdio: ['pipe', 'pipe', 'pipe']
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

  /**
   * Check Java installation.
   */
  static async _checkJava() {
    var result = EnvironmentValidator._exec('java -version 2>&1');
    if (result.code === 0 && result.stdout) {
      var versionMatch = result.stdout.match(/(\d+\.\d+)/);
      var version = versionMatch ? versionMatch[1] : 'unknown';
      return {
        valid: true,
        name: 'Java',
        message: 'Java ' + version + ' detected',
        detail: result.stdout.split('\n')[0]
      };
    }
    return {
      valid: false,
      name: 'Java',
      message: 'Java not found or not executable',
      detail: 'Install JDK 11+ and set JAVA_HOME. Run: java -version'
    };
  }

  /**
   * Check Android SDK.
   */
  static async _checkAndroidSdk() {
    var androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!androidHome) {
      return {
        valid: false,
        name: 'Android SDK',
        message: 'ANDROID_HOME/ANDROID_SDK_ROOT not set',
        detail: 'Set ANDROID_HOME to your Android SDK path (e.g., export ANDROID_HOME=$HOME/Library/Android/sdk)'
      };
    }

    if (!fs.existsSync(androidHome)) {
      return {
        valid: false,
        name: 'Android SDK',
        message: 'Android SDK path does not exist: ' + androidHome,
        detail: 'Verify ANDROID_HOME points to a valid SDK installation'
      };
    }

    // Check for platform-tools and build-tools
    var platformTools = path.join(androidHome, 'platform-tools');
    var buildTools = path.join(androidHome, 'build-tools');
    var hasPlatformTools = fs.existsSync(platformTools);
    var hasBuildTools = fs.existsSync(buildTools);

    if (!hasPlatformTools || !hasBuildTools) {
      var missing: any[] = [];
      if (!hasPlatformTools) { missing.push('platform-tools'); }
      if (!hasBuildTools) { missing.push('build-tools'); }
      return {
        valid: false,
        name: 'Android SDK',
        message: 'Missing SDK components: ' + missing.join(', '),
        detail: 'Install via sdkmanager: sdkmanager "platform-tools" "build-tools;34.0.0"'
      };
    }

    // Check sdkmanager
    var sdkManager = path.join(androidHome, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
    if (!fs.existsSync(sdkManager)) {
      sdkManager = path.join(androidHome, 'tools', 'bin', 'sdkmanager');
    }
    var hasSdkManager = fs.existsSync(sdkManager);

    // Get installed platforms
    var platforms: any = [];
    var platformsDir = path.join(androidHome, 'platforms');
    if (fs.existsSync(platformsDir)) {
      platforms = fs.readdirSync(platformsDir).filter(function(d) {
        return d.startsWith('android-');
      });
    }

    var detail = 'SDK at: ' + androidHome;
    if (platforms.length > 0) {
      detail += ' | Platforms: ' + platforms.join(', ');
    }

    return {
      valid: true,
      name: 'Android SDK',
      message: 'Android SDK detected' + (platforms.length > 0 ? ' (' + platforms.length + ' platforms)' : ''),
      detail: detail
    };
  }

  /**
   * Check adb availability.
   */
  static async _checkAdb() {
    var result = EnvironmentValidator._exec('adb version 2>&1');
    if (result.code === 0 && result.stdout) {
      var firstLine = result.stdout.split('\n')[0];
      return {
        valid: true,
        name: 'ADB',
        message: 'adb detected',
        detail: firstLine
      };
    }
    return {
      valid: false,
      name: 'ADB',
      message: 'adb not found on PATH',
      detail: 'Add platform-tools to PATH: export PATH=$ANDROID_HOME/platform-tools:$PATH'
    };
  }

  /**
   * Check Appium installation.
   */
  static async _checkAppium() {
    // Try global appium
    var result = EnvironmentValidator._exec('appium --version 2>&1 || npx appium --version 2>&1', 15000);
    if (result.code === 0 && result.stdout) {
      var version = result.stdout.trim();
      return {
        valid: true,
        name: 'Appium',
        message: 'Appium ' + version + ' detected',
        detail: 'Appium CLI available'
      };
    }
    // Check node_modules
    var localAppium = path.join(process.cwd(), 'node_modules', '.bin', 'appium');
    if (fs.existsSync(localAppium)) {
      return {
        valid: true,
        name: 'Appium',
        message: 'Appium detected in node_modules',
        detail: 'Local Appium at: ' + localAppium
      };
    }
    return {
      valid: false,
      name: 'Appium',
      message: 'Appium not found',
      detail: 'Install: npm install -g appium or npm install appium'
    };
  }

  /**
   * Check Node.js and npm.
   */
  static async _checkNode() {
    var nodeResult = EnvironmentValidator._exec('node --version 2>&1');
    var npmResult = EnvironmentValidator._exec('npm --version 2>&1');
    if (nodeResult.code === 0 && nodeResult.stdout) {
      return {
        valid: true,
        name: 'Node.js',
        message: 'Node ' + nodeResult.stdout.trim() +
          (npmResult.code === 0 ? ' | npm ' + npmResult.stdout.trim() : ''),
        detail: ''
      };
    }
    return {
      valid: false,
      name: 'Node.js',
      message: 'Node.js not found',
      detail: 'Install Node.js 18+ from https://nodejs.org'
    };
  }

  /**
   * Check Xcode installation.
   */
  static async _checkXcode() {
    var result = EnvironmentValidator._exec('xcode-select -p 2>&1', 15000);
    if (result.code === 0 && result.stdout) {
      var xcodePath = result.stdout.trim();
      // Check xcodebuild version
      var verResult = EnvironmentValidator._exec('xcodebuild -version 2>&1', 10000);
      var version = '';
      if (verResult.code === 0) {
        version = verResult.stdout.split('\n')[0] || '';
      }
      return {
        valid: true,
        name: 'Xcode',
        message: 'Xcode detected' + (version ? ' (' + version + ')' : ''),
        detail: 'Path: ' + xcodePath
      };
    }
    return {
      valid: false,
      name: 'Xcode',
      message: 'Xcode not found',
      detail: 'Install Xcode from App Store and run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer'
    };
  }

  /**
   * Check xcodebuild.
   */
  static async _checkXcodebuild() {
    var result = EnvironmentValidator._exec('xcodebuild -version 2>&1', 15000);
    if (result.code === 0 && result.stdout) {
      var lines = result.stdout.split('\n');
      return {
        valid: true,
        name: 'xcodebuild',
        message: 'xcodebuild available',
        detail: lines[0] + (lines[1] ? ' | ' + lines[1] : '')
      };
    }
    return {
      valid: false,
      name: 'xcodebuild',
      message: 'xcodebuild not found or not functional',
      detail: 'Install Xcode Command Line Tools: xcode-select --install'
    };
  }

  /**
   * Check simctl.
   */
  static async _checkSimctl() {
    var result = EnvironmentValidator._exec('xcrun simctl help 2>&1 | head -5', 10000);
    if (result.code === 0 && result.stdout) {
      return {
        valid: true,
        name: 'simctl',
        message: 'simctl available',
        detail: 'iOS Simulator management CLI is functional'
      };
    }
    return {
      valid: false,
      name: 'simctl',
      message: 'simctl not available via xcrun',
      detail: 'Verify Xcode installation: xcrun --find simctl'
    };
  }

  /**
   * Check WebDriverAgent source inside appium-xcuitest-driver.
   */
  static async _checkWdaSource() {
    var possiblePaths = [
      path.join(process.cwd(), 'node_modules', 'appium-xcuitest-driver', 'node_modules', 'appium-webdriveragent'),
      path.join(process.cwd(), 'node_modules', 'appium-webdriveragent'),
      path.join(process.cwd(), 'node_modules', '@appium', 'webdriveragent'),
    ];

    for (var i = 0; i < possiblePaths.length; i++) {
      var wdaPath = possiblePaths[i];
      if (fs.existsSync(wdaPath)) {
        var hasDerivedData = fs.existsSync(path.join(wdaPath, 'DerivedData'));
        var hasBuild = fs.existsSync(path.join(wdaPath, 'Build'));
        var status: any[] = [];
        if (hasDerivedData) { status.push('DerivedData exists'); }
        if (hasBuild) { status.push('Build exists'); }
        if (status.length === 0) { status.push('source only (needs build)'); }
        return {
          valid: true,
          name: 'WebDriverAgent',
          message: 'WDA source found (' + status.join(', ') + ')',
          detail: 'Path: ' + wdaPath
        };
      }
    }

    // Check in appium installations
    var appiumDirs = [
      path.join(process.cwd(), 'node_modules', 'appium'),
      '/usr/local/lib/node_modules/appium',
      path.join(process.env.HOME || '', '.appium')
    ];

    for (var j = 0; j < appiumDirs.length; j++) {
      if (fs.existsSync(appiumDirs[j])) {
        // Search for WDA under appium
        var findResult = EnvironmentValidator._exec(
          'find ' + appiumDirs[j] + ' -name "WebDriverAgent.xcodeproj" -maxdepth 5 2>/dev/null | head -1',
          5000
        );
        if (findResult.code === 0 && findResult.stdout) {
          return {
            valid: true,
            name: 'WebDriverAgent',
            message: 'WDA found under Appium installation',
            detail: 'Path: ' + findResult.stdout.trim()
          };
        }
      }
    }

    return {
      valid: true, // Not critical — WDA can be built on demand
      name: 'WebDriverAgent',
      message: 'WDA source not pre-installed (will be built on demand)',
      detail: 'appium-xcuitest-driver will handle WDA building'
    };
  }

  /**
   * Validate environment for the given platform and return a human-readable summary.
   * @param {string} platform - 'android' or 'ios'
   * @returns {Promise<{valid: boolean, summary: string, checks: Array}>}
   */
  static async validate(platform: any) {
    var platformLower = (platform || '').toLowerCase();
    var result;

    if (platformLower === 'android') {
      result = await EnvironmentValidator.validateAndroid();
    } else if (platformLower === 'ios') {
      result = await EnvironmentValidator.validateIOS();
    } else {
      throw new Error('Unsupported platform: ' + platform);
    }

    var total = result.checks.length;
    var passed = result.checks.filter(function(c) { return c.valid; }).length;
    var failed = total - passed;

    var summary = 'Environment: ' + passed + '/' + total + ' checks passed';
    if (failed > 0) {
      summary += ' (' + failed + ' failed)';
    }

    return {
      valid: result.valid,
      summary: summary,
      checks: result.checks
    };
  }
}

export default EnvironmentValidator;
