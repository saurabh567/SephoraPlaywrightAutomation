import executionEngine from '../core/PlaywrightExecutionEngine';
import cliConfig from '../playwright-cli/PlaywrightCLIConfig';
import DecisionEngine from '../core/DecisionEngine';
import EventBus from '../core/EventBus';
import fs from 'fs-extra';
import path from 'path';
/**
 * PlaywrightCLIAgent.js
 *
 * Enterprise Playwright CLI Agent — the bridge between AI orchestration
 * and the Playwright CLI execution engine.
 *
 * This agent is discovered by AgentRegistry and routed by AgentRouter.
 * The UnifiedOrchestrator invokes this agent during Phase 1 (Execution)
 * to run tests via `npx playwright test` with AI-driven configuration.
 *
 * Flow:
 *   Orchestrator → AgentRouter → PlaywrightCLIAgent
 *     → PlaywrightExecutionEngine (single spawn point)
 *     → npx playwright test
 *
 * The agent:
 *   - Receives execution context from the DecisionEngine
 *   - Resolves the optimal Playwright CLI profile
 *   - Validates environment readiness
 *   - Executes via PlaywrightExecutionEngine (THE single entry point)
 *   - Captures structured results for AI Analysis Layer (Phase 2)
 *   - Emits EventBus lifecycle events
 *
 * Usage (via orchestrator):
 *   const agent = new PlaywrightCLIAgent({ platform: 'WEB' });
 *   const result = await agent.run();
 *
 * Usage (standalone):
 *   node -e "require('./PlaywrightCLIAgent').run({ platform: 'WEB' })"
 */


class PlaywrightCLIAgent {
  [key: string]: any;
  constructor(options: any = {}) {
    this.options = {
      profile: undefined,
      platform: process.env.TEST_PLATFORM || 'WEB',
      headed: require('../../config/executionConfig').isHeaded, // DYNAMIC - re-evaluated every time
      browser: process.env.BROWSER || 'chromium',
      project: undefined,
      testFile: undefined,
      extraArgs: [] as any[],
      envOverrides: {} as Record<string, any>,
      skipAIAnalysis: false,
      ...options
    };
    this.decisionEngine = new DecisionEngine();
    this.executionResult = null;
  }

  /**
   * Main entry point — called by the orchestrator's executeAgents().
   * Routes all execution through PlaywrightExecutionEngine — THE single
   * spawn point for `npx playwright test`. No direct Playwright CLI calls.
   */
  async run(runOptions: any = {}) {
    const options = { ...this.options, ...runOptions };
    const platform = (options.platform || 'WEB').toUpperCase();

    console.log(`[PlaywrightCLIAgent] Initializing CLI execution for ${platform}`);

    // ── Emit started event ──────────────────────────────────────────────
    EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_STARTED, {
      platform,
      profile: options.profile || 'auto',
      browser: options.browser,
      headed: options.headed
    });

    // ── Step 1: Evaluate context via DecisionEngine ──────────────────────
    console.log('[PlaywrightCLIAgent] Consulting DecisionEngine for execution context...');
    const decisionContext = {
      platform,
      isCI: process.env.CI === 'true',
      browser: options.browser,
      headless: !options.headed,
      tags: process.env.TAGS || '',
      priority: options.priority || undefined
    };

    let decisions;
    try {
      decisions = await this.decisionEngine.evaluate(decisionContext);
      console.log(`[PlaywrightCLIAgent] DecisionEngine: risk=${decisions.context.risk}, priority=${decisions.context.priority}`);
    } catch (e: any) {
      console.warn(`[PlaywrightCLIAgent] DecisionEngine failed (continuing): ${e.message}`);
      decisions = { agents: {} as Record<string, any>, llm: {} as Record<string, any>, healing: {} as Record<string, any>, retry: {} as Record<string, any>, pipeline: {} as Record<string, any>, context: { risk: 'low', priority: 'normal' } };
    }

    // ── Step 2: Select profile ───────────────────────────────────────────
    const profileName = options.profile || cliConfig.selectProfileFromContext({
      platform,
      isCI: process.env.CI === 'true',
      risk: { level: decisions.context.risk || 'low' },
      hasFailures: options.hasFailures || false,
      tags: process.env.TAGS || ''
    });

    console.log(`[PlaywrightCLIAgent] Selected profile: ${profileName}`);

    // ── Step 3: Execute via PlaywrightExecutionEngine (single spawn) ────
    console.log('[PlaywrightCLIAgent] Delegating to PlaywrightExecutionEngine...');

    try {
      const execResult = await executionEngine.execute({
        profile: profileName,
        platform: platform,
        project: options.project,
        testFile: options.testFile,
        browsers: options.browser ? [options.browser] : undefined,
        headed: options.headed,
        extraArgs: options.extraArgs,
        envOverrides: {
          ...options.envOverrides,
          TEST_PLATFORM: platform,
          PLAYWRIGHT_CLI_AGENT: 'true',
          AI_RISK_LEVEL: decisions.context.risk || 'low',
          AI_PRIORITY: decisions.context.priority || 'normal'
        },
        emitEvents: true,
        validateEnv: true
      });

      execResult.aiDecisions = decisions;
      execResult.aiContext = decisions.context;
      this.executionResult = execResult;

      EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_COMPLETED, {
        platform,
        profile: profileName,
        exitCode: execResult.exitCode,
        duration: execResult.duration,
        passed: execResult.passed,
        failed: execResult.failed,
        skipped: execResult.skipped,
        aiContext: decisions.context
      });

      console.log(`[PlaywrightCLIAgent] Completed. Exit code: ${execResult.exitCode}`);

      return {
        agent: 'PlaywrightCLIAgent',
        exitCode: execResult.exitCode,
        profile: profileName,
        duration: execResult.duration,
        durationFormatted: execResult.durationFormatted,
        passed: execResult.passed,
        failed: execResult.failed,
        skipped: execResult.skipped,
        reportPaths: execResult.reportPaths,
        aiDecisions: {
          risk: decisions.context.risk,
          priority: decisions.context.priority,
          retry: decisions.retry
        }
      };

    } catch (err: any) {
      console.error(`[PlaywrightCLIAgent] Execution failed: ${err.message}`);
      EventBus.emit(EventBus.EVENTS.PLAYWRIGHT_CLI_FAILED, {
        platform, profile: profileName, error: err.message
      });
      this.executionResult = { error: err.message, exitCode: 1 };
      throw err;
    }
  }

  getResult() { return this.executionResult; }

  static async healthCheck() {
    const pwPath = path.join(process.cwd(), 'node_modules', '.bin', 'playwright');
    const hasBinary = fs.existsSync(pwPath);
    const hasModule = fs.existsSync(path.join(process.cwd(), 'node_modules', '@playwright', 'test'));
    return { available: hasBinary && hasModule, binaryExists: hasBinary, moduleInstalled: hasModule, binaryPath: pwPath };
  }
}

async function run(options: any = {}) {
  const agent = new PlaywrightCLIAgent(options);
  return agent.run(options);
}

export default PlaywrightCLIAgent;
export { run };
export const metadata = {
  name: 'Playwright CLI Agent',
  version: '1.0.0',
  description: 'AI-driven Playwright CLI execution engine. All execution routes through PlaywrightExecutionEngine — the single spawn point.',
  dependencies: ['DecisionEngine', 'EventBus', 'PlaywrightExecutionEngine'],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['execution', 'playwright-cli', 'ai'],
  executionStage: 'execution',
  priority: 95,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 1, backoff: 'exponential' },
  lifecycle: 'active'
};
