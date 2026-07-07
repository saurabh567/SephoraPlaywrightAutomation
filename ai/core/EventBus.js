/**
 * EventBus.js
 *
 * Enterprise event-driven architecture for the AI automation framework.
 * Upgrades the legacy AgentComm.js with full event taxonomy, history,
 * correlation tracking, and filtering.
 *
 * Architecture:
 *   - Singleton EventEmitter-based bus
 *   - Standardized event envelope: { type, timestamp, source, correlationId, payload }
 *   - Named event constants for IDE autocompletion
 *   - Subscription with optional event type filtering
 *   - Full event history with configurable retention
 *   - Correlation ID propagation across event chains
 *
 * Usage:
 *   const bus = require('./core/EventBus');
 *
 *   // Subscribe to events
 *   const unsub = bus.on('ScenarioFailed', (event) => {
 *     console.log(event.payload.scenario, event.payload.error);
 *   });
 *
 *   // Emit events
 *   bus.emit('ScenarioStarted', { scenario: 'Checkout' });
 *
 *   // One-time subscription
 *   bus.once('DashboardGenerationCompleted', () => console.log('Done'));
 *
 *   // Unsubscribe
 *   unsub();
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// ─── Event Type Constants ──────────────────────────────────────────────────
const EVENTS = {
  // ── Framework Lifecycle ──
  FRAMEWORK_STARTED:               'FrameworkStarted',
  FRAMEWORK_STOPPED:               'FrameworkStopped',
  ENVIRONMENT_READY:               'EnvironmentReady',
  ENVIRONMENT_FAILED:              'EnvironmentFailed',

  // ── AI Services ──
  OLLAMA_READY:                    'OllamaReady',
  OLLAMA_FAILED:                   'OllamaFailed',
  CHROMA_READY:                    'ChromaReady',
  CHROMA_FAILED:                   'ChromaFailed',
  VECTOR_STORE_INGESTED:           'VectorStoreIngested',

  // ── Platform Lifecycle ──
  PLATFORM_SELECTED:               'PlatformSelected',
  PLATFORM_READY:                  'PlatformReady',
  APPIUM_STARTED:                  'AppiumStarted',
  APPIUM_STOPPED:                  'AppiumStopped',
  EMULATOR_STARTED:                'EmulatorStarted',
  EMULATOR_STOPPED:                'EmulatorStopped',
  DEVICE_CONNECTED:                'DeviceConnected',
  DEVICE_DISCONNECTED:             'DeviceDisconnected',

  // ── Driver Lifecycle ──
  DRIVER_CREATED:                  'DriverCreated',
  DRIVER_READY:                    'DriverReady',
  DRIVER_FAILED:                   'DriverFailed',
  DRIVER_DESTROYED:                'DriverDestroyed',

  // ── Test Execution ──
  TEST_EXECUTION_STARTED:          'TestExecutionStarted',
  TEST_EXECUTION_COMPLETED:        'TestExecutionCompleted',
  TEST_EXECUTION_FAILED:           'TestExecutionFailed',
  SCENARIO_STARTED:                'ScenarioStarted',
  SCENARIO_PASSED:                 'ScenarioPassed',
  SCENARIO_FAILED:                 'ScenarioFailed',
  SCENARIO_SKIPPED:                'ScenarioSkipped',
  STEP_PASSED:                     'StepPassed',
  STEP_FAILED:                     'StepFailed',
  RETRY_REQUESTED:                 'RetryRequested',
  RETRY_COMPLETED:                 'RetryCompleted',
  RETRY_EXHAUSTED:                 'RetryExhausted',

  // ── Playwright CLI ──
  PLAYWRIGHT_CLI_STARTED:          'PlaywrightCLIStarted',
  PLAYWRIGHT_CLI_COMPLETED:        'PlaywrightCLICompleted',
  PLAYWRIGHT_CLI_FAILED:           'PlaywrightCLIFailed',
  PLAYWRIGHT_CLI_CONFIG_SELECTED:  'PlaywrightCLIConfigSelected',
  PLAYWRIGHT_CLI_PROFILE_APPLIED:  'PlaywrightCLIProfileApplied',

  // ── Locator Healing ──
  LOCATOR_FAILED:                  'LocatorFailed',
  HEALING_REQUESTED:               'HealingRequested',
  HEALING_COMPLETED:               'HealingCompleted',
  HEALING_APPLIED:                 'HealingApplied',
  HEALING_SKIPPED:                 'HealingSkipped',
  HEALING_ROLLED_BACK:             'HealingRolledBack',

  // ── AI Analysis ──
  ANALYSIS_STARTED:                'AnalysisStarted',
  FAILURE_ANALYSIS_COMPLETED:      'FailureAnalysisCompleted',
  ROOT_CAUSE_IDENTIFIED:           'RootCauseIdentified',
  LOCATOR_HEALING_SUGGESTED:       'LocatorHealingSuggested',
  ANOMALY_DETECTED:                'AnomalyDetected',
  IMPACT_ANALYSIS_COMPLETED:       'ImpactAnalysisCompleted',

  // ── Reporting ──
  REPORT_GENERATION_STARTED:       'ReportGenerationStarted',
  REPORT_GENERATION_COMPLETED:     'ReportGenerationCompleted',
  DASHBOARD_GENERATION_STARTED:    'DashboardGenerationStarted',
  DASHBOARD_GENERATION_COMPLETED:  'DashboardGenerationCompleted',
  PR_SUMMARY_GENERATED:            'PRSummaryGenerated',

  // ── Orchestrator Phases ──
  ORCHESTRATOR_STARTED:            'OrchestratorStarted',
  PHASE_STARTED:                   'PhaseStarted',
  PHASE_COMPLETED:                 'PhaseCompleted',
  EXECUTION_COMPLETED:             'ExecutionCompleted',
  ORCHESTRATOR_COMPLETED:          'OrchestratorCompleted',
  ORCHESTRATOR_FAILED:             'OrchestratorFailed',

  // ── CI/CD ──
  CI_PIPELINE_STARTED:             'CIPipelineStarted',
  CI_PIPELINE_COMPLETED:           'CIPipelineCompleted',
  CI_PIPELINE_FAILED:              'CIPipelineFailed',
  RELEASE_GATE_EVALUATED:          'ReleaseGateEvaluated',
  MONITORING_CHECK_COMPLETED:      'MonitoringCheckCompleted',

  // ── Agent Registry ──
  AGENT_DISCOVERED:                'AgentDiscovered',
  AGENT_REGISTRY_READY:            'AgentRegistryReady',
  AGENT_EXECUTION_STARTED:         'AgentExecutionStarted',
  AGENT_EXECUTION_COMPLETED:       'AgentExecutionCompleted',
  AGENT_EXECUTION_FAILED:          'AgentExecutionFailed',

  // ── Agent Lifecycle Events ──
  AGENT_REGISTERED:                'AgentRegistered',
  AGENT_INITIALIZED:               'AgentInitialized',
  AGENT_WAITING:                   'AgentWaiting',
  AGENT_ELIGIBLE:                  'AgentEligible',
  AGENT_STARTED:                   'AgentStarted',
  AGENT_COMPLETED:                 'AgentCompleted',
  AGENT_FAILED:                    'AgentFailed',
  AGENT_RECOVERED:                 'AgentRecovered',
  AGENT_SKIPPED:                   'AgentSkipped',
  AGENT_DISABLED:                  'AgentDisabled',

  // ── Execution Events ──
  EXECUTION_STARTED:               'ExecutionStarted',
  EXECUTION_COMPLETED:             'ExecutionCompleted',
  EXECUTION_FAILED:                'ExecutionFailed'
};

// ─── Event Bus ─────────────────────────────────────────────────────────────
class EventBus {
  constructor(options = {}) {
    this._emitter = new EventEmitter();
    this._history = [];
    this._maxHistory = options.maxHistory || 1000;
    this._correlationId = options.correlationId || null;
    this._enabled = options.enabled !== false;
    this._subscriptionCount = 0;
    this.eventTypes = EVENTS;
    this.EVENTS = EVENTS;

    // Increase max listeners to avoid warnings with many agent subscriptions
    this._emitter.setMaxListeners(100);
  }

  /**
   * Get all event type constants.
   */

  /**
   * Subscribe to an event type.
   * @param {string} eventType - Event type constant (e.g., EVENTS.SCENARIO_FAILED)
   * @param {Function} callback - Function(event) to call when event fires
   * @param {Object} [options] - { once, filter }
   * @returns {Function} Unsubscribe function
   */
  on(eventType, callback, options = {}) {
    if (!eventType || typeof callback !== 'function') {
      console.warn('[EventBus] Invalid subscription: eventType and callback required');
      return () => {};
    }

    const handler = (rawPayload) => {
      if (!this._enabled) return;

      // Normalize payload into event envelope
      const event = this._normalizeEvent(eventType, rawPayload);

      // Apply filter if provided
      if (options.filter && !options.filter(event)) return;

      try {
        callback(event);
      } catch (err) {
        console.error(`[EventBus] Error in handler for '${eventType}':`, err.message);
      }
    };

    if (options.once) {
      this._emitter.once(eventType, handler);
    } else {
      this._emitter.on(eventType, handler);
    }

    const id = ++this._subscriptionCount;

    // Return unsubscriber
    const unsubscribe = () => {
      this._emitter.off(eventType, handler);
    };

    return unsubscribe;
  }

  /**
   * Subscribe to an event exactly once.
   */
  once(eventType, callback) {
    return this.on(eventType, callback, { once: true });
  }

  /**
   * Subscribe to multiple event types.
   * @param {string[]} eventTypes - Array of event type constants
   * @param {Function} callback - Function(event) to call
   * @param {Object} [options]
   * @returns {Function} Unsubscribe function (removes all)
   */
  onAny(eventTypes, callback, options = {}) {
    const unsubs = eventTypes.map(type => this.on(type, callback, options));
    return () => unsubs.forEach(fn => fn());
  }

  /**
   * Subscribe with a payload filter.
   */
  onFiltered(eventType, callback, filterFn) {
    return this.on(eventType, callback, { filter: filterFn });
  }

  /**
   * Emit an event.
   * @param {string} eventType - Event type constant
   * @param {*} payload - Event payload (object, string, etc.)
   * @param {Object} [options] - { source, correlationId }
   */
  emit(eventType, payload = {}, options = {}) {
    if (!this._enabled) return;

    const event = this._normalizeEvent(eventType, payload, options);

    // Store in history
    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // Emit to subscribers
    this._emitter.emit(eventType, payload);

    // Also emit a wildcard catch-all for monitoring/debugging
    this._emitter.emit('*', event);
  }

  /**
   * Register a custom event type (plugin architecture).
   * Users can add custom events without modifying core EventBus.
   * @param {string} eventName - The event type name
   * @param {string} [description] - Optional description of the event
   */
  registerCustomEvent(eventName, description) {
    if (!eventName || typeof eventName !== 'string') {
      console.warn('[EventBus] Invalid custom event name');
      return false;
    }
    if (this.EVENTS[eventName]) {
      console.warn('[EventBus] Event ' + eventName + ' already exists, skipping');
      return false;
    }
    this.EVENTS[eventName] = eventName;
    if (description) {
      this._customEventDescriptions = this._customEventDescriptions || {};
      this._customEventDescriptions[eventName] = description;
    }
    return true;
  }

  /**
   * Get all custom events that have been registered.
   */
  getCustomEvents() {
    return this._customEventDescriptions || {};
  }

  /**
   * Load custom events from a plugins/custom-events/ directory.
   * Each file should export an array of { name, description } objects.
   */
  loadCustomEventsFromDir(customEventsDir) {
    const results = [];
    if (!fs.existsSync(customEventsDir)) return results;
    const files = fs.readdirSync(customEventsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const customEvents = require(path.resolve(customEventsDir, file));
        if (Array.isArray(customEvents)) {
          for (const ce of customEvents) {
            if (this.registerCustomEvent(ce.name, ce.description)) {
              results.push(ce.name);
            }
          }
        }
      } catch (e) {
        console.warn('[EventBus] Failed to load custom events from ' + file + ': ' + e.message);
      }
    }
    return results;
  }

  /**
   * Set a correlation ID for tracking event chains.
   */
  setCorrelationId(id) {
    this._correlationId = id;
  }

  /**
   * Get the current correlation ID.
   */
  getCorrelationId() {
    return this._correlationId;
  }

  /**
   * Enable/disable event processing.
   */
  setEnabled(enabled) {
    this._enabled = enabled;
  }

  /**
   * Get event history.
   * @param {Object} [options] - { eventType, limit, since }
   * @returns {Array} Filtered event history
   */
  getHistory(options = {}) {
    let events = this._history;

    if (options.eventType) {
      events = events.filter(e => e.type === options.eventType);
    }

    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Clear event history.
   */
  clearHistory() {
    this._history = [];
  }

  /**
   * Get subscriber count for an event type.
   */
  listenerCount(eventType) {
    return this._emitter.listenerCount(eventType);
  }

  /**
   * Get all event types that have subscribers.
   */
  getActiveTopics() {
    const events = this._emitter.eventNames();
    return events.filter(e => e !== '*' && this._emitter.listenerCount(e) > 0);
  }

  /**
   * Get statistics about the event bus.
   */
  getStats() {
    const activeTopics = this.getActiveTopics();
    const topicCounts = {};
    for (const topic of activeTopics) {
      topicCounts[topic] = this._emitter.listenerCount(topic);
    }

    return {
      totalEventsEmitted: this._history.length,
      activeTopics: activeTopics.length,
      topicSubscriberCounts: topicCounts,
      totalSubscriptions: this._subscriptionCount,
      correlationId: this._correlationId,
      enabled: this._enabled,
      maxHistory: this._maxHistory
    };
  }

  /**
   * Normalize a raw payload into a standard event envelope.
   */
  _normalizeEvent(eventType, rawPayload, options = {}) {
    const payload = (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload))
      ? rawPayload
      : { value: rawPayload };

    return {
      type: eventType,
      timestamp: new Date().toISOString(),
      source: options.source || process.env.SOURCE || 'orchestrator',
      correlationId: options.correlationId || this._correlationId || `corr-${Date.now()}`,
      payload
    };
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────
const instance = new EventBus();

// Legacy compatibility: keep AgentComm working
const legacyComm = {
  publish: (topic, payload) => instance.emit(topic, payload),
  subscribe: (topic, cb) => instance.on(topic, cb),
  log: (agentName, message) => console.log(`[AgentComm][${agentName}] ${message}`)
};

// Re-export legacy AgentComm for backward compatibility
module.exports = instance;
module.exports.EventBus = EventBus;
module.exports.EVENTS = EVENTS;
module.exports.AgentComm = legacyComm;
module.exports.legacy = legacyComm;
