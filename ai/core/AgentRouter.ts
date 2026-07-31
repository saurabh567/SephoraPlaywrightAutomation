import registry from './AgentRegistry';
import executionContext from './ExecutionContext';
/**
 * AgentRouter.js
 *
 * Context-aware agent execution router.
 * Determines WHICH agents to run based on the current execution context,
 * instead of running all agents blindly.
 *
 * Uses the singleton ExecutionContext (ai/core/ExecutionContext.js) for all
 * execution state. No duplicate context creation.
 *
 * Every skipped agent includes an explicit human-readable reason.
 * No agent is silently skipped.
 *
 * Architecture:
 *   - Reads the singleton ExecutionContext for current state
 *   - Evaluates each agent's metadata.conditions against the context
 *   - Returns { satisfied: boolean, reason: string } for every condition
 *   - Respects agent priority and execution stage ordering
 *   - Returns a filtered, ordered execution plan with skip reasons
 *
 * Usage:
 *   const router = require('./core/AgentRouter');
 *   const plan = await router.buildPlan({ platform: 'WEB' });
 *   // plan = [{ key, module, metadata, ... }, ...]
 *   // plan.skipped = [{ key, reason: 'Platform mismatch: ...' }, ...]
 */


// ─── Execution Stage Constants ─────────────────────────────────────────────
const STAGES = {
  PREFLIGHT:      'preflight',
  EXECUTION:      'execution',
  ANALYSIS:       'analysis',
  MULTI_AGENT:    'multi-agent',
  REPORTING:      'reporting',
  CLEANUP:        'cleanup'
};

const STAGE_ORDER = [STAGES.PREFLIGHT, STAGES.EXECUTION, STAGES.ANALYSIS, STAGES.MULTI_AGENT, STAGES.REPORTING, STAGES.CLEANUP];

// ─── Condition Evaluator ───────────────────────────────────────────────────
// Evaluates agent metadata.conditions against the execution context.
// Every condition returns { satisfied: boolean, reason: string|null }.

class ConditionEvaluator {
  [key: string]: any;
  constructor(context: any) {
    this.ctx = context;
  }

  /**
   * Determine if an agent's conditions are satisfied.
   * @returns {{ satisfied: boolean, reason: string|null }}
   */
  satisfies(conditions: any) {
    if (!conditions || conditions.length === 0) {
      return { satisfied: true, reason: null };
    }

    for (const cond of conditions) {
      const result = typeof cond === 'string'
        ? this._evaluate(cond)
        : cond.type ? this._evaluate(cond.type, cond) : { satisfied: true, reason: null };

      if (!result.satisfied) {
        return result;
      }
    }
    return { satisfied: true, reason: null };
  }

  _evaluate(type: any, cond: any = {}) {
    const ctx = this.ctx;

    switch (type) {
      case 'always':
        return { satisfied: true, reason: null };

      case 'hasFailures': {
        const hasF = ctx.hasFailures === true || (ctx.exitCode !== null && ctx.exitCode !== 0);
        return { satisfied: hasF, reason: hasF ? null : 'No failed tests' };
      }

      case 'hasResults': {
        const hasR = ctx.passedCount > 0 || ctx.failedCount > 0;
        return { satisfied: hasR, reason: hasR ? null : 'No execution data available' };
      }

      case 'hasHistory': {
        const hasH = ctx.scenarioCount > 0;
        return { satisfied: hasH, reason: hasH ? null : 'No execution data available' };
      }

      case 'hasPerformanceData':
        return { satisfied: false, reason: 'No performance data available' };

      case 'hasJenkinsLog': {
        const hasJ = !!ctx.jenkinsBuildNumber;
        return { satisfied: hasJ, reason: hasJ ? null : 'No Jenkins log available' };
      }

      case 'locatorFailure': {
        const hasL = ctx.hasFailures && ctx.failedCount > 0;
        return { satisfied: hasL, reason: hasL ? null : 'No locator failures' };
      }

      case 'platform': {
        if (cond.value) {
          const match = cond.value.toUpperCase() === ctx.platform;
          return {
            satisfied: match,
            reason: match ? null : 'Platform mismatch: expected ' + cond.value + ', got ' + ctx.platform
          };
        }
        return { satisfied: true, reason: null };
      }

      case 'ci':
        return { satisfied: ctx.isCI === true, reason: ctx.isCI ? null : 'Not a CI execution' };

      case 'onDemand':
        return { satisfied: false, reason: 'Manual trigger required' };

      case 'deviceFarm':
        return { satisfied: false, reason: 'No device farm execution' };

      case 'mobile': {
        const isMob = ctx.platform === 'ANDROID' || ctx.platform === 'IOS';
        return { satisfied: isMob, reason: isMob ? null : 'No mobile execution' };
      }

      case 'web': {
        const isWeb = ctx.platform === 'WEB';
        return { satisfied: isWeb, reason: isWeb ? null : 'Not a web execution' };
      }

      case 'android': {
        const isDroid = ctx.platform === 'ANDROID';
        return { satisfied: isDroid, reason: isDroid ? null : 'No Android execution' };
      }

      case 'ios': {
        const isIos = ctx.platform === 'IOS';
        return { satisfied: isIos, reason: isIos ? null : 'No iOS execution' };
      }

      case 'api': {
        const isApi = ctx.platform === 'API';
        return { satisfied: isApi, reason: isApi ? null : 'No API execution' };
      }

      default:
        return { satisfied: true, reason: null };
    }
  }

  /**
   * Check if a given stage should be executed.
   */
  shouldRunStage(stage: any, onlyStage: any, skipStage: any) {
    if (onlyStage) return stage === onlyStage;
    return !(skipStage || []).includes(stage);
  }
}

// ─── Agent Router ──────────────────────────────────────────────────────────

class AgentRouter {
  [key: string]: any;
  constructor() {
    this._discovered = false;
  }

  /**
   * Build an execution plan filtered by the current context.
   * Every skipped entry includes a human-readable reason.
   *
   * @param {Object} [options] - Overrides for context fields
   * @returns {Promise<{plan: Array, skipped: Array, context: Object, stats: Object}>}
   */
  async buildPlan(options: any = {}) {
    if (!this._discovered) {
      await registry.discover();
      this._discovered = true;
    }

    // Use the singleton ExecutionContext, enriched with any call-site overrides
    const ctx = executionContext;
    if (options.platform) ctx.platform = options.platform.toUpperCase();
    if (options.hasFailures !== undefined) ctx.hasFailures = options.hasFailures;
    if (options.exitCode !== undefined) ctx.exitCode = options.exitCode;
    if (options.isCI !== undefined) ctx.isCI = options.isCI;
    if (options.tags) ctx.tags = options.tags;
    if (options.browser) ctx.browser = options.browser;

    const onlyStage = options.onlyStage || null;
    const skipStage = options.skipStage || [];
    const forceFull = options.forceFull === true;

    const evaluator = new ConditionEvaluator(ctx);
    const allAgents = registry.getAll();
    const plan: any[] = [];
    const skipped: any[] = [];
    const seen = new Set();

    for (const stage of STAGE_ORDER) {
      if (!evaluator.shouldRunStage(stage, onlyStage, skipStage)) {
        // Stage-level skip
        for (const agent of allAgents) {
          if (agent.metadata.executionStage === stage && !seen.has(agent.key)) {
            skipped.push({ key: agent.key, name: agent.metadata.name, stage, reason: 'Execution stage skipped: ' + stage });
            seen.add(agent.key);
          }
        }
        continue;
      }

      // Get agents for this stage, sorted by priority
      const stageAgents = allAgents
        .filter(a => a.metadata.executionStage === stage)
        .sort((a, b) => (a.metadata.priority || 50) - (b.metadata.priority || 50));

      for (const agent of stageAgents) {
        if (seen.has(agent.key)) continue;

        // Check lifecycle
        if (agent.metadata.lifecycle === 'deprecated') {
          skipped.push({ key: agent.key, name: agent.metadata.name, stage, reason: 'Agent lifecycle deprecated' });
          seen.add(agent.key);
          continue;
        }
        if (agent.metadata.lifecycle === 'placeholder') {
          skipped.push({ key: agent.key, name: agent.metadata.name, stage, reason: 'Agent is a placeholder' });
          seen.add(agent.key);
          continue;
        }

        // Check platform support
        const platforms = agent.metadata.platforms || [];
        if (platforms.length > 0 && !platforms.includes(ctx.platform) && !forceFull) {
          skipped.push({
            key: agent.key, name: agent.metadata.name, stage,
            reason: 'Platform mismatch: agent supports [' + platforms.join(', ') + '], current platform is ' + ctx.platform
          });
          seen.add(agent.key);
          continue;
        }

        // Check conditions — returns { satisfied, reason }
        const conditions = agent.metadata.conditions || [];
        const conditionResult = evaluator.satisfies(conditions);
        if (!conditionResult.satisfied && !forceFull) {
          const condStr = conditions.map((c: any) => typeof c === 'string' ? c : c.type).join(', ');
          skipped.push({
            key: agent.key, name: agent.metadata.name, stage,
            reason: conditionResult.reason || 'Condition not met: [' + condStr + ']'
          });
          seen.add(agent.key);
          continue;
        }

        // Check if agent has a run() method
        if (!agent.hasRun && !agent.module.run && !(agent.module.prototype && typeof agent.module.prototype.run === 'function')) {
          skipped.push({ key: agent.key, name: agent.metadata.name, stage, reason: 'Agent has no run() method' });
          seen.add(agent.key);
          continue;
        }

        // Resolve dependencies
        const depChain = registry.resolveDependencies(agent.key);
        for (const depKey of depChain) {
          if (!seen.has(depKey)) {
            const depAgent = registry.get(depKey);
            if (depAgent && depAgent.hasRun) {
              plan.push({
                key: depKey,
                name: depAgent.metadata.name,
                stage: depAgent.metadata.executionStage || stage,
                priority: depAgent.metadata.priority || 50,
                module: depAgent.module,
                metadata: depAgent.metadata,
                isDependency: true,
                dependsOn: [] as any[]
              });
              seen.add(depKey);
            }
          }
        }

        seen.add(agent.key);
        plan.push({
          key: agent.key,
          name: agent.metadata.name,
          stage,
          priority: agent.metadata.priority || 50,
          module: agent.module,
          metadata: agent.metadata,
          isDependency: false,
          dependsOn: depChain.filter((d: any) => seen.has(d) || registry.get(d))
        });
      }
    }

    // Deduplicate plan
    const seenKeys = new Set();
    const dedupedPlan: any[] = [];
    for (const a of plan) {
      if (!seenKeys.has(a.key)) {
        seenKeys.add(a.key);
        dedupedPlan.push(a);
      }
    }

    return {
      plan: dedupedPlan,
      skipped,
      context: ctx.summarize(),
      stats: {
        totalAgents: allAgents.length,
        planned: dedupedPlan.length,
        skipped: skipped.length
      }
    };
  }

  /**
   * Update the execution context from real execution results.
   */
  updateContextFromResults(execPhase: any, options: any = {}) {
    const ctx = executionContext;
    ctx.hasFailures = execPhase && execPhase.exitCode !== 0;
    ctx.exitCode = execPhase ? execPhase.exitCode : 0;

    if (execPhase && execPhase.passed !== undefined) ctx.passedCount = execPhase.passed;
    if (execPhase && execPhase.failed !== undefined) ctx.failedCount = execPhase.failed;
    if (execPhase && execPhase.skipped !== undefined) ctx.skippedCount = execPhase.skipped;

    if (options.forceFull !== undefined) ctx.set('forceFull', options.forceFull);

    return ctx;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new AgentRouter();

export default instance;
export { AgentRouter };
export const ExecutionContext = executionContext.constructor;;
export { STAGES, STAGE_ORDER };
