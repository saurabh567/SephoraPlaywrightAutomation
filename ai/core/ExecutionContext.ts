import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
/**
 * ExecutionContext.js
 *
 * Enterprise singleton execution context for the AI automation framework.
 * Every agent, orchestrator, and service receives this context — no duplicate
 * context creation anywhere in the system.
 *
 * Stores the full state of the current execution:
 *   Identity:    executionId, buildId, gitBranch, gitCommit
 *   Platform:    platform, browser, device, executionTime, environment
 *   CI/CD:       jenkinsBuildNumber, githubActionId
 *   Execution:   workerCount, retryCount, tags, projects
 *   Statistics:  scenarioCount, featureCount
 *
 * IMPORTANT: headless/headed mode is ALWAYS resolved dynamically from
 * config/executionConfig.js — the single source of truth. Never cached.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  ExecutionContext.getInstance()  ← singleton         │
 *   │                                                     │
 *   │  Orchestrator.initialize() → ExecutionContext.init() │
 *   │       │                                              │
 *   │       ├──► AgentRouter.buildPlan(context)            │
 *   │       ├──► DecisionAgent.run(context)                │
 *   │       ├──► PlaywrightCLIAgent.run(context)           │
 *   │       ├──► PlaywrightExecutionEngine.execute(context)│
 *   │       └──► All 57 agents receive context             │
 *   └─────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const ctx = require('./core/ExecutionContext');
 *   ctx.initialize({ platform: 'WEB', isCI: true });
 *   // ...later anywhere in the system...
 *   const platform = ctx.platform;
 *   const gitBranch = ctx.gitBranch;
 */


// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: any = null;

class ExecutionContext {
  [key: string]: any;
  constructor() {
    if (_instance) return _instance;

    // ── Identity ────────────────────────────────────────────────────────
    this.executionId = null;
    this.buildId = null;

    // ── Git ─────────────────────────────────────────────────────────────
    this.gitBranch = null;
    this.gitCommit = null;
    this.gitCommitShort = null;

    // ── Platform ────────────────────────────────────────────────────────
    this.platform = 'WEB';
    this.browser = 'chromium';
    this.device = null;
    this.executionTime = null;
    this.environment = 'dev';

    // ── CI/CD ───────────────────────────────────────────────────────────
    this.isCI = false;
    this.jenkinsBuildNumber = null;
    this.jenkinsBuildUrl = null;
    this.jenkinsJobName = null;
    this.githubActionId = null;
    this.githubRunId = null;
    this.githubRepository = null;
    this.githubActor = null;

    // ── Execution parameters ────────────────────────────────────────────
    this.workerCount = 1;
    this.retryCount = 0;
    this.tags = '';
    this.projects = [];
    // headed/headless: ALWAYS resolved dynamically from executionConfig.
    // The _headed property stores an override if explicitly set via initialize().
    // If not set, every access to this.headed re-reads executionConfig.
    this._headed = null; // null = use executionConfig dynamically
    this.shard = null;
    this.trace = 'retain-on-failure';
    this.video = 'retain-on-failure';
    this.screenshot = 'only-on-failure';
    this.timeout = 60000;

    // ── Test statistics (updated during/after execution) ────────────────
    this.scenarioCount = 0;
    this.featureCount = 0;
    this.passedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
    this.flakyCount = 0;

    // ── Execution state ─────────────────────────────────────────────────
    this.hasFailures = false;
    this.exitCode = null;
    this.orchestratorPhase = null;
    this.commands = [];

    // ── Metadata ────────────────────────────────────────────────────────
    this.createdAt = null;
    this.initializedAt = null;
    this.completedAt = null;
    this.source = process.env.SOURCE || 'cli';

    // ── Extensible store for ad-hoc data ────────────────────────────────
    this._custom = {};

    _instance = this;
  }

  /**
   * Dynamic headed getter — always reads from executionConfig singleton
   * unless explicitly overridden via initialize({ headed: ... }).
   */
  get headed() {
    if (this._headed !== null) return this._headed;
    return require('../../config/executionConfig').isHeaded;
  }

  set headed(val) {
    this._headed = val;
  }

  /**
   * Initialize the execution context with environment data.
   * Call this once at the start of every orchestration.
   *
   * @param {Object} options
   * @param {string} [options.platform]     - WEB | ANDROID | IOS | API
   * @param {string} [options.browser]      - Browser name
   * @param {string} [options.device]       - Device name
   * @param {string} [options.environment]  - dev | qa | stage | prod
   * @param {string} [options.buildId]      - External build identifier
   * @param {boolean}[options.isCI]         - CI mode flag
   * @param {number} [options.workerCount]  - Parallel workers
   * @param {number} [options.retryCount]   - Retry count
   * @param {string} [options.tags]         - Tag filter
   * @param {string[]}[options.projects]    - Project list
   * @param {boolean}[options.headed]       - Headed mode (override)
   * @param {string} [options.shard]        - Shard spec
   * @param {string} [options.trace]        - Trace mode
   * @param {string} [options.video]        - Video mode
   * @param {string} [options.screenshot]   - Screenshot mode
   * @param {number} [options.timeout]      - Test timeout
   * @returns {ExecutionContext} this
   */
  initialize(options: any = {}) {
    const now = new Date();

    this.executionId = this._generateExecutionId();
    this.executionTime = now.toISOString();
    this.createdAt = now.toISOString();
    this.initializedAt = now.toISOString();

    // Platform
    this.platform = (options.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    this.browser = options.browser || process.env.BROWSER || 'chromium';
    this.device = options.device || process.env.DEVICE || null;
    this.environment = options.environment || process.env.ENV || 'dev';

    // CI/CD detection
    this.isCI = options.isCI === true || process.env.CI === 'true';
    this._detectCI();

    // Git
    this._detectGit();

    // Build identity
    this.buildId = options.buildId || process.env.BUILD_ID || this.gitCommitShort || this.executionId;

    // Execution parameters
    if (options.workerCount !== undefined) this.workerCount = options.workerCount;
    if (options.retryCount !== undefined) this.retryCount = options.retryCount;
    if (options.tags) this.tags = options.tags;
    if (options.projects) this.projects = Array.isArray(options.projects) ? options.projects : [options.projects];
    // Headed: store explicit override only; otherwise use dynamic evaluation
    if (options.headed !== undefined) this._headed = options.headed;
    if (options.shard) this.shard = options.shard;
    if (options.trace) this.trace = options.trace;
    if (options.video) this.video = options.video;
    if (options.screenshot) this.screenshot = options.screenshot;
    if (options.timeout) this.timeout = options.timeout;

    // Detect projects from platform
    if (this.projects.length === 0) {
      if (this.platform === 'ANDROID') this.projects = ['Android'];
      else if (this.platform === 'IOS') this.projects = ['iOS'];
      else if (this.platform === 'API') this.projects = ['API Tests'];
    }

    // Source
    this.source = options.source || process.env.SOURCE || 'cli';

    console.log(`[ExecutionContext] Initialized: id=${this.executionId} platform=${this.platform} ci=${this.isCI} env=${this.environment} headed=${this.headed}`);

    return this;
  }

  /**
   * Update context with execution results after tests run.
   * @param {Object} result - Execution result from PlaywrightExecutionEngine
   */
  updateFromResult(result: any) {
    if (!result) return;

    if (result.exitCode !== undefined && result.exitCode !== null) {
      this.exitCode = result.exitCode;
      this.hasFailures = result.exitCode !== 0;
    }
    if (result.passed !== undefined) this.passedCount = result.passed;
    if (result.failed !== undefined) this.failedCount = result.failed;
    if (result.skipped !== undefined) this.skippedCount = result.skipped;
    if (result.flaky !== undefined) this.flakyCount = result.flaky;
    if (result.scenarioCount !== undefined) this.scenarioCount = result.scenarioCount;
    if (result.featureCount !== undefined) this.featureCount = result.featureCount;
    if (result.workers !== undefined) this.workerCount = result.workers;
    if (result.retries !== undefined) this.retryCount = result.retries;
    if (result.command) this.commands.push(result.command + ' ' + (result.args || []).join(' '));

    this.completedAt = new Date().toISOString();
  }

  /**
   * Mark the orchestrator phase.
   * @param {string} phase - Phase name
   */
  setPhase(phase: any) {
    this.orchestratorPhase = phase;
  }

  /**
   * Store a custom value in the context.
   * @param {string} key
   * @param {*} value
   */
  set(key: any, value: any) {
    this._custom[key] = value;
  }

  /**
   * Retrieve a custom value.
   * @param {string} key
   * @param {*} [defaultValue]
   */
  get(key: any, defaultValue = undefined) {
    return key in this._custom ? this._custom[key] : defaultValue;
  }

  /**
   * Serialize context for logging, reporting, and agent input.
   */
  summarize() {
    return {
      executionId: this.executionId,
      buildId: this.buildId,
      gitBranch: this.gitBranch,
      gitCommit: this.gitCommit,
      platform: this.platform,
      browser: this.browser,
      device: this.device,
      executionTime: this.executionTime,
      environment: this.environment,
      isCI: this.isCI,
      jenkinsBuildNumber: this.jenkinsBuildNumber,
      jenkinsBuildUrl: this.jenkinsBuildUrl,
      jenkinsJobName: this.jenkinsJobName,
      githubActionId: this.githubActionId,
      githubRunId: this.githubRunId,
      githubRepository: this.githubRepository,
      workerCount: this.workerCount,
      retryCount: this.retryCount,
      tags: this.tags,
      projects: this.projects,
      scenarioCount: this.scenarioCount,
      featureCount: this.featureCount,
      passedCount: this.passedCount,
      failedCount: this.failedCount,
      skippedCount: this.skippedCount,
      flakyCount: this.flakyCount,
      hasFailures: this.hasFailures,
      exitCode: this.exitCode,
      orchestratorPhase: this.orchestratorPhase,
      headed: this.headed,  // dynamically evaluated
      shard: this.shard,
      trace: this.trace,
      video: this.video,
      screenshot: this.screenshot,
      timeout: this.timeout,
      source: this.source,
      createdAt: this.createdAt,
      initializedAt: this.initializedAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Full JSON serialization.
   */
  toJSON() {
    return {
      ...this.summarize(),
      commands: this.commands,
      _custom: this._custom
    };
  }

  /**
   * Reset the context for a new execution.
   */
  reset() {
    this.executionId = null;
    this.buildId = null;
    this.gitBranch = null;
    this.gitCommit = null;
    this.gitCommitShort = null;
    this.platform = 'WEB';
    this.browser = 'chromium';
    this.device = null;
    this.executionTime = null;
    this.environment = 'dev';
    this.isCI = false;
    this.jenkinsBuildNumber = null;
    this.jenkinsBuildUrl = null;
    this.jenkinsJobName = null;
    this.githubActionId = null;
    this.githubRunId = null;
    this.githubRepository = null;
    this.githubActor = null;
    this.workerCount = 1;
    this.retryCount = 0;
    this.tags = '';
    this.projects = [];
    this._headed = null;  // Reset to dynamic evaluation mode
    this.shard = null;
    this.trace = 'retain-on-failure';
    this.video = 'retain-on-failure';
    this.screenshot = 'only-on-failure';
    this.timeout = 60000;
    this.scenarioCount = 0;
    this.featureCount = 0;
    this.passedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
    this.flakyCount = 0;
    this.hasFailures = false;
    this.exitCode = null;
    this.orchestratorPhase = null;
    this.commands = [];
    this.createdAt = null;
    this.initializedAt = null;
    this.completedAt = null;
    this.source = process.env.SOURCE || 'cli';
    this._custom = {};
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      INTERNAL DETECTION                          ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Detect CI/CD environment variables.
   */
  _detectCI() {
    // Jenkins
    if (process.env.JENKINS_HOME || process.env.JENKINS_URL) {
      this.jenkinsBuildNumber = process.env.BUILD_NUMBER || null;
      this.jenkinsBuildUrl = process.env.BUILD_URL || null;
      this.jenkinsJobName = process.env.JOB_NAME || null;
    }

    // GitHub Actions
    if (process.env.GITHUB_ACTIONS === 'true') {
      this.githubActionId = process.env.GITHUB_ACTION || null;
      this.githubRunId = process.env.GITHUB_RUN_ID || null;
      this.githubRepository = process.env.GITHUB_REPOSITORY || null;
      this.githubActor = process.env.GITHUB_ACTOR || null;
    }

    // Generic CI
    if (!this.isCI && (this.jenkinsBuildNumber || this.githubActionId)) {
      this.isCI = true;
    }
  }

  /**
   * Detect git branch and commit from the environment.
   */
  _detectGit() {
    // Git info from CI env vars (most reliable)
    this.gitBranch = process.env.GIT_BRANCH
      || process.env.BRANCH_NAME
      || process.env.GITHUB_REF_NAME
      || process.env.CHANGE_BRANCH
      || null;

    this.gitCommit = process.env.GIT_COMMIT
      || process.env.GITHUB_SHA
      || process.env.CHANGE_ID
      || null;

    this.gitCommitShort = this.gitCommit
      ? this.gitCommit.substring(0, 7)
      : null;

    // Fallback: try git CLI
    if (!this.gitBranch || !this.gitCommit) {
      try {
        const root = process.cwd();
        if (!this.gitBranch) {
          this.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: root, encoding: 'utf8', timeout: 3000
          }).trim();
        }
        if (!this.gitCommit) {
          this.gitCommit = execSync('git rev-parse HEAD', {
            cwd: root, encoding: 'utf8', timeout: 3000
          }).trim();
          this.gitCommitShort = this.gitCommit.substring(0, 7);
        }
      } catch (e: any) {
        // Not a git repo or git not available
        if (!this.gitBranch) this.gitBranch = 'unknown';
        if (!this.gitCommit) this.gitCommit = 'unknown';
      }
    } else if (this.gitCommit && !this.gitCommitShort) {
      this.gitCommitShort = this.gitCommit.substring(0, 7);
    }
  }

  /**
   * Generate a unique execution ID.
   */
  _generateExecutionId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EXEC-${timestamp}-${random}`;
  }
}

// ─── Singleton Accessor ────────────────────────────────────────────────────

function getInstance() {
  if (!_instance) {
    _instance = new ExecutionContext();
  }
  return _instance;
}

// Auto-initialize on first import with env defaults
const singleton = getInstance();

export default singleton;
export { ExecutionContext, getInstance };
