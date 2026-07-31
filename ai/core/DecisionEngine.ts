import fs from 'fs-extra';
import path from 'path';
/**
 * DecisionEngine.js
 *
 * Enterprise intelligent decision engine for the AI automation framework.
 *
 * Analyzes context (platform, environment, failure history, git changes,
 * risk, priority, execution mode) and makes decisions about:
 *   - Which agents to execute
 *   - Which LLM strategy to use
 *   - Which healing strategy to apply
 *   - Which retry strategy to use
 *   - Which execution pipeline to run
 *
 * Usage:
 *   const engine = require('./core/DecisionEngine');
 *   const decisions = await engine.evaluate(context);
 *   // decisions = { agents, llm, healing, retry, pipeline }
 */


class DecisionEngine {
  /**
   * Evaluate context and produce decisions.
   * @param {Object} context - { platform, hasFailures, isCI, gitChanges, failureHistory, ... }
   * @returns {Object} decisions
   */
  async evaluate(context: any = {}) {
    console.log('[DecisionEngine] Evaluating context for intelligent decisions');

    // Enrich context with available data
    const enrichedContext: any = await this._enrichContext(context);

    return {
      agents: this._decideAgents(enrichedContext),
      llm: this._decideLLM(enrichedContext),
      healing: this._decideHealingStrategy(enrichedContext),
      retry: this._decideRetryStrategy(enrichedContext),
      pipeline: this._decidePipeline(enrichedContext),
      context: enrichedContext.summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Enrich context with registry, health, memory, and git data.
   */
  async _enrichContext(context: any) {
    const enriched: Record<string, any> = {
      platform: (context.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase(),
      hasFailures: context.hasFailures === true || context.exitCode !== 0,
      exitCode: context.exitCode !== undefined ? context.exitCode : 0,
      isCI: context.isCI === true || process.env.CI === 'true',
      isMobile: ['ANDROID', 'IOS'].includes((context.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase()),
      runOnDemand: context.runOnDemand === true,
      forceFull: context.forceFull === true,

      // Environment
      environment: process.env.ENV || 'dev',
      browser: process.env.BROWSER || 'chromium',
      headless: require('../../config/executionConfig').isHeadless,
      parallel: Number(process.env.PARALLEL || 1),

      // Failure history from memory
      failureHistory: this._getFailureHistory(),

      // Git changes
      gitChanges: this._getGitChanges(),

      // Failure rate trend
      failureTrend: this._getFailureTrend(),

      // Performance trend
      performanceTrend: this._getPerformanceTrend()
    };

    // Risk assessment
    enriched.risk = this._assessRisk(enriched);

    // Priority based on mode and risk
    enriched.priority = context.priority || this._determinePriority(enriched);

    // Summary for logging
    enriched.summary = {
      platform: enriched.platform,
      mode: enriched.isCI ? 'CI' : 'Local',
      risk: enriched.risk,
      priority: enriched.priority,
      failures: enriched.hasFailures,
      gitChanges: enriched.gitChanges.length
    };

    return enriched;
  }

  /**
   * Get failure history from FailureMemoryStore.
   */
  _getFailureHistory() {
    try {
      const FailureMemoryStore = require('../memory/FailureMemoryStore');
      const store = new FailureMemoryStore();
      return store.getTopFailures(10).map((f: any) => ({
        scenario: f.scenario,
        feature: f.feature,
        count: f.count,
        lastSeen: f.lastSeen
      }));
    } catch (e: any) {
      return [];
    }
  }

  /**
   * Get git changes.
   */
  _getGitChanges() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git diff --name-only HEAD~1 2>/dev/null || git status --porcelain 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
      return output.trim().split('\n').filter(Boolean).map((l: any) => l.replace(/^[MARC??]+\s+/, '').trim()).filter(Boolean);
    } catch (e: any) {
      return [];
    }
  }

  /**
   * Get failure trend from performance memory.
   */
  _getFailureTrend() {
    try {
      const PerformanceMemoryStore = require('../memory/PerformanceMemoryStore');
      const store = new PerformanceMemoryStore();
      return store.getTrends(10);
    } catch (e: any) {
      return { recentRuns: 0, trend: 'insufficient-data' };
    }
  }

  /**
   * Get performance trend.
   */
  _getPerformanceTrend() {
    try {
      const PerformanceMemoryStore = require('../memory/PerformanceMemoryStore');
      const store = new PerformanceMemoryStore();
      const trends = store.getTrends(10);
      return trends;
    } catch (e: any) {
      return { averageDuration: 0, averagePassRate: 0 };
    }
  }

  /**
   * Assess risk based on context.
   */
  _assessRisk(context: any) {
    let risk = 'low';
    let score = 0;

    // Platform risk
    if (context.isMobile) score += 1;

    // Failure history risk
    const recentFailures = context.failureHistory.filter((f: any) => {
      const age = Date.now() - new Date(f.lastSeen).getTime();
      return age < 86400000 * 7; // Last 7 days
    });
    if (recentFailures.length > 5) score += 3;
    else if (recentFailures.length > 2) score += 2;
    else if (recentFailures.length > 0) score += 1;

    // Git changes risk
    const criticalFiles = context.gitChanges.filter((f: any) =>
      f.includes('hooks/') || f.includes('config/') || f === 'cucumber.js' || f === 'playwright.config.js'
    );
    if (criticalFiles.length > 0) score += 3;
    if (context.gitChanges.length > 20) score += 2;
    else if (context.gitChanges.length > 10) score += 1;

    // Performance trend risk
    if (context.performanceTrend.trend === 'degrading') score += 2;

    // CI mode
    if (context.isCI) score += 1;

    if (score >= 6) risk = 'critical';
    else if (score >= 4) risk = 'high';
    else if (score >= 2) risk = 'medium';

    return { level: risk, score };
  }

  /**
   * Determine execution priority.
   */
  _determinePriority(context: any) {
    if (context.isCI && context.hasFailures) return 'critical';
    if (context.risk.level === 'critical') return 'critical';
    if (context.risk.level === 'high') return 'high';
    if (context.isCI) return 'high';
    if (context.risk.level === 'medium') return 'medium';
    return 'normal';
  }

  /**
   * Decide which agents to execute based on context.
   */
  _decideAgents(context: any) {
    const agents = { always: [] as any[], conditional: [] as any[], skip: [] as any[] };

    // Always-run agents (core infrastructure)
    agents.always = ['mcpHealthCheckAgent', 'EcosystemReadinessAgent', 'PlannerAgent',
      'TestExecutionAgent', 'executionMemoryAgent', 'memoryAgent',
      'vectorSearchAgent', 'ReportAgent', 'AIDashboardAgent',
      'reportSummarizationAgent', 'ReleaseGateAgent', 'observabilityAgent',
      'notificationsAgent'];

    if (context.hasFailures || context.forceFull) {
      agents.conditional.push('failureAnalysisAgent', 'locatorHealingAgent', 'RCAAgent', 'RetryAgent');
    }

    if (context.risk.level === 'high' || context.risk.level === 'critical' || context.forceFull) {
      agents.conditional.push('ImpactAgent', 'MonitoringAgent', 'SelfHealingPipelineAgent',
        'AnomalyDetectionAgent', 'HealingAgent');
    }

    if (context.isCI) {
      agents.conditional.push('SmartTestSelectorAgent', 'JenkinsAgent', 'PRAgent');
    }

    if (context.isCI && context.hasFailures) {
      agents.conditional.push('prPreparationAgent', 'jenkinsBuildFailureAnalysisAgent');
    }

    if (context.platform === 'ANDROID' || context.platform === 'IOS') {
      agents.conditional.push('MobileDeviceFarmAgent');
    }

    return agents;
  }

  /**
   * Decide which LLM strategy to use.
   */
  _decideLLM(context: any) {
    const llm: Record<string, any> = {};

    // Default LLM settings
    llm.model = process.env.AI_MODEL || process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
    llm.embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    llm.strategy = 'rag';  // rag | llm-only | hybrid

    // For high-risk or CI: use more capable models
    if (context.risk.level === 'critical' || context.priority === 'critical') {
      llm.strategy = 'hybrid';
      llm.model = process.env.AI_MODEL_CRITICAL || process.env.AI_MODEL || 'llama3.2:3b';
      llm.temperature = 0.1;
    } else if (context.risk.level === 'high' || context.isCI) {
      llm.strategy = 'rag';
      llm.temperature = 0.2;
    } else {
      // Local/quick runs: use lightweight
      llm.strategy = 'rag';
      llm.temperature = 0.3;
    }

    // For CI with failures: deeper analysis
    if (context.isCI && context.hasFailures) {
      llm.analysisDepth = 'deep';
      llm.topK = 8;
    } else {
      llm.analysisDepth = 'standard';
      llm.topK = 5;
    }

    return llm;
  }

  /**
   * Decide which healing strategy to use.
   */
  _decideHealingStrategy(context: any) {
    const healing: Record<string, any> = {};

    // Default: RAG-based healing
    healing.primary = 'rag';  // rag | engine | hybrid
    healing.mode = 'recommend'; // recommend | apply | dry-run
    healing.autoApplyThreshold = 0.85;
    healing.maxCandidates = 5;

    // For high-risk or CI: use full engine
    if (context.risk.level === 'critical' || context.risk.level === 'high' || context.isCI) {
      healing.primary = 'hybrid';
      healing.mode = 'recommend';
      healing.autoApplyThreshold = 0.90;
      healing.maxCandidates = 8;
    }

    // For local runs with few failures: safe recommend only
    if (!context.isCI && context.failureHistory.length <= 2) {
      healing.primary = 'rag';
      healing.mode = 'recommend';
      healing.autoApplyThreshold = 0.95; // Only auto-apply very high confidence
    }

    // For many consecutive failures: aggressive healing
    const recentFailures = context.failureHistory.filter((f: any) => {
      const age = Date.now() - new Date(f.lastSeen).getTime();
      return age < 86400000; // Last 24 hours
    });
    if (recentFailures.length >= 3) {
      healing.mode = 'dry-run';
      healing.autoApplyThreshold = 0.80;
      healing.generatePatches = true;
    }

    return healing;
  }

  /**
   * Decide which retry strategy to use.
   */
  _decideRetryStrategy(context: any) {
    const retry: Record<string, any> = {};

    // Default: 1 retry
    retry.maxRetries = 1;
    retry.backoff = 'linear';  // none | linear | exponential
    retry.retryDelay = 5000;
    retry.scope = 'failed';  // failed | all

    // CI: more retries
    if (context.isCI) {
      retry.maxRetries = 2;
      retry.backoff = 'exponential';
      retry.retryDelay = 10000;
    }

    // Critical: more retries
    if (context.risk.level === 'critical') {
      retry.maxRetries = 3;
      retry.backoff = 'exponential';
      retry.retryDelay = 15000;
    }

    // High priority
    if (context.priority === 'high') {
      retry.maxRetries = Math.max(retry.maxRetries, 2);
    }

    // Performance-degrading: single retry with backoff
    if (context.performanceTrend.trend === 'degrading') {
      retry.retryDelay = 30000; // Wait longer if system is slow
      retry.backoff = 'exponential';
    }

    return retry;
  }

  /**
   * Decide which execution pipeline to use.
   */
  _decidePipeline(context: any) {
    const pipeline: Record<string, any> = {};

    // Default: standard pipeline
    pipeline.stages = ['preflight', 'execution', 'analysis', 'multi-agent', 'reporting', 'cleanup'];
    pipeline.parallel = false;
    pipeline.skippedStages = [];

    // CI: full pipeline
    if (context.isCI) {
      pipeline.parallel = false;
      pipeline.skippedStages = [];
    }

    // Local quick runs: skip some stages
    if (!context.isCI && context.priority === 'normal') {
      pipeline.skippedStages = [];
      // Include all stages but with fewer agents
    }

    // Mobile: add device farm stage
    if (context.isMobile) {
      pipeline.includeDeviceFarm = true;
    }

    // API: skip mobile-specific stages
    if (context.platform === 'API') {
      pipeline.skippedStages = [];
    }

    // Critical: run everything
    if (context.risk.level === 'critical' || context.priority === 'critical') {
      pipeline.skippedStages = [];
      pipeline.forceFull = true;
    }

    // Dry run mode
    if (context.runOnDemand) {
      pipeline.stages = ['preflight'];
    }

    return pipeline;
  }
}

export default DecisionEngine;
