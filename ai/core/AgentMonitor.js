/**
 * AgentMonitor.js
 *
 * ENTERPRISE AI AGENT MONITOR
 *
 * Wraps AgentRegistry + AgentLifecycleManager + EventBus into a single
 * monitoring façade. Listens to every lifecycle event emitted by the
 * framework and builds a complete execution trace for all AI agents.
 *
 * This is a read-only overlay — it NEVER modifies agent logic.
 * Business logic of every existing agent is preserved verbatim.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │                  AgentMonitor                       │
 *   │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
 *   │  │ AgentRegistry │  │ LifecycleMgr │  │ EventBus  │ │
 *   │  │ (discovery)   │  │ (states)     │  │ (events)  │ │
 *   │  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
 *   │         │                 │                 │       │
 *   │         └─────────┬───────┴─────────────────┘       │
 *   │                   ▼                                 │
 *   │          AgentExecutionSnapshot                     │
 *   │          (full trace per agent)                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const monitor = require('./core/AgentMonitor');
 *   await monitor.initialize();     // Discover all agents
 *   await monitor.start();         // Begin listening to events
 *   // ... execution happens ...
 *   await monitor.stop();          // Stop listening
 *   const report = monitor.getSummary();
 *
 * Integration:
 *   Automatically invoked by runCucumberWithAi.js and
 *   enterpriseExecutionPipeline.js when HEADLESS=false or
 *   when npm run test:ai is used.
 */

const path = require('path');
const fs = require('fs-extra');
const EventBus = require('./EventBus');
const AgentRegistry = require('./AgentRegistry');
const AgentLifecycleManager = require('./AgentLifecycleManager');
const ExecutionContext = require('./ExecutionContext');

// ─── Constants ─────────────────────────────────────────────────────────────

const MONITOR_STORE_PATH = path.join(__dirname, '..', 'memory', 'agent-monitor-trace.json');
const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const CATEGORY_MAP = {
  'TestCaseGenerationAgent': 'Generation',
  'FeatureFileGenerationAgent': 'Generation',
  'StepDefinitionGenerationAgent': 'Generation',
  'PageObjectGenerationAgent': 'Generation',
  'apiTestGenerationAgent': 'Generation',
  'MobileTestGenerationAgent': 'Generation',
  'testDataGenerationAgent': 'Generation',
  'TestDataPipelineAgent': 'Generation',
  'failureAnalysisAgent': 'Analysis',
  'playwrightCodeReviewAgent': 'Analysis',
  'reportSummarizationAgent': 'Analysis',
  'AnomalyDetectionAgent': 'Analysis',
  'apiAnalysisAgent': 'Analysis',
  'jmeterPerformanceAnalysisAgent': 'Analysis',
  'rootCauseAnalysisAgent': 'Analysis',
  'locatorHealingAgent': 'Healing',
  'selfHealingAutomationAgent': 'Healing',
  'SelfHealingPipelineAgent': 'Healing',
  'locatorHealingApplier': 'Healing',
  'LocatorApplyManager': 'Healing',
  'ExecutionAgent': 'Execution',
  'TestExecutionAgent': 'Execution',
  'executionMemoryAgent': 'Execution',
  'PlannerAgent': 'Orchestration',
  'DecisionAgent': 'Orchestration',
  'RetryAgent': 'Orchestration',
  'HealingAgent': 'Orchestration',
  'RCAAgent': 'Orchestration',
  'UnifiedMCPOrchestratorAgent': 'Orchestration',
  'AIDashboardAgent': 'Dashboard',
  'ReportAgent': 'Reporting',
  'ConsolidatedReportAgent': 'Reporting',
  'PRAgent': 'Reporting',
  'prPreparationAgent': 'Reporting',
  'DocumentationGeneratorAgent': 'Documentation',
  'SecretsVaultAgent': 'Security',
  'SmartTestSelectorAgent': 'Quality',
  'VisualAgent': 'Quality',
  'ImpactAgent': 'Quality',
  'ReleaseGateAgent': 'Quality',
  'EcosystemReadinessAgent': 'Quality',
  'MonitoringAgent': 'Infrastructure',
  'agentHealthAgent': 'Infrastructure',
  'mcpHealthCheckAgent': 'Infrastructure',
  'notificationsAgent': 'Infrastructure',
  'observabilityAgent': 'Infrastructure',
  'memoryAgent': 'Infrastructure',
  'vectorSearchAgent': 'Infrastructure',
  'llmIntelligenceAgent': 'Intelligence',
  'productionValidationAgent': 'Validation',
  'JenkinsAgent': 'CI/CD',
  'jenkinsBuildFailureAnalysisAgent': 'CI/CD',
  'APIAgent': 'API',
  'MobileAgent': 'Mobile',
  'MobileDeviceFarmAgent': 'Mobile',
  'AppiumAgent': 'Mobile',
  'PlaywrightCLIAgent': 'Framework',
  'samplePluginAgent': 'Plugin',
  'LocatorConfidenceScorer': 'Healing',
  'LocatorHealingEngine': 'Healing',
  'LocatorHistoryStore': 'Healing'
};

const MODULE_MAP = {
  'TestCaseGenerationAgent': 'AI Generation',
  'FeatureFileGenerationAgent': 'AI Generation',
  'StepDefinitionGenerationAgent': 'AI Generation',
  'PageObjectGenerationAgent': 'AI Generation',
  'apiTestGenerationAgent': 'API',
  'MobileTestGenerationAgent': 'Mobile',
  'testDataGenerationAgent': 'AI Generation',
  'TestDataPipelineAgent': 'AI Generation',
  'failureAnalysisAgent': 'AI Analysis',
  'playwrightCodeReviewAgent': 'AI Analysis',
  'reportSummarizationAgent': 'Reporting',
  'AnomalyDetectionAgent': 'AI Analysis',
  'apiAnalysisAgent': 'API',
  'jmeterPerformanceAnalysisAgent': 'Performance',
  'locatorHealingAgent': 'Web',
  'selfHealingAutomationAgent': 'Web',
  'SelfHealingPipelineAgent': 'Web',
  'ExecutionAgent': 'Framework',
  'TestExecutionAgent': 'Framework',
  'executionMemoryAgent': 'Framework',
  'PlannerAgent': 'Orchestration',
  'DecisionAgent': 'Orchestration',
  'RetryAgent': 'Orchestration',
  'HealingAgent': 'Orchestration',
  'RCAAgent': 'Orchestration',
  'UnifiedMCPOrchestratorAgent': 'Orchestration',
  'AIDashboardAgent': 'Dashboard',
  'ReportAgent': 'Reporting',
  'ConsolidatedReportAgent': 'Reporting',
  'PRAgent': 'Reporting',
  'prPreparationAgent': 'Reporting',
  'DocumentationGeneratorAgent': 'Documentation',
  'SecretsVaultAgent': 'Security',
  'SmartTestSelectorAgent': 'Quality',
  'VisualAgent': 'Quality',
  'ImpactAgent': 'Quality',
  'ReleaseGateAgent': 'Quality',
  'EcosystemReadinessAgent': 'Quality',
  'MonitoringAgent': 'Infrastructure',
  'agentHealthAgent': 'Infrastructure',
  'mcpHealthCheckAgent': 'Infrastructure',
  'notificationsAgent': 'Infrastructure',
  'observabilityAgent': 'Infrastructure',
  'memoryAgent': 'Infrastructure',
  'vectorSearchAgent': 'Infrastructure',
  'llmIntelligenceAgent': 'Intelligence',
  'productionValidationAgent': 'Validation',
  'JenkinsAgent': 'CI/CD',
  'jenkinsBuildFailureAnalysisAgent': 'CI/CD',
  'APIAgent': 'API',
  'MobileAgent': 'Mobile',
  'MobileDeviceFarmAgent': 'Mobile',
  'AppiumAgent': 'Mobile',
  'PlaywrightCLIAgent': 'Framework',
  'samplePluginAgent': 'Plugin',
  'LocatorConfidenceScorer': 'Web',
  'LocatorHealingEngine': 'Web',
  'LocatorHistoryStore': 'Web'
};

const STATUS_ICONS = {
  'REGISTERED': '📦',
  'INITIALIZED': '⚙️',
  'WAITING': '⏳',
  'ELIGIBLE': '✅',
  'RUNNING': '⚡',
  'COMPLETED': '✅',
  'FAILED': '❌',
  'SKIPPED': '⏭',
  'DISABLED': '🚫',
  'RECOVERED': '🔄',
  'IDLE': '💤',
  'NOT_REQUIRED': '📦'
};

// ─── Agent Snapshot ────────────────────────────────────────────────────────

class AgentExecutionSnapshot {
  constructor(agentKey, metadata = {}) {
    this.agentId = agentKey;
    this.agentName = metadata.name || agentKey;
    this.agentCategory = CATEGORY_MAP[agentKey] || metadata.executionStage || 'General';
    this.module = MODULE_MAP[agentKey] || metadata.module || 'General';
    this.description = metadata.description || '';
    this.sourceFile = metadata.filePath || '';
    this.triggerCondition = this._inferTriggerCondition(agentKey, metadata);
    this.executionOrder = metadata.priority || 50;

    this.status = 'REGISTERED';
    this.statusIcon = STATUS_ICONS.REGISTERED;
    this.reason = '';

    this.startTime = null;
    this.endTime = null;
    this.duration = 0;
    this.durationFormatted = '0ms';

    this.memoryUsage = null;
    this.cpuTime = null;
    this.triggerEvent = 'AgentRegistered';
    this.parentAgent = null;
    this.childAgents = [];
    this.executionThread = 'main';
    this.exception = null;
    this.errorStack = null;
    this.retryCount = 0;
    this.finalResult = null;

    this.stateHistory = [];

    this.platforms = metadata.platforms || [];
    this.dependencies = metadata.dependencies || [];
    this.lifecycle = metadata.lifecycle || 'active';
    this.version = metadata.version || '1.0.0';
    this.tags = metadata.tags || [];

    this._startTimeMs = null;
    this._endTimeMs = null;
  }

  _inferTriggerCondition(agentKey, metadata) {
    if (metadata.conditions && metadata.conditions.length > 0) {
      return metadata.conditions.map(c => c.type || JSON.stringify(c)).join(', ');
    }
    if (agentKey.includes('Android') || agentKey.includes('android')) return 'Android execution pipeline';
    if (agentKey.includes('IOS') || agentKey.includes('ios') || agentKey.includes('iOS')) return 'iOS execution pipeline';
    if (agentKey.includes('Mobile') || agentKey.includes('mobile')) return 'Mobile execution pipeline';
    if (agentKey.includes('API') || agentKey.includes('api')) return 'API execution pipeline';
    if (agentKey.includes('JMeter') || agentKey.includes('jmeter') || agentKey.includes('performance')) return 'Performance test pipeline';
    if (agentKey.includes('Web') || agentKey.includes('web')) return 'Web execution pipeline';
    if (agentKey.includes('Dashboard') || agentKey.includes('dashboard')) return 'Dashboard generation';
    if (agentKey.includes('Report') || agentKey.includes('report')) return 'Report generation';
    if (agentKey.includes('SelfHealing') || agentKey.includes('selfHealing') || agentKey.includes('heal')) return 'Self-healing pipeline';
    if (agentKey.includes('Locator') || agentKey.includes('locator')) return 'Locator healing pipeline';
    if (agentKey.includes('Test') || agentKey.includes('test') || agentKey.includes('Generation')) return 'Test generation pipeline';
    if (agentKey.includes('Analysis') || agentKey.includes('analysis') || agentKey.includes('RCA') || agentKey.includes('rca')) return 'Analysis pipeline';
    if (agentKey.includes('Jenkins') || agentKey.includes('jenkins')) return 'CI/CD pipeline';
    if (agentKey.includes('Security') || agentKey.includes('Vault') || agentKey.includes('secrets')) return 'Security pipeline';
    if (agentKey.includes('Monitoring') || agentKey.includes('monitoring')) return 'Monitoring pipeline';
    return 'Automated trigger';
  }

  setStatus(newStatus, reason = '') {
    const previousStatus = this.status;
    this.status = newStatus;
    this.statusIcon = STATUS_ICONS[newStatus] || '❓';
    this.reason = reason;

    this.stateHistory.push({
      from: previousStatus,
      to: newStatus,
      reason: reason,
      timestamp: new Date().toISOString()
    });
  }

  start() {
    this.startTime = new Date().toISOString();
    this._startTimeMs = Date.now();
    this.setStatus('RUNNING');
  }

  complete(result = {}) {
    this.endTime = new Date().toISOString();
    this._endTimeMs = Date.now();
    this.duration = this._endTimeMs - (this._startTimeMs || this._endTimeMs);
    this.durationFormatted = this._formatDuration(this.duration);
    this.finalResult = result.status || 'completed';

    if (result.error) {
      this.setStatus('FAILED', result.error.message || String(result.error));
      this.exception = result.error.message || String(result.error);
      this.errorStack = result.error.stack || null;
    } else {
      this.setStatus('COMPLETED');
    }
  }

  skip(reason) {
    this.endTime = new Date().toISOString();
    this.setStatus('SKIPPED', reason);
  }

  idle(reason) {
    this.setStatus('IDLE', reason || 'Not required for current execution pipeline');
  }

  disable(reason) {
    this.setStatus('DISABLED', reason || 'Agent lifecycle deprecated');
  }

  notRequired(reason) {
    this.setStatus('NOT_REQUIRED', reason || 'Platform not part of current pipeline');
  }

  toJSON() {
    return {
      agentId: this.agentId,
      agentName: this.agentName,
      agentCategory: this.agentCategory,
      module: this.module,
      description: this.description,
      sourceFile: this.sourceFile,
      triggerCondition: this.triggerCondition,
      executionOrder: this.executionOrder,
      status: this.status,
      statusIcon: this.statusIcon,
      reason: this.reason,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      durationFormatted: this.durationFormatted,
      memoryUsage: this.memoryUsage,
      cpuTime: this.cpuTime,
      triggerEvent: this.triggerEvent,
      parentAgent: this.parentAgent,
      childAgents: this.childAgents,
      executionThread: this.executionThread,
      exception: this.exception,
      errorStack: this.errorStack,
      retryCount: this.retryCount,
      finalResult: this.finalResult,
      stateHistory: this.stateHistory,
      platforms: this.platforms,
      dependencies: this.dependencies,
      lifecycle: this.lifecycle,
      version: this.version,
      tags: this.tags
    };
  }

  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
}

// ─── Agent Monitor ─────────────────────────────────────────────────────────

class AgentMonitor {
  constructor() {
    this._snapshots = new Map();
    this._unsubscribers = [];
    this._isRunning = false;
    this._startedAt = null;
    this._endedAt = null;
    this._executionId = null;
    this._allAgentsDiscovered = false;
    this._eventBus = EventBus;
    this._lifecycleManager = AgentLifecycleManager;
    this._registry = AgentRegistry;
    this._context = ExecutionContext;
  }

  /**
   * Initialize the monitor: discover all agents from the registry.
   */
  async initialize() {
    console.log('\n══════════════════════════════════════════════');
    console.log('  🤖 AI Agent Monitor — Initializing');
    console.log('══════════════════════════════════════════════\n');

    this._executionId = this._context.executionId || `mon-${Date.now().toString(36)}`;

    // Discover agents from registry
    const count = await this._registry.discover();
    const allAgents = this._registry.getAll();

    console.log(`  ✓ AgentRegistry discovered ${allAgents.length} agents`);

    // Register all agents with lifecycle manager
    const registeredCount = this._lifecycleManager.registerAll(allAgents);
    console.log(`  ✓ AgentLifecycleManager registered ${registeredCount} agents`);

    // Create snapshots
    for (const agent of allAgents) {
      const key = agent.key;
      const snapshot = new AgentExecutionSnapshot(key, {
        name: agent.metadata.name || agent.name,
        executionStage: agent.metadata.executionStage,
        description: agent.metadata.description,
        filePath: agent.filePath,
        priority: agent.metadata.priority,
        platforms: agent.metadata.platforms,
        dependencies: agent.metadata.dependencies,
        lifecycle: agent.metadata.lifecycle,
        version: agent.metadata.version,
        tags: agent.metadata.tags,
        module: agent.metadata.module
      });

      this._snapshots.set(key, snapshot);
    }

    this._allAgentsDiscovered = true;
    this._startedAt = new Date().toISOString();

    console.log(`  ✓ ${this._snapshots.size} agent snapshots created`);
    console.log('');

    return this._snapshots.size;
  }

  /**
   * Start monitoring: subscribe to EventBus lifecycle events.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    // Subscribe to agent lifecycle events
    const subs = [
      this._eventBus.on('AgentRegistered', (event) => {
        this._handleAgentEvent('REGISTERED', event);
      }),
      this._eventBus.on('AgentInitialized', (event) => {
        this._handleAgentEvent('INITIALIZED', event);
      }),
      this._eventBus.on('AgentWaiting', (event) => {
        this._handleAgentEvent('WAITING', event);
      }),
      this._eventBus.on('AgentEligible', (event) => {
        this._handleAgentEvent('ELIGIBLE', event);
      }),
      this._eventBus.on('AgentStarted', (event) => {
        this._handleAgentStarted(event);
      }),
      this._eventBus.on('AgentCompleted', (event) => {
        this._handleAgentCompleted(event);
      }),
      this._eventBus.on('AgentFailed', (event) => {
        this._handleAgentFailed(event);
      }),
      this._eventBus.on('AgentSkipped', (event) => {
        this._handleAgentSkipped(event);
      }),
      this._eventBus.on('AgentRecovered', (event) => {
        this._handleAgentRecovered(event);
      }),
      this._eventBus.on('AgentDisabled', (event) => {
        this._handleAgentDisabled(event);
      }),

      // Also subscribe to execution events
      this._eventBus.on('ExecutionStarted', (event) => {
        this._startedAt = new Date().toISOString();
      }),
      this._eventBus.on('ExecutionCompleted', (event) => {
        this._endedAt = new Date().toISOString();
      })
    ];

    this._unsubscribers.push(...subs);

    // Initialize all registered agents as wait-ready
    for (const [key, snapshot] of this._snapshots) {
      const lifecycleEntry = this._lifecycleManager._agents.get(key);
      if (lifecycleEntry) {
        if (lifecycleEntry.state === 'DISABLED') {
          snapshot.disable(lifecycleEntry.lastError || 'Lifecycle deprecated');
        } else if (lifecycleEntry.state === 'REGISTERED') {
          snapshot.setStatus('REGISTERED');
        } else if (lifecycleEntry.state === 'INITIALIZED') {
          snapshot.setStatus('INITIALIZED');
        }
      }
    }

    console.log('  ✓ AI Agent Monitor — listening for lifecycle events\n');
    return this;
  }

  /**
   * Stop monitoring and persist trace data.
   */
  async stop() {
    this._isRunning = false;
    this._endedAt = new Date().toISOString();

    // Unsubscribe from all events
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (_) {}
    }
    this._unsubscribers = [];

    // Mark any remaining WAITING/ELIGIBLE agents as IDLE
    for (const [key, snapshot] of this._snapshots) {
      if (snapshot.status === 'REGISTERED' || snapshot.status === 'INITIALIZED' || snapshot.status === 'WAITING' || snapshot.status === 'ELIGIBLE') {
        const lifecycleEntry = this._lifecycleManager._agents.get(key);
        if (lifecycleEntry) {
          if (lifecycleEntry.state === 'SKIPPED') {
            snapshot.skip(lifecycleEntry.skipReason || 'Automatically skipped');
          } else if (lifecycleEntry.state === 'DISABLED') {
            snapshot.disable(lifecycleEntry.lastError || 'Lifecycle deprecated');
          } else {
            snapshot.idle('Agent was not required for this execution pipeline');
          }
        } else {
          snapshot.idle('Agent was not triggered during this execution');
        }
      }
    }

    // Persist trace
    await this._persistTrace();

    console.log(`\n  ✓ AI Agent Monitor — stopped. Trace saved.\n`);
  }

  /**
   * Get the complete execution summary.
   */
  getSummary() {
    const snapshots = Array.from(this._snapshots.values());
    const total = snapshots.length;

    const byStatus = {};
    for (const s of snapshots) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    }

    const byModule = {};
    for (const s of snapshots) {
      byModule[s.module] = byModule[s.module] || { executed: 0, skipped: 0, failed: 0, idle: 0, disabled: 0, total: 0 };
      byModule[s.module].total++;
      if (s.status === 'COMPLETED' || s.status === 'RUNNING') byModule[s.module].executed++;
      else if (s.status === 'SKIPPED') byModule[s.module].skipped++;
      else if (s.status === 'FAILED') byModule[s.module].failed++;
      else if (s.status === 'IDLE' || s.status === 'NOT_REQUIRED') byModule[s.module].idle++;
      else if (s.status === 'DISABLED') byModule[s.module].disabled++;
      else byModule[s.module].executed++;
    }

    const totalDuration = snapshots.reduce((sum, s) => sum + s.duration, 0);
    const executedAgents = snapshots.filter(s =>
      s.status === 'COMPLETED' || s.status === 'RUNNING' || s.status === 'FAILED'
    ).length;
    const failedAgents = snapshots.filter(s => s.status === 'FAILED').length;
    const skippedAgents = snapshots.filter(s => s.status === 'SKIPPED').length;
    const idleAgents = snapshots.filter(s => s.status === 'IDLE' || s.status === 'NOT_REQUIRED').length;
    const waitingAgents = snapshots.filter(s => s.status === 'WAITING' || s.status === 'REGISTERED' || s.status === 'INITIALIZED' || s.status === 'ELIGIBLE').length;
    const disabledAgents = snapshots.filter(s => s.status === 'DISABLED').length;

    const overallStatus = failedAgents === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE';
    const successRate = executedAgents > 0
      ? Math.round(((executedAgents - failedAgents) / executedAgents) * 100)
      : 0;

    // Build timeline
    const timeline = [];
    for (const s of snapshots) {
      for (const h of s.stateHistory) {
        timeline.push({
          agentId: s.agentId,
          agentName: s.agentName,
          module: s.module,
          from: h.from,
          to: h.to,
          reason: h.reason,
          timestamp: h.timestamp
        });
      }
    }
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Execution timeline (simplified)
    const executionTimeline = [];
    for (const s of snapshots) {
      if (s.startTime) {
        executionTimeline.push({
          agentId: s.agentId,
          agentName: s.agentName,
          status: s.status,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          durationFormatted: s.durationFormatted,
          module: s.module,
          category: s.agentCategory
        });
      }
    }
    executionTimeline.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    return {
      executionId: this._executionId,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      totalDuration: totalDuration,
      totalDurationFormatted: this._formatDuration(totalDuration),

      summary: {
        totalAgents: total,
        initialized: total,
        executed: executedAgents,
        waiting: waitingAgents,
        skipped: skippedAgents,
        idle: idleAgents,
        failed: failedAgents,
        disabled: disabledAgents,
        overallStatus: overallStatus,
        successRate: successRate,
        failureRate: 100 - successRate,
        totalDuration: totalDuration,
        totalDurationFormatted: this._formatDuration(totalDuration)
      },

      moduleSummary: byModule,

      agents: snapshots.map(s => s.toJSON()).sort((a, b) => a.executionOrder - b.executionOrder),

      executionTimeline: executionTimeline,

      fullTimeline: timeline,

      aiHealthScore: failedAgents === 0 ? 100 : Math.max(0, 100 - (failedAgents / Math.max(1, executedAgents)) * 100),
      frameworkHealthScore: failedAgents === 0 ? 100 : Math.max(0, 100 - (failedAgents / Math.max(1, total)) * 100),

      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        headless: process.env.HEADLESS !== 'false',
        executionMode: process.env.TEST_PLATFORM || 'ALL'
      }
    };
  }

  /**
   * Get a specific agent snapshot.
   */
  getAgent(agentKey) {
    return this._snapshots.get(agentKey) || null;
  }

  /**
   * Get all agent snapshots.
   */
  getAllAgents() {
    return Array.from(this._snapshots.values());
  }

  /**
   * Get agent by status.
   */
  getByStatus(status) {
    return Array.from(this._snapshots.values()).filter(s => s.status === status);
  }

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║                      EVENT HANDLERS                                ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  _handleAgentEvent(state, event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    const reason = payload.reason || payload.skipReason || '';
    snapshot.setStatus(state, reason);
  }

  _handleAgentStarted(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.start();
  }

  _handleAgentCompleted(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.complete({ status: 'completed', ...payload });
  }

  _handleAgentFailed(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.complete({ status: 'failed', error: payload.error || payload });
  }

  _handleAgentSkipped(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.skip(payload.reason || payload.skipReason || 'Skipped');
  }

  _handleAgentRecovered(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.setStatus('RECOVERED', 'Recovered after retry');
  }

  _handleAgentDisabled(event) {
    const payload = event && event.payload ? event.payload : event;
    const agentKey = payload && (payload.key || payload.agentKey || payload.agentId || payload.name);
    if (!agentKey) return;

    const snapshot = this._snapshots.get(agentKey);
    if (!snapshot) return;

    snapshot.disable(payload.reason || 'Lifecycle disabled');
  }

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║                      PERSISTENCE                                   ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  async _persistTrace() {
    const summary = this.getSummary();
    fs.ensureDirSync(path.dirname(MONITOR_STORE_PATH));
    await fs.writeJson(MONITOR_STORE_PATH, summary, { spaces: 2 });
  }

  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

const instance = new AgentMonitor();
module.exports = instance;
module.exports.AgentMonitor = AgentMonitor;
module.exports.AgentExecutionSnapshot = AgentExecutionSnapshot;
module.exports.STATUS_ICONS = STATUS_ICONS;
