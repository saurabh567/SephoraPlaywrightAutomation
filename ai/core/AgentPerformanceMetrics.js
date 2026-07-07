/**
 * AgentPerformanceMetrics.js
 *
 * Enterprise agent performance measurement and persistence system.
 *
 * Measures per agent:
 *   Execution Time, Average Time, Memory Usage, Peak Memory,
 *   CPU, Failures, Retries, Success Rate, Skipped %, Recovery %,
 *   Mean Execution Time, Historical Trend
 *
 * Persists individual agent metric files under:
 *   ai/memory/agent-health/{agent-key}.json
 *
 * Each file contains a time-series history of every execution,
 * enabling trend analysis, anomaly detection, and capacity planning.
 *
 * Architecture:
 *   AgentLifecycleManager ──► records state transitions + durations
 *         │
 *         ▼
 *   AgentPerformanceMetrics ──► reads lifecycle + health data
 *         │                      adds CPU/memory/trend measurements
 *         ▼
 *   ai/memory/agent-health/*.json  (per-agent historical files)
 *
 * Usage:
 *   const metrics = require('./core/AgentPerformanceMetrics');
 *   await metrics.record('TestExecutionAgent', { duration: 1500, memory: 128 });
 *   const report = metrics.getReport('TestExecutionAgent');
 *   const summary = metrics.getSummary();
 *   const trends = metrics.getTrend('TestExecutionAgent', 10);
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const EventBus = require('./EventBus');
const executionContext = require('./ExecutionContext');

// ─── Constants ─────────────────────────────────────────────────────────────

const HEALTH_DIR = path.join(__dirname, '..', 'memory', 'agent-health');
const HISTORY_FILE = path.join(HEALTH_DIR, '_history.json');
const MAX_HISTORY_PER_AGENT = 100;

// ─── Agent Performance Entry ───────────────────────────────────────────────

class AgentPerformanceEntry {
  constructor(agentKey) {
    this.agentKey = agentKey;
    this.executions = [];       // Array of execution records (time series)
    this.summary = {
      totalExecutions: 0,
      totalDuration: 0,
      meanDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      totalMemory: 0,
      meanMemory: 0,
      peakMemory: 0,
      totalCPU: 0,
      meanCPU: 0,
      failures: 0,
      retries: 0,
      successes: 0,
      skips: 0,
      recoveries: 0,
      successRate: 0,
      skipRate: 0,
      recoveryRate: 0,
      lastExecution: null,
      lastDuration: 0,
      lastMemory: 0,
      lastCPU: 0,
      trend: 'stable'           // improving | degrading | stable | insufficient-data
    };
  }

  /**
   * Add an execution record.
   */
  addExecution(record) {
    const entry = {
      timestamp: record.timestamp || new Date().toISOString(),
      duration: record.duration || 0,
      memory: record.memory || 0,
      peakMemory: record.peakMemory || record.memory || 0,
      cpu: record.cpu || 0,
      status: record.status || 'completed',  // completed | failed | skipped | recovered
      retries: record.retries || 0,
      error: record.error || null,
      executionId: record.executionId || executionContext.executionId || null,
      phaseId: record.phaseId || null,
      platform: record.platform || executionContext.platform || null
    };

    this.executions.push(entry);
    if (this.executions.length > MAX_HISTORY_PER_AGENT) {
      this.executions.shift();
    }

    this._recomputeSummary();
    return entry;
  }

  /**
   * Recompute summary statistics from execution history.
   */
  _recomputeSummary() {
    const ex = this.executions;
    const len = ex.length;
    if (len === 0) return;

    this.summary.totalExecutions = len;
    this.summary.totalDuration = ex.reduce((s, e) => s + e.duration, 0);
    this.summary.meanDuration = Math.round(this.summary.totalDuration / len);
    this.summary.minDuration = Math.min(...ex.map(e => e.duration));
    this.summary.maxDuration = Math.max(...ex.map(e => e.duration));

    this.summary.totalMemory = ex.reduce((s, e) => s + (e.memory || 0), 0);
    this.summary.meanMemory = len > 0 ? Math.round(this.summary.totalMemory / len) : 0;
    this.summary.peakMemory = Math.max(...ex.map(e => e.peakMemory || e.memory || 0));

    this.summary.totalCPU = ex.reduce((s, e) => s + (e.cpu || 0), 0);
    this.summary.meanCPU = len > 0 ? Math.round((this.summary.totalCPU / len) * 100) / 100 : 0;

    this.summary.failures = ex.filter(e => e.status === 'failed').length;
    this.summary.successes = ex.filter(e => e.status === 'completed').length;
    this.summary.skips = ex.filter(e => e.status === 'skipped').length;
    this.summary.recoveries = ex.filter(e => e.status === 'recovered').length;
    this.summary.retries = ex.reduce((s, e) => s + (e.retries || 0), 0);

    const total = this.summary.successes + this.summary.failures;
    this.summary.successRate = total > 0 ? Math.round((this.summary.successes / total) * 100) : 0;
    this.summary.skipRate = len > 0 ? Math.round((this.summary.skips / len) * 100) : 0;
    this.summary.recoveryRate = this.summary.failures > 0
      ? Math.round((this.summary.recoveries / this.summary.failures) * 100)
      : 0;

    const last = ex[len - 1];
    this.summary.lastExecution = last.timestamp;
    this.summary.lastDuration = last.duration;
    this.summary.lastMemory = last.memory;
    this.summary.lastCPU = last.cpu;

    // Trend analysis: compare recent vs old performance
    this.summary.trend = this._calculateTrend(ex);
  }

  /**
   * Calculate performance trend by comparing recent vs older executions.
   */
  _calculateTrend(ex) {
    if (ex.length < 3) return 'insufficient-data';

    const half = Math.floor(ex.length / 2);
    const recent = ex.slice(half);
    const older = ex.slice(0, half);

    const recentAvg = recent.reduce((s, e) => s + e.duration, 0) / recent.length;
    const olderAvg = older.reduce((s, e) => s + e.duration, 0) / older.length;

    // Also check failure rate trend
    const recentFailures = recent.filter(e => e.status === 'failed').length;
    const olderFailures = older.filter(e => e.status === 'failed').length;
    const recentFailRate = recentFailures / recent.length;
    const olderFailRate = olderFailures / older.length;

    if (recentAvg < olderAvg * 0.9 && recentFailRate <= olderFailRate) {
      return 'improving';
    } else if (recentAvg > olderAvg * 1.1 || recentFailRate > olderFailRate * 1.5) {
      return 'degrading';
    }
    return 'stable';
  }

  toJSON() {
    return {
      agentKey: this.agentKey,
      summary: this.summary,
      executions: this.executions.slice(-50) // Last 50 for storage efficiency
    };
  }
}

// ─── Agent Performance Metrics Manager ─────────────────────────────────────

class AgentPerformanceMetrics {
  constructor() {
    this._cache = new Map();    // agentKey → AgentPerformanceEntry
    this._loaded = false;
  }

  /**
   * Initialize: ensure directory exists, load any existing data.
   */
  async initialize() {
    fs.ensureDirSync(HEALTH_DIR);
    await this._loadAll();
    this._loaded = true;
    console.log(`[AgentPerformanceMetrics] Initialized (${HEALTH_DIR})`);
    return this;
  }

  /**
   * Record an agent execution with performance data.
   *
   * @param {string} agentKey - Agent identifier
   * @param {Object} data
   * @param {number}  [data.duration]   - Execution duration in ms
   * @param {number}  [data.memory]     - Memory usage in MB
   * @param {number}  [data.peakMemory] - Peak memory in MB
   * @param {number}  [data.cpu]        - CPU usage percentage (0-100)
   * @param {string}  [data.status]     - completed | failed | skipped | recovered
   * @param {number}  [data.retries]    - Number of retries
   * @param {string}  [data.error]      - Error message if failed
   * @param {string}  [data.timestamp]  - ISO timestamp
   * @param {string}  [data.phaseId]    - Orchestrator phase ID
   * @param {string}  [data.platform]   - Execution platform
   * @returns {AgentPerformanceEntry}
   */
  async record(agentKey, data = {}) {
    if (!this._loaded) await this.initialize();

    let entry = this._cache.get(agentKey);
    if (!entry) {
      entry = new AgentPerformanceEntry(agentKey);
      this._cache.set(agentKey, entry);
    }

    // Auto-measure system metrics if not provided
    const record = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
      memory: data.memory || this._getMemoryMB(),
      peakMemory: data.peakMemory || data.memory || this._getMemoryMB(),
      cpu: data.cpu || this._getCPUPercent(),
      executionId: data.executionId || executionContext.executionId || null,
      platform: data.platform || executionContext.platform || null
    };

    entry.addExecution(record);
    this._save(agentKey, entry);

    // Emit performance metric event
    try {
      EventBus.emit('AgentPerformanceRecorded', {
        agent: agentKey,
        duration: record.duration,
        memory: record.memory,
        cpu: record.cpu,
        status: record.status,
        trend: entry.summary.trend
      });
    } catch (e) {}

    return entry;
  }

  /**
   * Get the full performance report for an agent.
   * @param {string} agentKey
   * @returns {Object|null}
   */
  getReport(agentKey) {
    const entry = this._cache.get(agentKey);
    if (!entry) return null;
    return entry.toJSON();
  }

  /**
   * Get performance summary for all agents.
   * @returns {Object}
   */
  getSummary() {
    const all = Array.from(this._cache.values());
    const byTrend = {};
    let totalDuration = 0;
    let totalMemory = 0;
    let totalFailures = 0;

    for (const entry of all) {
      const trend = entry.summary.trend || 'unknown';
      byTrend[trend] = (byTrend[trend] || 0) + 1;
      totalDuration += entry.summary.totalDuration;
      totalMemory += entry.summary.totalMemory;
      totalFailures += entry.summary.failures;
    }

    return {
      totalAgents: all.length,
      totalExecutions: all.reduce((s, e) => s + e.summary.totalExecutions, 0),
      totalDuration: totalDuration,
      totalDurationFormatted: this._formatDuration(totalDuration),
      totalMemoryMB: Math.round(totalMemory),
      totalFailures,
      overallSuccessRate: all.length > 0
        ? Math.round(all.reduce((s, e) => s + e.summary.successRate, 0) / all.length)
        : 0,
      trendDistribution: byTrend,
      agents: all.map(e => ({
        key: e.agentKey,
        totalExecutions: e.summary.totalExecutions,
        meanDuration: e.summary.meanDuration,
        successRate: e.summary.successRate,
        skipRate: e.summary.skipRate,
        recoveryRate: e.summary.recoveryRate,
        peakMemory: e.summary.peakMemory,
        trend: e.summary.trend,
        lastExecution: e.summary.lastExecution
      }))
    };
  }

  /**
   * Get historical trend data for an agent.
   * @param {string} agentKey
   * @param {number} [limit=20] - Number of recent records
   * @returns {Array}
   */
  getTrend(agentKey, limit = 20) {
    const entry = this._cache.get(agentKey);
    if (!entry) return [];
    return entry.executions.slice(-limit).map(e => ({
      timestamp: e.timestamp,
      duration: e.duration,
      memory: e.memory,
      cpu: e.cpu,
      status: e.status
    }));
  }

  /**
   * Get agents sorted by a metric.
   * @param {string} metric - 'duration' | 'memory' | 'failures' | 'successRate'
   * @param {number} [limit=10]
   * @returns {Array}
   */
  getTopByMetric(metric, limit = 10) {
    const all = Array.from(this._cache.values());
    const sorted = all.sort((a, b) => {
      switch (metric) {
        case 'duration': return b.summary.meanDuration - a.summary.meanDuration;
        case 'memory': return b.summary.peakMemory - a.summary.peakMemory;
        case 'failures': return b.summary.failures - a.summary.failures;
        case 'successRate': return b.summary.successRate - a.summary.successRate;
        default: return 0;
      }
    });
    return sorted.slice(0, limit).map(e => ({
      key: e.agentKey,
      value: e.summary[metric === 'duration' ? 'meanDuration' :
                       metric === 'memory' ? 'peakMemory' :
                       metric === 'failures' ? 'failures' : 'successRate'],
      trend: e.summary.trend
    }));
  }

  /**
   * Get agents whose performance is degrading.
   * @returns {Array}
   */
  getDegradingAgents() {
    return Array.from(this._cache.values())
      .filter(e => e.summary.trend === 'degrading')
      .map(e => ({
        key: e.agentKey,
        meanDuration: e.summary.meanDuration,
        successRate: e.summary.successRate,
        lastExecution: e.summary.lastExecution
      }));
  }

  /**
   * Synchronize with AgentLifecycleManager data.
   * Call after a full orchestration run to ensure metrics are up to date.
   */
  async syncFromLifecycle(lifecycleManager) {
    const allEntries = lifecycleManager.getAll();
    let count = 0;

    for (const entry of allEntries) {
      const record = {
        duration: entry.lastDuration || 0,
        status: this._mapStateToStatus(entry.state),
        retries: entry.totalRuns > 1 ? entry.totalRuns - 1 : 0,
        error: entry.lastError || null,
        timestamp: entry.lastCompletedAt || entry.lastFailedAt || entry.lastSkippedAt || undefined,
        phaseId: entry.phaseId || undefined,
        platform: executionContext.platform || undefined
      };

      if (record.duration > 0 || record.status !== 'never') {
        await this.record(entry.key, record);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[AgentPerformanceMetrics] Synced ${count} agents from lifecycle`);
    }
    return count;
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║                     PERSISTENCE                                        ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  /**
   * Save a single agent's metrics to its own file.
   */
  _save(agentKey, entry) {
    try {
      const filePath = path.join(HEALTH_DIR, `${agentKey}.json`);
      fs.writeJsonSync(filePath, entry.toJSON(), { spaces: 2 });
    } catch (e) {
      console.warn(`[AgentPerformanceMetrics] Save failed for ${agentKey}: ${e.message}`);
    }
  }

  /**
   * Load all agent metric files from the health directory.
   */
  async _loadAll() {
    if (!fs.existsSync(HEALTH_DIR)) {
      fs.ensureDirSync(HEALTH_DIR);
      return;
    }

    const files = fs.readdirSync(HEALTH_DIR)
      .filter(f => f.endsWith('.json') && f !== '_history.json' && f !== 'agent-health.json');

    for (const file of files) {
      try {
        const filePath = path.join(HEALTH_DIR, file);
        const data = fs.readJsonSync(filePath);
        const entry = new AgentPerformanceEntry(data.agentKey);
        if (data.executions) {
          for (const exec of data.executions) {
            entry.executions.push(exec);
          }
          entry._recomputeSummary();
        }
        this._cache.set(data.agentKey, entry);
      } catch (e) {
        console.warn(`[AgentPerformanceMetrics] Load failed for ${file}: ${e.message}`);
      }
    }

    console.log(`[AgentPerformanceMetrics] Loaded ${this._cache.size} agent metric files`);
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║                     SYSTEM METRICS HELPERS                             ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  /**
   * Get current memory usage in MB.
   */
  _getMemoryMB() {
    try {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024);
    } catch {
      return 0;
    }
  }

  /**
   * Get current CPU load percentage (approximate).
   */
  _getCPUPercent() {
    try {
      const cpus = os.cpus();
      const total = cpus.reduce((acc, cpu) => {
        const times = cpu.times;
        return acc + times.user + times.nice + times.sys + times.idle + times.irq;
      }, 0);
      const idle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      return Math.round(((total - idle) / total) * 100);
    } catch {
      return 0;
    }
  }

  /**
   * Map lifecycle state to performance status.
   */
  _mapStateToStatus(state) {
    switch (state) {
      case 'COMPLETED': return 'completed';
      case 'FAILED': return 'failed';
      case 'SKIPPED': return 'skipped';
      case 'RECOVERED': return 'recovered';
      case 'RUNNING': return 'running';
      default: return 'never';
    }
  }

  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(0);
    return `${m}m ${s}s`;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const instance = new AgentPerformanceMetrics();

module.exports = instance;
module.exports.AgentPerformanceMetrics = AgentPerformanceMetrics;
module.exports.AgentPerformanceEntry = AgentPerformanceEntry;
