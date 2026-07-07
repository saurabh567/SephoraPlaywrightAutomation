/**
 * AgentLifecycleManager.js
 *
 * Enterprise agent lifecycle state machine.
 * Every agent MUST register itself automatically through this manager.
 * No agent executes without lifecycle tracking.
 *
 * STATES:
 *   REGISTERED  → Agent file discovered and loaded by registry
 *   INITIALIZED → Health tracker initialized, dependencies resolved
 *   WAITING     → Agent is pending execution (in the plan)
 *   ELIGIBLE    → Agent conditions met, ready to run
 *   RUNNING     → Agent is currently executing
 *   COMPLETED   → Agent finished successfully
 *   FAILED      → Agent execution threw an error
 *   RECOVERED   → Agent was retried and succeeded after failure
 *   SKIPPED     → Agent conditions not met, not executed
 *   DISABLED    → Agent lifecycle is deprecated/placeholder
 *
 * Every state transition is timestamped and emitted via EventBus.
 * Lifecycle data persists to ai/memory/agent-lifecycle.json.
 *
 * Architecture:
 *   AgentRegistry.discover()
 *     └── AgentLifecycleManager.register(agent)         → REGISTERED
 *   AgentHealthTracker.initializeFromRegistry()
 *     └── AgentLifecycleManager.initialize(agentKey)    → INITIALIZED
 *   AgentRouter.buildPlan()
 *     └── AgentLifecycleManager.wait(agentKey)          → WAITING
 *   ConditionEvaluator.satisfies()
 *     └── AgentLifecycleManager.eligible(agentKey)      → ELIGIBLE
 *                                    / skipped          → SKIPPED
 *   UnifiedOrchestrator.executeAgents()
 *     └── AgentLifecycleManager.running(agentKey)       → RUNNING
 *                                    / completed        → COMPLETED
 *                                    / failed           → FAILED
 *                                    / recovered        → RECOVERED
 *
 * Usage:
 *   const lm = require('./core/AgentLifecycleManager');
 *   await lm.register(agentEntry);      // From AgentRegistry
 *   await lm.initialize('AgentName');   // From HealthTracker
 *   await lm.running('AgentName');      // Before execution
 *   await lm.completed('AgentName');    // On success
 */

const fs = require('fs-extra');
const path = require('path');
const EventBus = require('./EventBus');
const executionContext = require('./ExecutionContext');

// ─── Constants ─────────────────────────────────────────────────────────────

const LIFECYCLE_STORE_PATH = path.join(__dirname, '..', 'memory', 'agent-lifecycle.json');

const STATES = {
  REGISTERED:  'REGISTERED',
  INITIALIZED: 'INITIALIZED',
  WAITING:     'WAITING',
  ELIGIBLE:    'ELIGIBLE',
  RUNNING:     'RUNNING',
  COMPLETED:   'COMPLETED',
  FAILED:      'FAILED',
  RECOVERED:   'RECOVERED',
  SKIPPED:     'SKIPPED',
  DISABLED:    'DISABLED'
};

const VALID_TRANSITIONS = {
  [STATES.REGISTERED]:  [STATES.INITIALIZED, STATES.DISABLED],
  [STATES.INITIALIZED]: [STATES.WAITING, STATES.SKIPPED, STATES.DISABLED],
  [STATES.WAITING]:     [STATES.ELIGIBLE, STATES.SKIPPED, STATES.DISABLED],
  [STATES.ELIGIBLE]:    [STATES.RUNNING, STATES.SKIPPED, STATES.DISABLED],
  [STATES.RUNNING]:     [STATES.COMPLETED, STATES.FAILED, STATES.RECOVERED, STATES.DISABLED],
  [STATES.FAILED]:      [STATES.RECOVERED, STATES.RUNNING, STATES.DISABLED],
  [STATES.RECOVERED]:   [STATES.COMPLETED, STATES.RUNNING, STATES.DISABLED],
  [STATES.COMPLETED]:   [STATES.WAITING, STATES.DISABLED],
  [STATES.SKIPPED]:     [STATES.WAITING, STATES.DISABLED],
  [STATES.DISABLED]:    [STATES.REGISTERED]
};

// ─── Standardized Skip Reasons ─────────────────────────────────────────────
// Every skipped agent MUST include one of these reasons.
const SKIP_REASONS = {
  PLATFORM_MISMATCH:          'Platform mismatch',
  NO_FAILED_TESTS:            'No failed tests',
  NO_MOBILE_EXECUTION:        'No mobile execution',
  NO_API_EXECUTION:           'No API execution',
  NO_LOCATOR_FAILURES:        'No locator failures',
  MANUAL_TRIGGER_REQUIRED:    'Manual trigger required',
  FEATURE_DISABLED:           'Feature disabled',
  NO_EXECUTION_DATA:          'No execution data available',
  CONDITION_NOT_MET:          'Condition not met',
  LIFECYCLE_DEPRECATED:       'Agent lifecycle deprecated',
  LIFECYCLE_PLACEHOLDER:      'Agent is a placeholder',
  NO_RUN_METHOD:              'Agent has no run() method',
  STAGE_SKIPPED:              'Execution stage skipped',
  DEPENDENCY_FAILED:          'Dependency agent failed',
  PHASE_COMPLETED:            'Phase completed without execution',
  USER_CANCELLED:             'Cancelled by user',
  TIMEOUT:                    'Agent execution timed out',
  RESOURCE_EXHAUSTED:         'Insufficient resources',
  UNKNOWN:                    'Unknown reason'
};

// ─── Agent Lifecycle Entry ─────────────────────────────────────────────────

class AgentLifecycleEntry {
  constructor(key, metadata = {}) {
    this.key = key;
    this.name = metadata.name || key;
    this.stage = metadata.executionStage || 'unknown';
    this.priority = metadata.priority || 50;
    this.dependencies = metadata.dependencies || [];
    this.platforms = metadata.platforms || [];
    this.tags = metadata.tags || [];
    this.lifecycle = metadata.lifecycle || 'active';
    this.version = metadata.version || '1.0.0';
    this.description = metadata.description || '';

    // State machine
    this.state = STATES.REGISTERED;
    this.previousState = null;
    this.stateHistory = [];

    // Timestamps
    this.registeredAt = new Date().toISOString();
    this.initializedAt = null;
    this.lastWaitingAt = null;
    this.lastEligibleAt = null;
    this.lastRunningAt = null;
    this.lastCompletedAt = null;
    this.lastFailedAt = null;
    this.lastRecoveredAt = null;
    this.lastSkippedAt = null;
    this.disabledAt = null;

    // Execution metrics
    this.totalRuns = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.skipCount = 0;
    this.recoveryCount = 0;
    this.consecutiveFailures = 0;
    this.lastDuration = 0;
    this.lastError = null;
    this.skipReason = null;

    // Health
    this.health = 'unknown';
    this.successRate = 0;

    // Execution context at time of run
    this.lastExecutionContext = null;

    // Orchestration metadata
    this.executionId = null;
    this.phaseId = null;
  }

  /**
   * Record a state transition with timestamp.
   */
  transitionTo(newState, timestamp) {
    const ts = timestamp || new Date().toISOString();
    this.previousState = this.state;
    this.state = newState;

    this.stateHistory.push({
      from: this.previousState,
      reason: newState === STATES.SKIPPED ? this.skipReason || null : null,
      to: newState,
      at: ts
    });

    // Update specific timestamps
    switch (newState) {
      case STATES.INITIALIZED: this.initializedAt = ts; break;
      case STATES.WAITING: this.lastWaitingAt = ts; break;
      case STATES.ELIGIBLE: this.lastEligibleAt = ts; break;
      case STATES.RUNNING: this.lastRunningAt = ts; break;
      case STATES.COMPLETED: this.lastCompletedAt = ts; break;
      case STATES.FAILED: this.lastFailedAt = ts; break;
      case STATES.RECOVERED: this.lastRecoveredAt = ts; break;
      case STATES.SKIPPED: this.lastSkippedAt = ts; break;
      case STATES.DISABLED: this.disabledAt = ts; break;
    }
  }

  /**
   * Serialize for persistence.
   */
  toJSON() {
    return {
      key: this.key,
      name: this.name,
      stage: this.stage,
      priority: this.priority,
      dependencies: this.dependencies,
      platforms: this.platforms,
      tags: this.tags,
      lifecycle: this.lifecycle,
      version: this.version,
      description: this.description,
      state: this.state,
      previousState: this.previousState,
      stateHistory: this.stateHistory.slice(-100), // Keep last 100 transitions
      registeredAt: this.registeredAt,
      initializedAt: this.initializedAt,
      lastWaitingAt: this.lastWaitingAt,
      lastEligibleAt: this.lastEligibleAt,
      lastRunningAt: this.lastRunningAt,
      lastCompletedAt: this.lastCompletedAt,
      lastFailedAt: this.lastFailedAt,
      lastRecoveredAt: this.lastRecoveredAt,
      lastSkippedAt: this.lastSkippedAt,
      disabledAt: this.disabledAt,
      totalRuns: this.totalRuns,
      successCount: this.successCount,
      failureCount: this.failureCount,
      skipCount: this.skipCount,
      recoveryCount: this.recoveryCount,
      consecutiveFailures: this.consecutiveFailures,
      lastDuration: this.lastDuration,
      lastError: this.lastError,
      skipReason: this.skipReason,
      health: this.health,
      successRate: this.successRate,
      executionId: this.executionId,
      phaseId: this.phaseId
    };
  }
}

// ─── Agent Lifecycle Manager ───────────────────────────────────────────────

class AgentLifecycleManager {
  constructor() {
    this._agents = new Map();  // key → AgentLifecycleEntry
    this._storePath = LIFECYCLE_STORE_PATH;
    this._loaded = false;
    this._eventBus = EventBus;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      REGISTRATION                                ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Register an agent from AgentRegistry.
   * Every discovered agent MUST go through this method.
   * Transition: → REGISTERED
   *
   * @param {Object} agentEntry - Agent entry from AgentRegistry
   * @returns {AgentLifecycleEntry}
   */
  register(agentEntry) {
    const key = agentEntry.key;

    if (this._agents.has(key)) {
      const existing = this._agents.get(key);
      // Update metadata but preserve state
      existing.name = agentEntry.metadata.name || key;
      existing.stage = agentEntry.metadata.executionStage || existing.stage;
      existing.priority = agentEntry.metadata.priority || existing.priority;
      existing.dependencies = agentEntry.metadata.dependencies || existing.dependencies;
      existing.platforms = agentEntry.metadata.platforms || existing.platforms;
      existing.tags = agentEntry.metadata.tags || existing.tags;
      existing.lifecycle = agentEntry.metadata.lifecycle || existing.lifecycle;
      existing.version = agentEntry.metadata.version || existing.version;
      existing.description = agentEntry.metadata.description || existing.description;
      return existing;
    }

    const entry = new AgentLifecycleEntry(key, agentEntry.metadata);

    // If lifecycle is deprecated/placeholder, mark as DISABLED immediately
    if (entry.lifecycle === 'deprecated' || entry.lifecycle === 'placeholder') {
      entry.transitionTo(STATES.DISABLED);
      this._emitEvent(entry, STATES.DISABLED);
    } else {
      this._emitEvent(entry, STATES.REGISTERED);
    }

    this._agents.set(key, entry);
    this._persist();

    return entry;
  }

  /**
   * Batch-register all agents from registry after discovery.
   * Call this once after AgentRegistry.discover().
   *
   * @param {Array} allAgents - Array of agent entries from registry.getAll()
   * @returns {number} Count of registered agents
   */
  registerAll(allAgents) {
    let count = 0;
    for (const agent of allAgents) {
      this.register(agent);
      count++;
    }
    this._persist();
    return count;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      STATE TRANSITIONS                           ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Transition an agent to INITIALIZED.
   * Called by AgentHealthTracker when health records are initialized.
   * Transition: REGISTERED → INITIALIZED
   */
  initialize(agentKey) {
    return this._transition(agentKey, STATES.INITIALIZED);
  }

  /**
   * Transition an agent to WAITING.
   * Called when agent is added to the execution plan by AgentRouter.
   * Transition: INITIALIZED → WAITING
   */
  wait(agentKey) {
    return this._transition(agentKey, STATES.WAITING);
  }

  /**
   * Transition an agent to ELIGIBLE.
   * Called when agent conditions are evaluated and met.
   * Transition: WAITING → ELIGIBLE
   */
  eligible(agentKey) {
    return this._transition(agentKey, STATES.ELIGIBLE);
  }

  /**
   * Transition an agent to RUNNING.
   * Called just before agent.run() is invoked by the orchestrator.
   * Transition: ELIGIBLE → RUNNING
   */
  running(agentKey, phaseId) {
    const entry = this._transition(agentKey, STATES.RUNNING);
    if (entry) {
      entry.phaseId = phaseId || null;
      entry.executionId = executionContext.executionId || null;
      entry.totalRuns = (entry.totalRuns || 0) + 1;
      this._persist();
    }
    return entry;
  }

  /**
   * Transition an agent to COMPLETED.
   * Called when agent.run() succeeds.
   * Transition: RUNNING → COMPLETED
   */
  completed(agentKey, result = {}) {
    const entry = this._transition(agentKey, STATES.COMPLETED);
    if (entry) {
      entry.successCount = (entry.successCount || 0) + 1;
      entry.consecutiveFailures = 0;
      entry.lastDuration = result.duration || 0;
      this._updateHealth(entry);
      this._persist();
    }
    return entry;
  }

  /**
   * Transition an agent to FAILED.
   * Called when agent.run() throws an error.
   * Transition: RUNNING → FAILED
   */
  failed(agentKey, error) {
    const entry = this._transition(agentKey, STATES.FAILED);
    if (entry) {
      entry.failureCount = (entry.failureCount || 0) + 1;
      entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
      entry.lastError = error ? (error.message || String(error)).slice(0, 500) : 'Unknown error';
      entry.lastDuration = 0;
      this._updateHealth(entry);
      this._persist();
    }
    return entry;
  }

  /**
   * Transition an agent to RECOVERED.
   * Called when a retry succeeds after a failure.
   * Transition: FAILED → RECOVERED
   */
  recovered(agentKey, result = {}) {
    const entry = this._transition(agentKey, STATES.RECOVERED);
    if (entry) {
      entry.recoveryCount = (entry.recoveryCount || 0) + 1;
      entry.consecutiveFailures = 0;
      entry.lastDuration = result.duration || 0;
      entry.lastError = null;
      this._updateHealth(entry);
      this._persist();
    }
    return entry;
  }

  /**
   * Transition an agent to SKIPPED.
   * Called when agent conditions are not met or platform doesn't match.
   * Transition: any → SKIPPED
   */
  skipped(agentKey, reason) {
    if (!reason) {
      console.warn('[AgentLifecycleManager] Agent "' + agentKey + '" skipped WITHOUT a reason! Using UNKNOWN.');
      reason = SKIP_REASONS.UNKNOWN;
    }
    // Set skipReason BEFORE _transition so transitionTo() captures it in stateHistory
    const entry = this._agents.get(agentKey);
    if (entry) {
      entry.skipReason = reason;
    }
    const result = this._transition(agentKey, STATES.SKIPPED);
    if (result) {
      result.skipCount = (result.skipCount || 0) + 1;
      result.lastError = reason;
      console.log('  [SKIP] ' + agentKey + ' → ' + reason);
      this._persist();
    }
    return result;
  }

  /**
   * Transition an agent to DISABLED.
   * Called when agent lifecycle changes to deprecated/placeholder.
   * Transition: any → DISABLED
   */
  disable(agentKey, reason) {
    const entry = this._transition(agentKey, STATES.DISABLED);
    if (entry) {
      entry.lastError = reason || 'Lifecycle disabled';
      entry.health = 'disabled';
      this._persist();
    }
    return entry;
  }

  /**
   * Mark all WAITING agents as SKIPPED (e.g., when phase completes without executing them).
   */
  skipAllWaiting(reason) {
    const skipped = [];
    for (const [key, entry] of this._agents) {
      if (entry.state === STATES.WAITING || entry.state === STATES.ELIGIBLE) {
        this.skipped(key, reason || 'Phase completed without execution');
        skipped.push(key);
      }
    }
    return skipped;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      QUERIES                                     ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Get lifecycle entry for an agent.
   */
  get(agentKey) {
    return this._agents.get(agentKey) || null;
  }

  /**
   * Get all lifecycle entries.
   */
  getAll() {
    return Array.from(this._agents.values());
  }

  /**
   * Get agents by current state.
   */
  getByState(state) {
    return this.getAll().filter(e => e.state === state);
  }

  /**
   * Get agents by health status.
   */
  getByHealth(health) {
    return this.getAll().filter(e => e.health === health);
  }

  /**
   * Get agents by execution stage.
   */
  getByStage(stage) {
    return this.getAll().filter(e => e.stage === stage);
  }

  /**
   * Get count of agents in each state.
   */
  getStateCounts() {
    const counts = {};
    for (const state of Object.values(STATES)) {
      counts[state] = 0;
    }
    for (const [, entry] of this._agents) {
      counts[entry.state] = (counts[entry.state] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get lifecycle summary / dashboard data.
   */
  getSummary() {
    const all = this.getAll();
    const stateCounts = this.getStateCounts();
    const byHealth = {};
    let totalRuns = 0;
    let totalSuccess = 0;
    let totalFailures = 0;

    for (const entry of all) {
      byHealth[entry.health] = (byHealth[entry.health] || 0) + 1;
      totalRuns += entry.totalRuns || 0;
      totalSuccess += entry.successCount || 0;
      totalFailures += entry.failureCount || 0;
    }

    return {
      totalAgents: all.length,
      stateCounts,
      healthBreakdown: byHealth,
      totalRuns,
      totalSuccess,
      totalFailures,
      overallSuccessRate: totalRuns > 0 ? Math.round((totalSuccess / (totalSuccess + totalFailures)) * 100) : 0,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Find agents that are potentially stuck (RUNNING for too long).
   * @param {number} thresholdMs - Time in ms after which RUNNING is considered stuck
   */
  getStuckAgents(thresholdMs = 300000) {
    const stuck = [];
    const now = Date.now();
    for (const [, entry] of this._agents) {
      if (entry.state === STATES.RUNNING && entry.lastRunningAt) {
        const elapsed = now - new Date(entry.lastRunningAt).getTime();
        if (elapsed > thresholdMs) {
          stuck.push({ key: entry.key, name: entry.name, runningSince: entry.lastRunningAt, elapsedMs: elapsed });
        }
      }
    }
    return stuck;
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      PERSISTENCE                                 ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Load lifecycle data from persistent store.
   */
  load() {
    if (!fs.existsSync(this._storePath)) return;
    try {
      const data = fs.readJsonSync(this._storePath);
      if (data.agents) {
        for (const [key, entryData] of Object.entries(data.agents)) {
          const entry = Object.assign(new AgentLifecycleEntry(key), entryData);
          this._agents.set(key, entry);
        }
      }
      this._loaded = true;
    } catch (e) {
      console.warn('[AgentLifecycleManager] Failed to load lifecycle data:', e.message);
    }
  }

  /**
   * Initialize all agents from AgentRegistry.
   * Call once after registry.discover().
   * This ensures every agent is registered in the lifecycle manager.
   *
   * @param {Object} registry - AgentRegistry instance
   * @returns {number} Number of registered agents
   */
  async initializeFromRegistry(registry) {
    // Load any existing lifecycle data
    this.load();

    // Discover and register all agents
    const count = await registry.discover();
    const allAgents = registry.getAll();
    this.registerAll(allAgents);

    // Enrich with health tracker data if available
    try {
      const healthTracker = require('./AgentHealthTracker');
      await healthTracker.initializeFromRegistry(registry);
    } catch (e) {
      // Health tracker may not be available
    }

    console.log(`[AgentLifecycleManager] Registered ${count} agents from registry`);
    return count;
  }

  /**
   * Reset all lifecycle data for a fresh execution.
   */
  reset() {
    for (const [, entry] of this._agents) {
      // Preserve agent metadata but reset state
      entry.state = STATES.REGISTERED;
      entry.previousState = null;
      entry.stateHistory = [];
      entry.lastWaitingAt = null;
      entry.lastEligibleAt = null;
      entry.lastRunningAt = null;
      entry.lastCompletedAt = null;
      entry.lastFailedAt = null;
      entry.lastRecoveredAt = null;
      entry.lastSkippedAt = null;
      entry.disabledAt = null;
      entry.phaseId = null;
      entry.executionId = null;
    }
    this._persist();
  }

  // ╔════════════════════════════════════════════════════════════════════╗
  // ║                      INTERNAL HELPERS                            ║
  // ╚════════════════════════════════════════════════════════════════════╝

  /**
   * Core state transition logic.
   * Validates the transition, updates state, timestamps, emits events, persists.
   */
  _transition(agentKey, newState) {
    const entry = this._agents.get(agentKey);
    if (!entry) {
      console.warn(`[AgentLifecycleManager] Agent "${agentKey}" not registered`);
      return null;
    }

    // If already DISABLED, only allow transition to REGISTERED
    if (entry.state === STATES.DISABLED && newState !== STATES.REGISTERED) {
      return null;
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[entry.state];
    if (allowed && !allowed.includes(newState)) {
      console.warn(`[AgentLifecycleManager] Invalid transition: ${entry.key} ${entry.state} → ${newState}`);
      console.warn(`  Allowed from ${entry.state}: ${allowed.join(', ')}`);
      return null;
    }

    // Record transition
    const timestamp = new Date().toISOString();
    entry.transitionTo(newState, timestamp);

    // Emit event
    this._emitEvent(entry, newState);

    return entry;
  }

  /**
   * Update health score based on execution metrics.
   */
  _updateHealth(entry) {
    const total = entry.successCount + entry.failureCount;
    entry.successRate = total > 0 ? Math.round((entry.successCount / total) * 100) : 0;

    if (entry.consecutiveFailures >= 3) {
      entry.health = 'critical';
    } else if (entry.consecutiveFailures >= 1) {
      entry.health = 'degraded';
    } else if (entry.totalRuns === 0) {
      entry.health = 'unknown';
    } else {
      entry.health = 'healthy';
    }
  }

  /**
   * Emit lifecycle event to EventBus.
   */
  _emitEvent(entry, state) {
    try {
      // Map lifecycle states to EventBus named constants
      const eventMap = {
        REGISTERED:  this._eventBus.EVENTS.AGENT_REGISTERED,
        INITIALIZED: this._eventBus.EVENTS.AGENT_INITIALIZED,
        WAITING:     this._eventBus.EVENTS.AGENT_WAITING,
        ELIGIBLE:    this._eventBus.EVENTS.AGENT_ELIGIBLE,
        RUNNING:     this._eventBus.EVENTS.AGENT_STARTED,
        COMPLETED:   this._eventBus.EVENTS.AGENT_COMPLETED,
        FAILED:      this._eventBus.EVENTS.AGENT_FAILED,
        RECOVERED:   this._eventBus.EVENTS.AGENT_RECOVERED,
        SKIPPED:     this._eventBus.EVENTS.AGENT_SKIPPED,
        DISABLED:    this._eventBus.EVENTS.AGENT_DISABLED
      };

      const eventType = eventMap[state] || 'AgentLifecycle' + state;
      const payload = {
        agent: entry.key,
        name: entry.name,
        state: state,
        previousState: entry.previousState,
        timestamp: new Date().toISOString(),
        executionId: executionContext.executionId || entry.executionId,
        phaseId: entry.phaseId,
        stage: entry.stage,
        totalRuns: entry.totalRuns,
        successRate: entry.successRate,
        health: entry.health,
        skipReason: state === 'SKIPPED' ? (entry.skipReason || entry.lastError) : null,
      };

      // Emit using named constant (primary)
      this._eventBus.emit(eventType, payload);

      // Also emit legacy 'AgentLifecycle{STATE}' for backward compatibility
      this._eventBus.emit('AgentLifecycle' + state, payload);
    } catch (e) {
      // EventBus may not be available during early bootstrap
    }
  }

  /**
   * Persist lifecycle data to disk.
   */
  _persist() {
    try {
      const data = {
        updatedAt: new Date().toISOString(),
        executionId: executionContext.executionId || null,
        agents: {}
      };
      for (const [key, entry] of this._agents) {
        data.agents[key] = entry.toJSON();
      }
      fs.ensureDirSync(path.dirname(this._storePath));
      fs.writeJsonSync(this._storePath, data, { spaces: 2 });
    } catch (e) {
      console.warn('[AgentLifecycleManager] Persist failed:', e.message);
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new AgentLifecycleManager();

module.exports = instance;
module.exports.AgentLifecycleManager = AgentLifecycleManager;
module.exports.STATES = STATES;
module.exports.AgentLifecycleEntry = AgentLifecycleEntry;
module.exports.SKIP_REASONS = SKIP_REASONS;
