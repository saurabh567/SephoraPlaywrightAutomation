import path from 'path';
import executionConfig from '../../config/executionConfig';
/**
 * PlaywrightCommandBuilder.js
 *
 * Pure command builder for Playwright CLI — no execution, no spawning.
 * Generates structured Playwright CLI commands that can be passed to
 * PlaywrightExecutionEngine for execution or logged/inspected.
 *
 * IMPORTANT: Only valid Playwright CLI flags are emitted:
 *   --headed            ✓ (valid)
 *   --config            ✓ (valid)
 *   --project           ✓ (valid)
 *   --grep              ✓ (valid)
 *   --workers           ✓ (valid)
 *   --retries           ✓ (valid)
 *   --shard             ✓ (valid)
 *   --timeout           ✓ (valid)
 *   --reporter          ✓ (valid)
 *   --output            ✓ (valid)
 *   --forbid-only       ✓ (valid)
 *   --fully-parallel    ✓ (valid)
 *   --repeat-each       ✓ (valid)
 *   --max-failures      ✓ (valid)
 *   --browser           ✓ (valid)
 *
 * INVALID (config-only, never emit as CLI args):
 *   --trace             ✗ (config-only in playwright.config.js)
 *   --video             ✗ (config-only in playwright.config.js)
 *   --screenshot        ✗ (config-only in playwright.config.js)
 *
 * Trace, video, and screenshot are controlled via playwright.config.js
 * and playwright.config.cli.js — never via CLI arguments.
 *
 * Architecture:
 *   DecisionAgent ──► PlaywrightCommandBuilder ──► { command, args, commandString }
 *                                                         │
 *                                                         ▼
 *                                              PlaywrightExecutionEngine.execute()
 *
 * Every method returns a CanonicalCommand:
 *   { command: 'npx playwright test', args: [...], commandString: '...' }
 *
 * Usage (standalone):
 *   const builder = require('./core/PlaywrightCommandBuilder');
 *   const cmd = builder.build({ project: 'Android', tags: '@Smoke', workers: 6 });
 *   // cmd.commandString = 'npx playwright test --project Android --grep @Smoke --workers 6'
 *
 * Usage (DecisionAgent):
 *   const commands: any[] = [];
 *   if (isSmokeRun) commands.push(builder.forSmoke({ workers: 6 }));
 *   if (needsShard)  commands.push(builder.forShard(2, 4, { project: 'Android' }));
 *   // Execute each via PlaywrightExecutionEngine
 */


// ─── Constants ─────────────────────────────────────────────────────────────

const NPX_PW = 'npx playwright test';
const DEFAULT_CONFIG = 'playwright.config.cli.js';

// ─── Canonical Command ─────────────────────────────────────────────────────

class CanonicalCommand {
  [key: string]: any;
  constructor(options: any = {}) {
    this.command = options.command || NPX_PW;
    this.args = options.args || [];
    this.config = options.config || DEFAULT_CONFIG;
    this.platform = options.platform || 'WEB';
    this.project = options.project || null;
    this.tags = options.tags || null;
    this.workers = options.workers || null;
    this.retries = options.retries || null;
    this.shard = options.shard || null;
    this.headed = options.headed || false;
    this.browser = options.browser || null;
    // trace, video, screenshot are stored for metadata/logging only
    // NEVER emitted as CLI args — they belong in playwright.config.js
    this.trace = options.trace || null;
    this.video = options.video || null;
    this.screenshot = options.screenshot || null;
    this.testFile = options.testFile || null;
    this.timeout = options.timeout || null;
    this.maxFailures = options.maxFailures || null;
    this.repeatEach = options.repeatEach || null;
    this.forbidOnly = options.forbidOnly === true;
    this.fullyParallel = options.fullyParallel || false;
    this.extraArgs = options.extraArgs || [];
    this.description = options.description || '';
  }

  /** Full command string for display/logging */
  get commandString() {
    return [this.command, ...this._buildArgs()].join(' ');
  }

  /**
   * Build the full CLI arg array.
   * Only emits VALID Playwright CLI flags.
   * Invalid flags (--trace, --video, --screenshot) are NEVER emitted.
   */
  _buildArgs() {
    const args: any[] = [];

    if (this.config) {
      args.push('--config', this.config);
    }

    if (this.project) {
      args.push('--project', this.project);
    }

    if (this.tags) {
      const tagList = this.tags.split(',').map((t: any) => t.trim()).filter(Boolean);
      if (tagList.length === 1) {
        args.push('--grep', tagList[0]);
      } else if (tagList.length > 1) {
        const grepPattern = tagList.map((t: any) => `(?=.*${t})`).join('');
        args.push('--grep', grepPattern);
      }
    }

    if (this.testFile) {
      args.push(this.testFile);
    }

    if (this.workers) {
      args.push('--workers', String(this.workers));
    }

    if (this.retries) {
      args.push('--retries', String(this.retries));
    }

    if (this.repeatEach && this.repeatEach > 1) {
      args.push('--repeat-each', String(this.repeatEach));
    }

    if (this.shard) {
      args.push('--shard', this.shard);
    }

    if (this.timeout) {
      args.push('--timeout', String(this.timeout));
    }

    if (this.maxFailures) {
      args.push('--max-failures', String(this.maxFailures));
    }

    if (this.forbidOnly) {
      args.push('--forbid-only');
    }

    if (this.fullyParallel) {
      args.push('--fully-parallel');
    }

    // --headed is a valid Playwright CLI flag
    // Use the executionConfig as the single source of truth
    const headed = this.headed || executionConfig.isHeaded;
    if (headed) {
      args.push('--headed');
    }

    if (this.browser) {
      args.push('--browser', this.browser);
    }

    // NOTE: --trace, --video, --screenshot are NOT valid Playwright CLI flags.
    // They are config-only options that belong in playwright.config.js.
    // We intentionally do NOT emit them here.

    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }

    return args;
  }

  /** Serialize to plain object */
  toJSON() {
    return {
      command: this.command,
      args: this._buildArgs(),
      commandString: this.commandString,
      config: this.config,
      platform: this.platform,
      project: this.project,
      tags: this.tags,
      workers: this.workers,
      retries: this.retries,
      shard: this.shard,
      headed: this.headed,
      browser: this.browser,
      trace: this.trace,
      video: this.video,
      screenshot: this.screenshot,
      testFile: this.testFile,
      timeout: this.timeout,
      description: this.description
    };
  }
}

// ─── Playwright Command Builder ───────────────────────────────────────────

class PlaywrightCommandBuilder {

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      CORE BUILD METHOD                           ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Build a Playwright CLI command from options.
   * This is the single method DecisionAgent should call.
   *
   * @param {Object} options
   * @param {string}  [options.platform]    - WEB | ANDROID | IOS | API
   * @param {string}  [options.project]     - Playwright project name
   * @param {string}  [options.tags]        - '@Smoke' or '@Smoke,@Regression'
   * @param {number}  [options.workers]     - Worker count
   * @param {number}  [options.retries]     - Retry count
   * @param {string}  [options.shard]       - '2/4' format
   * @param {boolean} [options.headed]      - Run headed
   * @param {string}  [options.browser]     - Browser name
   * @param {string}  [options.testFile]    - Test file path
   * @param {number}  [options.timeout]     - Test timeout ms
   * @param {number}  [options.maxFailures] - Stop after N failures
   * @param {number}  [options.repeatEach]  - Repeat count
   * @param {boolean} [options.forbidOnly]  - Forbid .only
   * @param {boolean} [options.fullyParallel]
   * @param {string}  [options.config]      - Config file path
   * @param {string}  [options.description] - Human-readable description
   * @param {string[]}[options.extraArgs]   - Extra raw args
   * @returns {CanonicalCommand}
   */
  build(options: any = {}) {
    const platform = (options.platform || 'WEB').toUpperCase();

    // Map platform to project if not explicitly set
    let project = options.project;
    if (!project) {
      if (platform === 'ANDROID') project = 'Android';
      else if (platform === 'IOS') project = 'iOS';
      else if (platform === 'API') project = 'API Tests';
    }

    // Map platform to browser if not explicitly set
    let browser = options.browser;
    if (!browser) {
      if (platform === 'ANDROID' || platform === 'IOS') browser = 'chromium';
    }

    return new CanonicalCommand({
      command: NPX_PW,
      config: options.config || DEFAULT_CONFIG,
      platform,
      project,
      tags: options.tags || null,
      workers: options.workers || null,
      retries: options.retries || null,
      shard: options.shard || null,
      headed: options.headed || false,
      browser,
      trace: options.trace || null,
      video: options.video || null,
      screenshot: options.screenshot || null,
      testFile: options.testFile || null,
      timeout: options.timeout || null,
      maxFailures: options.maxFailures || null,
      repeatEach: options.repeatEach || null,
      forbidOnly: options.forbidOnly === true,
      fullyParallel: options.fullyParallel || false,
      extraArgs: options.extraArgs || [],
      description: options.description || this._describe(options)
    });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                  PLATFORM-SPECIFIC BUILDERS                       ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /** Build a command for Web tests */
  forWeb(options: any = {}) {
    return this.build({ ...options, platform: 'WEB', description: 'Web tests' });
  }

  /** Build a command for Android tests */
  forAndroid(options: any = {}) {
    return this.build({ ...options, platform: 'ANDROID', project: 'Android', description: 'Android mobile tests' });
  }

  /** Build a command for iOS tests */
  forIOS(options: any = {}) {
    return this.build({ ...options, platform: 'IOS', project: 'iOS', description: 'iOS mobile tests' });
  }

  /** Build a command for API tests */
  forAPI(options: any = {}) {
    return this.build({ ...options, platform: 'API', project: 'API Tests', description: 'API tests' });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                  EXECUTION MODE BUILDERS                          ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /** Build a command for smoke tests — tagged @Smoke */
  forSmoke(options: any = {}) {
    return this.build({
      ...options,
      tags: options.tags || '@Smoke',
      workers: options.workers || 2,
      retries: options.retries || 1,
      description: 'Smoke test suite'
    });
  }

  /** Build a command for regression tests — tagged @Regression */
  forRegression(options: any = {}) {
    return this.build({
      ...options,
      tags: options.tags || '@Regression',
      workers: options.workers || 4,
      retries: options.retries || 1,
      fullyParallel: true,
      description: 'Full regression suite'
    });
  }

  /** Build a command for sanity tests — tagged @Sanity */
  forSanity(options: any = {}) {
    return this.build({
      ...options,
      tags: options.tags || '@Sanity',
      workers: options.workers || 2,
      retries: options.retries || 0,
      description: 'Sanity check suite'
    });
  }

  /** Build a command for CI execution */
  forCI(options: any = {}) {
    return this.build({
      ...options,
      workers: options.workers || 4,
      retries: options.retries || 2,
      forbidOnly: true,
      fullyParallel: true,
      description: 'CI pipeline execution'
    });
  }

  /** Build a command for local development */
  forLocal(options: any = {}) {
    return this.build({
      ...options,
      headed: true,
      workers: options.workers || 1,
      retries: options.retries || 0,
      description: 'Local development run'
    });
  }

  /** Build a command for headed mode */
  forHeaded(options: any = {}) {
    return this.build({ ...options, headed: true, description: 'Headed browser execution' });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                  SPECIFIC FEATURE BUILDERS                        ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Build a command with specific tag filter.
   * @param {string} tags - '@Smoke' or '@Smoke,@Regression'
   */
  withTags(tags: any, options: any = {}) {
    return this.build({ ...options, tags, description: `Tag filter: ${tags}` });
  }

  /**
   * Build a command for a specific project.
   * @param {string} project - Project name
   */
  forProject(project: any, options: any = {}) {
    return this.build({ ...options, project, description: `Project: ${project}` });
  }

  /**
   * Build a command with explicit worker count.
   * @param {number} workers - Number of parallel workers
   */
  withWorkers(workers: any, options: any = {}) {
    return this.build({ ...options, workers, description: `${workers} parallel workers` });
  }

  /**
   * Build a command with explicit retry count.
   * @param {number} retries - Number of retries
   */
  withRetries(retries: any, options: any = {}) {
    return this.build({ ...options, retries, description: `${retries} retries` });
  }

  /**
   * Build a command for shard execution.
   * @param {number} current - Current shard (1-based)
   * @param {number} total   - Total shards
   */
  forShard(current: any, total: any, options: any = {}) {
    const shard = `${current}/${total}`;
    return this.build({ ...options, shard, description: `Shard ${current}/${total}` });
  }

  /**
   * Build a command for a specific test file or directory.
   * @param {string} testFile - Path to test file or directory
   */
  forTestFile(testFile: any, options: any = {}) {
    return this.build({ ...options, testFile, description: `Test file: ${testFile}` });
  }

  /**
   * Build a command with explicit timeout.
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  withTimeout(timeoutMs: any, options: any = {}) {
    return this.build({ ...options, timeout: timeoutMs, description: `Timeout: ${timeoutMs}ms` });
  }

  /**
   * Build a command with max failures limit.
   * @param {number} max - Stop after N failures
   */
  withMaxFailures(max: any, options: any = {}) {
    return this.build({ ...options, maxFailures: max, description: `Max failures: ${max}` });
  }

  /**
   * Build a fully parallel command.
   */
  fullyParallel(options: any = {}) {
    return this.build({ ...options, fullyParallel: true, description: 'Fully parallel execution' });
  }

  /**
   * Build a command for the full test suite (no filters).
   */
  fullSuite(options: any = {}) {
    return this.build({ ...options, description: 'Full test suite' });
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                  DECISION-ENGINE DRIVEN BUILD                     ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Build a command from DecisionEngine context.
   * This is the high-level API the DecisionAgent uses to dynamically
   * construct commands based on AI analysis.
   *
   * @param {Object} context - DecisionEngine context
   * @param {Object} [overrides] - Additional overrides
   * @returns {CanonicalCommand[]} Array of commands to execute
   */
  buildFromContext(context: any = {}, overrides: any = {}) {
    const commands: any[] = [];
    const platform = (context.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    const isCI = context.isCI === true || process.env.CI === 'true';
    const riskLevel = context.risk ? (context.risk.level || 'low') : 'low';
    const priority = context.priority || 'normal';
    const hasFailures = context.hasFailures === true;

    // Determine execution mode from context
    const tags = context.tags || process.env.TAGS || '';
    let baseCommand;

    if (tags.includes('@Smoke') || tags.includes('@smoke')) {
      baseCommand = this.forSmoke({ ...overrides, platform });
    } else if (tags.includes('@Sanity') || tags.includes('@sanity')) {
      baseCommand = this.forSanity({ ...overrides, platform });
    } else if (tags.includes('@Regression') || tags.includes('@regression')) {
      baseCommand = this.forRegression({ ...overrides, platform });
    } else if (tags) {
      baseCommand = this.withTags(tags, { ...overrides, platform });
    } else {
      baseCommand = this.build({ ...overrides, platform });
    }

    // Always add the primary command
    commands.push(baseCommand);

    // If CI and risk is elevated, add a retry command with full debugging
    if (isCI && (riskLevel === 'critical' || riskLevel === 'high')) {
      const retryOverrides = {
        ...overrides,
        retries: Math.max(overrides.retries || 2, 1),
        described: 'Retry pass (full artifacts via config)'
      };
      if (tags.includes('@Smoke') || tags.includes('@smoke')) {
        commands.push(this.forSmoke(retryOverrides));
      } else if (tags) {
        commands.push(this.withTags(tags, retryOverrides));
      } else {
        commands.push(this.build(retryOverrides));
      }
    }

    return commands;
  }

  /**
   * Describe the command based on options.
   * @private
   */
  _describe(options: any) {
    const parts: any[] = [];
    if (options.platform) parts.push(options.platform);
    if (options.tags) parts.push(options.tags);
    if (options.headed) parts.push('headed');
    if (options.workers) parts.push(`${options.workers}w`);
    if (options.retries) parts.push(`${options.retries}r`);
    return parts.length > 0 ? parts.join(' ') : 'Playwright test';
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

const singleton = new PlaywrightCommandBuilder();

export default singleton;
export { PlaywrightCommandBuilder, CanonicalCommand };
