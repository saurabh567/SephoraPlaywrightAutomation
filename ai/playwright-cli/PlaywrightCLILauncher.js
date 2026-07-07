/**
 * PlaywrightCLILauncher.js
 *
 * DEPRECATED — delegates to PlaywrightExecutionEngine (THE single spawn point).
 *
 * Previously this module directly spawned `npx playwright test`. That direct
 * spawn has been removed to enforce the architecture rule that ALL Playwright
 * CLI execution goes through PlaywrightExecutionEngine.
 *
 * This wrapper remains for backward compatibility and delegates all execution
 * to PlaywrightExecutionEngine.execute().
 *
 * New code should use PlaywrightExecutionEngine directly:
 *   const engine = require('../core/PlaywrightExecutionEngine');
 *   const result = await engine.execute({ profile: 'ci' });
 *
 * Usage (legacy compat):
 *   const launcher = require('./PlaywrightCLILauncher');
 *   const result = await launcher.execute({ profile: 'ci' });
 *   // Now delegates to PlaywrightExecutionEngine
 */

const executionEngine = require('../core/PlaywrightExecutionEngine');
const cliConfig = require('./PlaywrightCLIConfig');

// ─── Constants ─────────────────────────────────────────────────────────────
const REPORTS_CLI_DIR = require('path').join(process.cwd(), 'reports', 'playwright-cli');

// ─── Playwright CLI Launcher (delegation wrapper) ──────────────────────────

class PlaywrightCLILauncher {
  constructor(options = {}) {
    this.options = {
      profile: 'local',
      emitEvents: true,
      captureOutput: true,
      timeoutMs: 600000,
      ...options
    };
  }

  /**
   * Execute tests via Playwright CLI.
   * Delegates to PlaywrightExecutionEngine — the single spawn point.
   */
  async execute(execOptions = {}) {
    const profileName = execOptions.profile || this.options.profile;

    console.log(`\n══════════════════════════════════════════════`);
    console.log(`  Playwright CLI Launcher (delegating to Engine)`);
    console.log(`  Profile: ${profileName}`);
    console.log(`══════════════════════════════════════════════\n`);

    // Delegate fully to PlaywrightExecutionEngine
    return executionEngine.execute({
      ...execOptions,
      profile: profileName,
      emitEvents: this.options.emitEvents,
      captureOutput: this.options.captureOutput,
      timeoutMs: this.options.timeoutMs
    });
  }

  /** @deprecated Use PlaywrightExecutionEngine.generateCLIConfig() */
  generateCLIConfig() {
    console.log('[PlaywrightCLILauncher] Deprecated. Config path: playwright.config.cli.js');
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new PlaywrightCLILauncher();

module.exports = instance;
module.exports.PlaywrightCLILauncher = PlaywrightCLILauncher;
module.exports.REPORTS_CLI_DIR = REPORTS_CLI_DIR;
