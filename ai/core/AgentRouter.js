/**
 * AgentRouter.js
 *
 * Context-aware agent execution router.
 * Determines WHICH agents to run based on the current execution context,
 * instead of running all agents blindly.
 *
 * Architecture:
 *   - Builds an ExecutionContext from current state (platform, failures, CI mode, etc.)
 *   - Evaluates each agent's metadata.conditions against the context
 *   - Respects agent priority and execution stage ordering
 *   - Returns a filtered, ordered execution plan
 *
 * Usage:
 *   const router = require('./core/AgentRouter');
 *   const plan = await router.buildPlan({
 *     platform: 'WEB',
 *     hasFailures: true,
 *     isCI: false
 *   });
 *   // plan = [{ key, module, metadata, ... }, ...]
 */

const registry = require('./AgentRegistry');

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

// ─── Execution Context ─────────────────────────────────────────────────────

class ExecutionContext {
  constructor(options = {}) {
    // Platform context
    this.platform = (options.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    this.isMobile = this.platform === 'ANDROID' || this.platform === 'IOS';
    this.isAndroid = this.platform === 'ANDROID';
    this.isIOS = this.platform === 'IOS';
    this.isWeb = this.platform === 'WEB';
    this.isAPI = this.platform === 'API';

    // Execution state
    this.hasFailures = options.hasFailures === true || (options.exitCode !== undefined && options.exitCode !== 0);
    this.exitCode = options.exitCode !== undefined ? options.exitCode : 0;
    this.hasResults = options.hasResults === true;
    this.hasHistory = options.hasHistory === true;
    this.hasPerformanceData = options.hasPerformanceData === true;
    this.hasJenkinsLog = options.hasJenkinsLog === true;
    this.hasLocatorFailures = options.hasLocatorFailures === true;

    // Mode context
    this.isCI = options.isCI === true || process.env.CI === 'true';
    this.isDeviceFarm = options.isDeviceFarm === true;
    this.isHealingEnabled = options.isHealingEnabled !== false;
    this.isRetryEnabled = options.isRetryEnabled !== false;

    // Override flags (explicit user requests)
    this.forceFull = options.forceFull === true;
    this.runOnDemand = options.runOnDemand === true;
    this.skipStage = options.skipStage || [];
    this.onlyStage = options.onlyStage || null;

    // Additional metadata
    this.browser = options.browser || process.env.BROWSER || 'chromium';
    this.tags = options.tags || process.env.TAGS || '';

    // Timestamp
    this.createdAt = new Date().toISOString();
  }

  /**
   * Check if a given stage should be executed.
   */
  shouldRunStage(stage) {
    if (this.onlyStage) return stage === this.onlyStage;
    return !this.skipStage.includes(stage);
  }

  /**
   * Determine if an agent's conditions are satisfied by this context.
   */
  satisfiesConditions(conditions) {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(cond => {
      if (typeof cond === 'string') {
        return this._evaluateCondition(cond);
      }
      if (cond.type) {
        return this._evaluateCondition(cond.type, cond);
      }
      return true;
    });
  }

  _evaluateCondition(type, cond = {}) {
    switch (type) {
      case 'always':
        return true;

      case 'hasFailures':
        return this.hasFailures;

      case 'hasResults':
        return this.hasResults;

      case 'hasHistory':
        return this.hasHistory;

      case 'hasPerformanceData':
        return this.hasPerformanceData;

      case 'hasJenkinsLog':
        return this.hasJenkinsLog;

      case 'locatorFailure':
        return this.hasLocatorFailures;

      case 'platform':
        if (cond.value) {
          return cond.value.toUpperCase() === this.platform;
        }
        return true;

      case 'ci':
        return this.isCI;

      case 'onDemand':
        return this.runOnDemand;

      case 'deviceFarm':
        return this.isDeviceFarm;

      case 'mobile':
        return this.isMobile;

      case 'web':
        return this.isWeb;

      case 'android':
        return this.isAndroid;

      case 'ios':
        return this.isIOS;

      case 'api':
        return this.isAPI;

      default:
        return true;
    }
  }

  /**
   * Serialize context for logging/reporting.
   */
  summarize() {
    return {
      platform: this.platform,
      mode: this.isCI ? 'CI' : 'Local',
      hasFailures: this.hasFailures,
      hasHistory: this.hasHistory,
      isMobile: this.isMobile,
      isDeviceFarm: this.isDeviceFarm,
      stages: STAGE_ORDER.filter(s => this.shouldRunStage(s))
    };
  }
}

// ─── Agent Router ──────────────────────────────────────────────────────────

class AgentRouter {
  constructor() {
    this._discovered = false;
  }

  /**
   * Build an execution plan filtered by the given context.
   * @param {Object|ExecutionContext} contextOptions
   * @returns {Promise<{plan: Array, context: ExecutionContext, stats: Object}>}
   */
  async buildPlan(contextOptions = {}) {
    if (!this._discovered) {
      await registry.discover();
      this._discovered = true;
    }

    const context = contextOptions instanceof ExecutionContext
      ? contextOptions
      : new ExecutionContext(contextOptions);

    const allAgents = registry.getAll();
    const plan = [];
    const skipped = [];
    const seen = new Set();

    for (const stage of STAGE_ORDER) {
      if (!context.shouldRunStage(stage)) {
        skipped.push({ stage, reason: 'stage-skipped' });
        continue;
      }

      // Get agents for this stage, sorted by priority
      const stageAgents = allAgents
        .filter(a => a.metadata.executionStage === stage)
        .sort((a, b) => (a.metadata.priority || 50) - (b.metadata.priority || 50));

      for (const agent of stageAgents) {
        if (seen.has(agent.key)) continue;

        // Check lifecycle
        if (agent.metadata.lifecycle === 'deprecated' || agent.metadata.lifecycle === 'placeholder') {
          skipped.push({ key: agent.key, stage, reason: `lifecycle:${agent.metadata.lifecycle}` });
          continue;
        }

        // Check platform support
        const platforms = agent.metadata.platforms || [];
        if (platforms.length > 0 && !platforms.includes(context.platform) && !context.forceFull) {
          skipped.push({ key: agent.key, stage, reason: `platform:${context.platform} not in [${platforms.join(',')}]` });
          continue;
        }

        // Check conditions
        const conditions = agent.metadata.conditions || [];
        if (!context.satisfiesConditions(conditions) && !context.forceFull) {
          const condStr = conditions.map(c => typeof c === 'string' ? c : c.type).join(',');
          skipped.push({ key: agent.key, stage, reason: `conditions:[${condStr}] not satisfied` });
          continue;
        }

        // Check if agent has a run() method
        if (!agent.hasRun && !agent.module.run && !(agent.module.prototype && typeof agent.module.prototype.run === "function")) {
          skipped.push({ key: agent.key, stage, reason: 'no-run-method' });
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
                dependsOn: []
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
          dependsOn: depChain.filter(d => seen.has(d) || registry.get(d))
        });
      }
    }

    // Deduplicate: keep first occurrence only
    const seenKeys = new Set();
    const dedupedPlan = [];
    for (const a of plan) {
      if (!seenKeys.has(a.key)) {
        seenKeys.add(a.key);
        dedupedPlan.push(a);
      }
    }

    return {
      plan: dedupedPlan,
      skipped,
      context: context.summarize(),
      stats: {
        totalAgents: allAgents.length,
        planned: dedupedPlan.length,
        skipped: skipped.length
      }
    };
  }

  /**
   * Create a context from real execution results.
   */
  createContextFromResults(execPhase, options = {}) {
    const hasFailures = execPhase && execPhase.exitCode !== 0;
    const hasResults = execPhase && execPhase.execResult && execPhase.execResult.failures && execPhase.execResult.failures.length > 0;

    return new ExecutionContext({
      platform: execPhase ? execPhase.platform : undefined,
      exitCode: execPhase ? execPhase.exitCode : 0,
      hasFailures,
      hasResults,
      hasLocatorFailures: hasResults && (execPhase.execResult.failures || []).some(f =>
        (f.error || '').toLowerCase().includes('locator') ||
        (f.error || '').toLowerCase().includes('selector')
      ),
      isCI: process.env.CI === 'true',
      forceFull: options.forceFull || false,
      skipStage: options.skipStage || [],
      onlyStage: options.onlyStage || null,
      ...options
    });
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new AgentRouter();

module.exports = instance;
module.exports.AgentRouter = AgentRouter;
module.exports.ExecutionContext = ExecutionContext;
module.exports.STAGES = STAGES;
module.exports.STAGE_ORDER = STAGE_ORDER;
