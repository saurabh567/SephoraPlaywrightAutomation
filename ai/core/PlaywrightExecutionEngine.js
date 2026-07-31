/**
 * PlaywrightExecutionEngine.js
 *
 * THE single entry point for all Playwright CLI execution in the enterprise framework.
 * No code anywhere in the framework may call `npx playwright test` or the Playwright
 * binary directly. Every execution — Web, Android, iOS, API, Smoke, Regression,
 * Sanity, tag, project, parallel, shard, retry — must go through this engine.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────┐
 *   │            Any caller (Agent, CLI, CI)       │
 *   ├─────────────────────────────────────────────┤
 *   │         PlaywrightExecutionEngine            │
 *   │  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
 *   │  │buildCmd()│  │execute()│  │parseResult()│ │
 *   │  └──────────┘  └──────────┘  └────────────┘ │
 *   ├─────────────────────────────────────────────┤
 *   │              npx playwright test              │
 *   └─────────────────────────────────────────────┘
 *
 * Every execution returns a CanonicalExecutionResult with ALL captured fields:
 *   exitCode, duration, stdout, stderr, workers, retries,
 *   tracePath, videoPath, htmlReportPath, jsonReportPath, junitReportPath
 *
 * Usage:
 *   const engine = require('./core/PlaywrightExecutionEngine');
 *   const result = await engine.execute({ platform: 'WEB', tags: '@smoke' });
 *   const result = await engine.executeWeb({ headed: true });
 *   const result = await engine.executeWithRetries(3, { project: 'chromium' });
 *   const result = await engine.executeShard(1, 4, { platform: 'ANDROID' });
 */

const { spawn } = require('child_process');
const { resolveNpx, buildNpxPlaywrightArgs } = require('../utils/resolveBinaryPath');
const fs = require('fs-extra');
const path = require('path');
const EventBus = require('./EventBus');
const cliConfig = require('../playwright-cli/PlaywrightCLIConfig');

// ─── Constants ─────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const NPX_PW = 'npx playwright test';
const DEFAULT_CONFIG = path.join(ROOT, 'playwright.config.cli.js');
const REPORTS_CLI_DIR = path.join(ROOT, 'reports', 'playwright-cli');
const PW_REPORT_DIR = path.join(ROOT, 'playwright-report');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');

// ─── Canonical Execution Result ────────────────────────────────────────────

class CanonicalExecutionResult {
  constructor() {
    this.exitCode = null;
    this.duration = 0;
    this.durationFormatted = '0ms';
    this.stdout = '';
    this.stderr = '';
    this.command = '';
    this.args = [];
    this.platform = 'WEB';
    this.profile = 'local';
    this.headed = false;
    this.workers = 0;
    this.retries = 0;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.flaky = 0;
    this.timedOut = false;
    this.signal = null;
    this.error = null;

    // Artifact paths (set after execution)
    this.tracePath = null;
    this.videoPath = null;
    this.htmlReportPath = null;
    this.jsonReportPath = null;
    this.junitReportPath = null;
    this.manifestPath = null;

    // Config snapshot
    this.config = {};
    this.envOverrides = {};
  }

  /**
   * Summarize the result as a plain object.
   */
  toJSON() {
    return {
      exitCode: this.exitCode,
      duration: this.duration,
      durationFormatted: this.durationFormatted,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      flaky: this.flaky,
      workers: this.workers,
      retries: this.retries,
      platform: this.platform,
      profile: this.profile,
      headed: this.headed,
      timedOut: this.timedOut,
      error: this.error,
      tracePath: this.tracePath,
      videoPath: this.videoPath,
      htmlReportPath: this.htmlReportPath,
      jsonReportPath: this.jsonReportPath,
      junitReportPath: this.junitReportPath
    };
  }
}

// ─── Playwright Execution Engine ───────────────────────────────────────────

class PlaywrightExecutionEngine {
  constructor(options = {}) {
    this.options = {
      captureOutput: true,
      emitEvents: true,
      timeoutMs: 600000,
      validateEnv: true,
      ...options
    };
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      PRIMARY EXECUTE METHOD                       ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Core execution method. Every execution variant routes here.
   *
   * @param {Object} options
   * @param {string}  [options.platform]     - WEB | ANDROID | IOS | API
   * @param {string}  [options.profile]      - Config profile name
   * @param {string}  [options.tags]         - Comma-separated tags (@smoke,@web)
   * @param {string}  [options.project]      - Playwright project name
   * @param {string}  [options.testFile]     - Specific test file path
   * @param {number}  [options.workers]      - Parallel worker count
   * @param {number}  [options.retries]      - Retry count
   * @param {number}  [options.shardCurrent] - Current shard index (1-based)
   * @param {number}  [options.shardTotal]   - Total shard count
   * @param {boolean} [options.headed]       - Run headed
   * @param {string}  [options.browser]      - Browser name
   * @param {string[]}[options.browsers]     - Multiple browsers
   * @param {number}  [options.timeout]      - Test timeout in ms
   * @param {number}  [options.maxFailures]  - Stop after N failures
   * @param {string}  [options.trace]        - Trace mode
   * @param {string}  [options.video]        - Video mode
   * @param {string}  [options.screenshot]   - Screenshot mode
   * @param {boolean} [options.forbidOnly]   - Forbid .only
   * @param {boolean} [options.fullyParallel]- Fully parallel
   * @param {boolean} [options.passWithNoTests]
   * @param {boolean} [options.updateSnapshots]
   * @param {boolean} [options.ignoreSnapshots]
   * @param {string}  [options.repeatEach]   - Repeat each test N times
   * @param {Object}  [options.envOverrides] - Extra env vars
   * @param {string[]}[options.extraArgs]    - Raw extra CLI args
   * @param {boolean} [options.dryRun]       - Print command, don't execute
   * @returns {Promise<CanonicalExecutionResult>}
   */
  async execute(options = {}) {
    const startTime = Date.now();
    const result = new CanonicalExecutionResult();

    // ── Normalise platform ──────────────────────────────────────────────
    const platform = (options.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    result.platform = platform;

    // ── Resolve profile ──────────────────────────────────────────────────
    const profileName = options.profile || this._selectProfile(platform, options);
    result.profile = profileName;

    // ── Build resolved config ────────────────────────────────────────────
    const resolvedConfig = this._resolveConfig(profileName, platform, options);
    result.config = resolvedConfig;

    // ── Build CLI command ────────────────────────────────────────────────
    const cliArgs = this.buildCommand(resolvedConfig, options);
    result.command = NPX_PW;
    result.args = cliArgs;
    result.workers = resolvedConfig.workers || 0;
    result.retries = resolvedConfig.retries || 0;
    result.headed = resolvedConfig.headed || false;

    // ── Dry-run mode ────────────────────────────────────────────────────
    if (options.dryRun) {
      console.log(`[DryRun] ${NPX_PW} ${cliArgs.join(' ')}`);
      return result;
    }

    // ── Print execution banner ──────────────────────────────────────────
    this._printBanner(platform, profileName, resolvedConfig);

    // ── Emit start event ────────────────────────────────────────────────
    if (this.options.emitEvents) {
      EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_STARTED, {
        platform,
        profile: profileName,
        browsers: resolvedConfig.browsers,
        headed: resolvedConfig.headed,
        workers: resolvedConfig.workers,
        retries: resolvedConfig.retries,
        command: `${NPX_PW} ${cliArgs.join(' ')}`
      });
      // Execution-level event for subscriber agents
      EventBus.emit(EventBus.EVENTS.EXECUTION_STARTED, {
        engine: 'playwright-cli',
        platform,
        profile: profileName,
        command: `${NPX_PW} ${cliArgs.join(' ')}`
      });
    }

    // ── Validate environment ────────────────────────────────────────────
    if (this.options.validateEnv) {
      const validation = this._validateEnvironment(resolvedConfig);
      if (!validation.valid) {
        const errMsg = `Environment validation failed: ${validation.errors.join('; ')}`;
        result.error = errMsg;
        result.exitCode = -1;
        result.stderr = errMsg;
        if (this.options.emitEvents) {
          EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_FAILED, {
            platform,
            profile: profileName,
            error: errMsg
          });
        }
        return result;
      }
    }

    // ── Ensure directories ──────────────────────────────────────────────
    fs.ensureDirSync(REPORTS_CLI_DIR);
    fs.ensureDirSync(TEST_RESULTS_DIR);

    // ── Build environment ───────────────────────────────────────────────
    const env = {
      ...process.env,
      ...resolvedConfig.envOverrides,
      ...(options.envOverrides || {}),
      PLAYWRIGHT_CLI_EXECUTION: 'true',
      PLAYWRIGHT_CLI_PROFILE: profileName,
      TEST_PLATFORM: platform
    };
    result.envOverrides = resolvedConfig.envOverrides;

    // ── Spawn Playwright CLI ────────────────────────────────────────────
    try {
      const spawnResult = await this._spawn(NPX_PW, cliArgs, env);

      // ── Populate result from spawn ────────────────────────────────────
      result.exitCode = spawnResult.exitCode;
      result.signal = spawnResult.signal;
      result.stdout = spawnResult.stdout;
      result.stderr = spawnResult.stderr;
      result.passed = spawnResult.passed;
      result.failed = spawnResult.failed;
      result.skipped = spawnResult.skipped;
      result.flaky = spawnResult.flaky;
      result.workers = spawnResult.workers || resolvedConfig.workers || 0;
      result.retries = spawnResult.retries || resolvedConfig.retries || 0;

    } catch (err) {
      result.exitCode = -1;
      result.error = err.message;
      result.stderr = err.message;
    }

    // ── Calculate duration ─────────────────────────────────────────────
    result.duration = Date.now() - startTime;
    result.durationFormatted = this._formatDuration(result.duration);

    // ── Locate artifacts ────────────────────────────────────────────────
    this._locateArtifacts(result, resolvedConfig);

    // ── Emit completion event ──────────────────────────────────────────
    if (this.options.emitEvents) {
      if (result.exitCode === 0) {
        EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_COMPLETED, result.toJSON());
      EventBus.emit(EventBus.EVENTS.EXECUTION_COMPLETED, result.toJSON());
      } else {
        EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_FAILED, {
          platform,
          profile: profileName,
          exitCode: result.exitCode,
          error: result.error || `Exit code ${result.exitCode}`
        });
        EventBus.emit(EventBus.EVENTS.EXECUTION_FAILED, {
          engine: 'playwright-cli',
          platform,
          exitCode: result.exitCode,
          error: result.error || `Exit code ${result.exitCode}`
        });
      }
    }

    // ── Write execution manifest ────────────────────────────────────────
    this._writeManifest(result);

    // ── Print summary ──────────────────────────────────────────────────
    this._printSummary(result);

    return result;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                  HIGH-LEVEL EXECUTION MODES                       ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /** Execute Web tests */
  async executeWeb(options = {}) {
    return this.execute({ ...options, platform: 'WEB' });
  }

  /** Execute Android tests */
  async executeAndroid(options = {}) {
    return this.execute({ ...options, platform: 'ANDROID', profile: 'mobile-android' });
  }

  /** Execute iOS tests */
  async executeIOS(options = {}) {
    return this.execute({ ...options, platform: 'IOS', profile: 'mobile-ios' });
  }

  /** Execute API tests */
  async executeAPI(options = {}) {
    return this.execute({ ...options, platform: 'API', profile: 'api' });
  }

  /** Execute Smoke tests (tag @smoke) */
  async executeSmoke(options = {}) {
    return this.execute({ ...options, tags: '@smoke', profile: options.profile || 'smoke' });
  }

  /** Execute Regression tests (tag @regression) */
  async executeRegression(options = {}) {
    return this.execute({ ...options, tags: '@regression', profile: options.profile || 'regression' });
  }

  /** Execute Sanity tests (tag @sanity) */
  async executeSanity(options = {}) {
    return this.execute({ ...options, tags: '@sanity', profile: options.profile || 'smoke' });
  }

  /** Execute tests matching specific tags */
  async executeWithTags(tags, options = {}) {
    return this.execute({ ...options, tags });
  }

  /** Execute a specific Playwright project */
  async executeProject(project, options = {}) {
    return this.execute({ ...options, project });
  }

  /** Execute with explicit parallelism */
  async executeParallel(workers, options = {}) {
    return this.execute({ ...options, workers });
  }

  /** Execute a specific shard (1-based index) */
  async executeShard(shardCurrent, shardTotal, options = {}) {
    return this.execute({ ...options, shardCurrent, shardTotal });
  }

  /** Execute with explicit retry count */
  async executeWithRetries(retries, options = {}) {
    return this.execute({ ...options, retries });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      COMMAND BUILDER                             ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Build the Playwright CLI argument array.
   * This is the single source of truth for CLI construction.
   *
   * @param {Object} config - Resolved config profile
   * @param {Object} options - Execution options
   * @returns {string[]} CLI arguments
   */
  buildCommand(config, options = {}) {
    const args = [];

    // ── Config file ─────────────────────────────────────────────────────
    if (config.config) {
      args.push('--config', config.config);
    }

    // ── Test file / filter ──────────────────────────────────────────────
    if (options.testFile || config.testFile) {
      args.push(options.testFile || config.testFile);
    }

    // ── Project filter ──────────────────────────────────────────────────
    const project = options.project || config.project;
    if (project) {
      args.push('--project', project);
    }

    // ── Grep (tag filter) ───────────────────────────────────────────────
    const tags = options.tags || config.tags || process.env.TAGS || '';
    if (tags) {
      // Convert comma-separated tags to Playwright grep pattern
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length === 1) {
        args.push('--grep', tagList[0]);
      } else if (tagList.length > 1) {
        // Multiple tags: use AND condition
        const grepPattern = tagList.map(t => `(?=.*${t})`).join('');
        args.push('--grep', grepPattern);
      }
    }

    // ── Workers (parallelism) ───────────────────────────────────────────
    const workers = options.workers || config.workers;
    if (workers) {
      args.push('--workers', String(workers));
    }

    // ── Retries ─────────────────────────────────────────────────────────
    const retries = options.retries !== undefined ? options.retries : config.retries;
    if (retries > 0) {
      args.push('--retries', String(retries));
    }

    // ── Repeat each ─────────────────────────────────────────────────────
    const repeatEach = options.repeatEach || config.repeatEach;
    if (repeatEach && repeatEach > 1) {
      args.push('--repeat-each', String(repeatEach));
    }

    // ── Shard execution ────────────────────────────────────────────────
    if (options.shardCurrent && options.shardTotal) {
      args.push('--shard', `${options.shardCurrent}/${options.shardTotal}`);
    }

    // ── Timeout ─────────────────────────────────────────────────────────
    const timeout = options.timeout || config.timeout;
    if (timeout && timeout !== 60000) {
      args.push('--timeout', String(timeout));
    }

    // ── Max failures ────────────────────────────────────────────────────
    const maxFailures = options.maxFailures || config.maxFailures;
    if (maxFailures > 0) {
      args.push('--max-failures', String(maxFailures));
    }

    // ── Forbid only ─────────────────────────────────────────────────────
    if (options.forbidOnly !== undefined ? options.forbidOnly : config.forbidOnly) {
      args.push('--forbid-only');
    }

    // ── Fully parallel ──────────────────────────────────────────────────
    if (options.fullyParallel !== undefined ? options.fullyParallel : config.fullyParallel) {
      args.push('--fully-parallel');
    }

    // ── Headed / headless ───────────────────────────────────────────────
    const headed = options.headed !== undefined ? options.headed : config.headed;
    if (headed) {
      args.push('--headed');
    }

    // ── Browser ─────────────────────────────────────────────────────────
    const browser = options.browser || '';
    const browsers = options.browsers || config.browsers || [];
    if (browser && !project) {
      args.push('--browser', browser);
    } else if (browsers.length === 1 && !project) {
      args.push('--browser', browsers[0]);
    }

    // ── Reporter ───────────────────────────────────────────────────────
    const reporter = options.reporter || config.reporter;
    if (reporter) {
      for (const rep of reporter) {
        if (Array.isArray(rep)) {
          try {
            args.push('--reporter', JSON.stringify(rep));
          } catch {
            args.push('--reporter', rep[0]);
          }
        } else {
          args.push('--reporter', rep);
        }
      }
    }

    // NOTE: --trace, --video, --screenshot are NOT valid Playwright CLI flags.
    // They are config-only options set in playwright.config.js.
    // Intentionally not emitted here.

    // ── Update snapshots ────────────────────────────────────────────────
    if (options.updateSnapshots || config.updateSnapshots) {
      args.push('--update-snapshots');
    }

    // ── Ignore snapshots ────────────────────────────────────────────────
    if (options.ignoreSnapshots || config.ignoreSnapshots) {
      args.push('--ignore-snapshots');
    }

    // ── Pass with no tests ──────────────────────────────────────────────
    if (options.passWithNoTests || config.passWithNoTests) {
      args.push('--pass-with-no-tests');
    }

    // ── Extra args from call site ───────────────────────────────────────
    const extraArgs = options.extraArgs || config.extraArgs || [];
    if (extraArgs.length > 0) {
      args.push(...extraArgs);
    }

    return args;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      RESULT PARSER                               ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Parse Playwright CLI output into structured counts.
   * @param {string} output - Combined stdout + stderr
   * @returns {Object} { passed, failed, skipped, flaky, workers, retries }
   */
  parseResult(output) {
    const result = {
      passed: 0, failed: 0, skipped: 0, flaky: 0,
      workers: 0, retries: 0
    };

    if (!output) return result;

    // Match Playwright CLI output: "passed: 5, failed: 1, skipped: 0"
    // Uses word: number pattern for all summary fields
    const summaryPattern = /(passed|failed|skipped|flaky|retries):\s*(\d+)/gi;
    let match;
    while ((match = summaryPattern.exec(output)) !== null) {
      const key = match[1].toLowerCase();
      const value = parseInt(match[2], 10);
      if (key === 'passed') result.passed = value;
      else if (key === 'failed') result.failed = value;
      else if (key === 'skipped') result.skipped = value;
      else if (key === 'flaky') result.flaky = value;
      else if (key === 'retries') result.retries = value;
    }

    // Workers used: "Running N workers" or "N workers"
    const workersMatch = output.match(/(\d+)\s+workers/);
    if (workersMatch) result.workers = parseInt(workersMatch[1], 10);

    // Fallback: "N passed" format (alternative output format)
    if (result.passed === 0 && result.failed === 0) {
      const passedFallback = output.match(/(\d+)\s+passed/);
      if (passedFallback) result.passed = parseInt(passedFallback[1], 10);
      const failedFallback = output.match(/(\d+)\s+failed/);
      if (failedFallback) result.failed = parseInt(failedFallback[1], 10);
    }

    return result;
  }
  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      INTERNAL SPAWN                               ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Spawn Playwright CLI and capture all output.
   */
  _spawn(command, args, env) {
    return new Promise((resolve, reject) => {
      const stdoutChunks = [];
      const stderrChunks = [];
      let timedOut = false;
      let startSpawn = Date.now();

      // SAFE spawn: resolve binary path, no shell intervention
      // This prevents macOS XProtect from flagging child processes
      // as 'Malicious Script Blocked' due to shell + provenance
      const { cmd, args: safeArgs } = buildNpxPlaywrightArgs(args);
      const child = spawn(cmd, safeArgs, {
        cwd: ROOT,
        env,
        shell: false,
        stdio: this.options.captureOutput ? 'pipe' : 'inherit',
        timeout: this.options.timeoutMs
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, this.options.timeoutMs);

      if (this.options.captureOutput) {
        if (child.stdout) {
          child.stdout.on('data', (chunk) => {
            stdoutChunks.push(chunk.toString());
            process.stdout.write(chunk.toString());
          });
        }
        if (child.stderr) {
          child.stderr.on('data', (chunk) => {
            stderrChunks.push(chunk.toString());
            process.stderr.write(chunk.toString());
          });
        }
      }

      child.on('error', (err) => {
        clearTimeout(timeoutHandle);
        if (timedOut) return;
        reject(new Error(`Playwright CLI spawn error: ${err.message}`));
      });

      child.on('close', (exitCode, signal) => {
        clearTimeout(timeoutHandle);
        if (timedOut) {
          resolve({
            exitCode: -1,
            signal: 'SIGTERM',
            stdout: stdoutChunks.join(''),
            stderr: stderrChunks.join('') + '\n[Timed out after ' + this.options.timeoutMs + 'ms]',
            passed: 0, failed: 0, skipped: 0, flaky: 0,
            workers: 0, retries: 0,
            timedOut: true
          });
          return;
        }

        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');
        const parsed = this.parseResult(stdout + stderr);

        resolve({
          exitCode: exitCode !== null ? exitCode : -1,
          signal,
          stdout,
          stderr,
          passed: parsed.passed,
          failed: parsed.failed,
          skipped: parsed.skipped,
          flaky: parsed.flaky,
          workers: parsed.workers,
          retries: parsed.retries,
          timedOut: false
        });
      });
    });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                    INTERNAL HELPERS                               ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Resolve config profile for a given platform and options.
   */
  _resolveConfig(profileName, platform, options) {
    // Start with the profile from PlaywrightCLIConfig
    let config = JSON.parse(JSON.stringify(cliConfig.resolveProfile(profileName, options)));

    // Apply platform overrides
    if (platform === 'ANDROID' && !options.profile) {
      config.browsers = ['chromium'];
      config.project = 'android';
    } else if (platform === 'IOS' && !options.profile) {
      config.browsers = ['webkit'];
      config.project = 'ios';
    } else if (platform === 'API' && !options.profile) {
      config.project = 'api';
    }

    // Apply direct option overrides
    if (options.headed !== undefined) config.headed = options.headed;
    if (options.project) config.project = options.project;
    if (options.browsers) config.browsers = [...options.browsers];
    if (options.browser) config.browsers = [options.browser];
    if (options.workers) config.workers = options.workers;
    if (options.retries !== undefined) config.retries = options.retries;
    if (options.tags) config.tags = options.tags;
    if (options.timeout) config.timeout = options.timeout;
    if (options.maxFailures !== undefined) config.maxFailures = options.maxFailures;
    // trace, video, screenshot are config-only (set in playwright.config.js)


    return config;
  }

  /**
   * Select the optimal profile for platform + options.
   */
  _selectProfile(platform, options) {
    if (options.profile) return options.profile;

    if (platform === 'ANDROID') return 'mobile-android';
    if (platform === 'IOS') return 'mobile-ios';
    if (platform === 'API') return 'api';

    const tags = options.tags || process.env.TAGS || '';
    if (tags.includes('@smoke')) return 'smoke';
    if (tags.includes('@sanity')) return 'smoke';
    if (tags.includes('@regression')) return 'regression';
    if (process.env.CI === 'true') return 'ci';
    if (process.env.PWDEBUG) return 'debug';
    if (process.env.PERF_MODE === 'true') return 'performance';

    return 'local';
  }

  /**
   * Validate the execution environment.
   */
  _validateEnvironment(config) {
    const errors = [];

    if (!fs.existsSync(path.join(ROOT, 'node_modules', '@playwright', 'test'))) {
      errors.push('@playwright/test not installed');
    }

    const pwBin = path.join(ROOT, 'node_modules', '.bin', 'playwright');
    if (!fs.existsSync(pwBin)) {
      errors.push('playwright CLI binary not found');
    }

    if (config.config && !fs.existsSync(config.config)) {
      errors.push(`Config not found: ${config.config}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Locate generated artifact paths after execution.
   */
  _locateArtifacts(result, config) {
    // HTML report
    if (config.reporter) {
      for (const rep of config.reporter) {
        if (Array.isArray(rep) && rep[0] === 'html' && rep[1] && rep[1].outputFolder) {
          const htmlPath = path.join(ROOT, rep[1].outputFolder, 'index.html');
          if (fs.existsSync(htmlPath)) result.htmlReportPath = htmlPath;
        }
        if (Array.isArray(rep) && rep[0] === 'json' && rep[1] && rep[1].outputFile) {
          const jsonPath = path.join(ROOT, rep[1].outputFile);
          if (fs.existsSync(jsonPath)) result.jsonReportPath = jsonPath;
        }
        if (Array.isArray(rep) && rep[0] === 'junit' && rep[1] && rep[1].outputFile) {
          const junitPath = path.join(ROOT, rep[1].outputFile);
          if (fs.existsSync(junitPath)) result.junitReportPath = junitPath;
        }
      }
    }

    // Fallback: check default locations
    if (!result.htmlReportPath) {
      const defaultHtml = path.join(PW_REPORT_DIR, 'index.html');
      if (fs.existsSync(defaultHtml)) result.htmlReportPath = defaultHtml;
    }

    if (!result.jsonReportPath) {
      const defaultJson = path.join(REPORTS_CLI_DIR, 'results.json');
      if (fs.existsSync(defaultJson)) result.jsonReportPath = defaultJson;
    }

    // Trace files: look in test-results
    if (fs.existsSync(TEST_RESULTS_DIR)) {
      const traceFiles = this._findFiles(TEST_RESULTS_DIR, (name) => name.endsWith('.zip') && name.includes('trace'));
      if (traceFiles.length > 0) result.tracePath = traceFiles[0];
    }

    // Video files
    if (fs.existsSync(TEST_RESULTS_DIR)) {
      const videoFiles = this._findFiles(TEST_RESULTS_DIR, (name) => name.endsWith('.webm'));
      if (videoFiles.length > 0) result.videoPath = videoFiles[0];
    }
  }

  /**
   * Find files recursively matching a predicate.
   */
  _findFiles(dir, predicate) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...this._findFiles(full, predicate));
        } else if (predicate(entry)) {
          results.push(full);
        }
      }
    } catch {}
    return results;
  }

  /**
   * Write execution manifest to reports directory.
   */
  _writeManifest(result) {
    try {
      const manifest = {
        engine: 'playwright-cli',
        executedAt: new Date().toISOString(),
        platform: result.platform,
        profile: result.profile,
        exitCode: result.exitCode,
        duration: result.duration,
        durationFormatted: result.durationFormatted,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        flaky: result.flaky,
        workers: result.workers,
        retries: result.retries,
        headed: result.headed,
        timedOut: result.timedOut,
        error: result.error,
        config: {
          browsers: result.config?.browsers,
          headed: result.config?.headed,
          workers: result.config?.workers,
          retries: result.config?.retries,
          project: result.config?.project,
          tags: result.config?.tags
        },
        reportPaths: {
          html: result.htmlReportPath,
          json: result.jsonReportPath,
          junit: result.junitReportPath,
          trace: result.tracePath,
          video: result.videoPath
        }
      };

      const manifestPath = path.join(REPORTS_CLI_DIR, 'execution-manifest.json');
      fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
      result.manifestPath = manifestPath;
    } catch (e) {
      console.warn('[PlaywrightExecutionEngine] Failed to write manifest:', e.message);
    }
  }

  /**
   * Print execution banner.
   */
  _printBanner(platform, profileName, config) {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║     Playwright Execution Engine              ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`  Platform: ${platform}`);
    console.log(`  Profile:  ${profileName}`);
    console.log(`  Browsers: ${(config.browsers || []).join(', ')}`);
    console.log(`  Headed:   ${config.headed ? 'yes' : 'no'}`);
    console.log(`  Workers:  ${config.workers || 'auto'}`);
    console.log(`  Retries:  ${config.retries || 0}`);
    if (config.tags) console.log(`  Tags:     ${config.tags}`);
    if (config.project) console.log(`  Project:  ${config.project}`);
    console.log(`  Command:  ${NPX_PW} ${this.buildCommand(config, {}).join(' ')}\n`);
  }

  /**
   * Print execution summary.
   */
  _printSummary(result) {
    const icon = result.exitCode === 0 ? '✓' : '✗';
    console.log(`\n  [${icon}] Playwright CLI completed in ${result.durationFormatted}`);
    console.log(`  Exit code: ${result.exitCode}`);
    if (result.passed !== undefined) {
      let summary = `  Passed: ${result.passed}`;
      if (result.failed > 0) summary += ` | Failed: ${result.failed}`;
      if (result.skipped > 0) summary += ` | Skipped: ${result.skipped}`;
      if (result.flaky > 0) summary += ` | Flaky: ${result.flaky}`;
      console.log(summary);
    }
    if (result.htmlReportPath) console.log(`  HTML report: ${result.htmlReportPath}`);
    if (result.jsonReportPath) console.log(`  JSON report: ${result.jsonReportPath}`);
    if (result.tracePath) console.log(`  Trace: ${result.tracePath}`);
    if (result.videoPath) console.log(`  Video: ${result.videoPath}`);
    console.log('');
  }

  /**
   * Format milliseconds to human-readable string.
   */
  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(0);
    return `${m}m ${s}s`;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new PlaywrightExecutionEngine();

module.exports = instance;
module.exports.PlaywrightExecutionEngine = PlaywrightExecutionEngine;
module.exports.CanonicalExecutionResult = CanonicalExecutionResult;
