import fs from 'fs-extra';
import path from 'path';
/**
 * AgentHealthTracker.js
 *
 * Tracks execution health for every agent in the registry.
 * Records: status, last execution, duration, success/failure rate, dependencies.
 *
 * Integrates with AgentRegistry to wrap agent execution with monitoring.
 * Persists health data to ai/memory/agent-health.json.
 */


const HEALTH_STORE_PATH = path.join(__dirname, '..', 'memory', 'agent-health.json');

class AgentHealthTracker {
  [key: string]: any;
  constructor() {
    this._ensure();
    this._registry = null;
  }

  _ensure() {
    fs.ensureDirSync(path.dirname(HEALTH_STORE_PATH));
    if (!fs.existsSync(HEALTH_STORE_PATH)) {
      fs.writeJsonSync(HEALTH_STORE_PATH, {
        agents: {} as Record<string, any>,
        updatedAt: null
      }, { spaces: 2 });
    }
  }

  _read() { return fs.readJsonSync(HEALTH_STORE_PATH); }
  _write(data: any) { fs.writeJsonSync(HEALTH_STORE_PATH, data, { spaces: 2 }); }

  /**
   * Initialize health records from registry.
   */
  async initializeFromRegistry(registry: any) {
    this._registry = registry;
    const data = this._read();
    const all = registry.getAll();

    for (const agent of all) {
      if (!data.agents[agent.key]) {
        data.agents[agent.key] = this._createDefault(agent);
      } else {
        // Update metadata that may have changed
        const existing = data.agents[agent.key];
        existing.name = agent.metadata.name || agent.key;
        existing.stage = agent.metadata.executionStage || 'unknown';
        existing.priority = agent.metadata.priority || 50;
        existing.dependencies = agent.metadata.dependencies || [];
        existing.platforms = agent.metadata.platforms || [];
        existing.lifecycle = agent.metadata.lifecycle || 'active';
        existing.hasRun = agent.hasRun;
      }
    }

    data.updatedAt = new Date().toISOString();
    this._write(data);
    return data;
  }

  /**
   * Record an agent execution.
   */
  recordExecution(agentKey: any, result: any) {
    const data = this._read();
    const entry = data.agents[agentKey] || this._createDefault({ key: agentKey });

    entry.lastExecution = new Date().toISOString();
    entry.totalRuns = (entry.totalRuns || 0) + 1;
    entry.lastDuration = result.duration || 0;

    if (result.ok === true || result.status === 'completed') {
      entry.lastStatus = 'healthy';
      entry.successCount = (entry.successCount || 0) + 1;
      entry.consecutiveFailures = 0;
    } else if (result.error || result.status === 'failed') {
      entry.lastStatus = 'degraded';
      entry.failureCount = (entry.failureCount || 0) + 1;
      entry.lastError = (result.error || '').slice(0, 500);
      entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
    } else {
      entry.lastStatus = 'skipped';
    }

    entry.successRate = entry.totalRuns > 0
      ? Math.round((entry.successCount / entry.totalRuns) * 100)
      : 0;

    // Health determination
    if (entry.consecutiveFailures >= 3) {
      entry.health = 'critical';
    } else if (entry.consecutiveFailures >= 1) {
      entry.health = 'degraded';
    } else if (entry.totalRuns === 0) {
      entry.health = 'unknown';
    } else {
      entry.health = 'healthy';
    }

    data.agents[agentKey] = entry;
    data.updatedAt = new Date().toISOString();
    this._write(data);
    return entry;
  }

  /**
   * Record an execution that was skipped (condition not met).
   */
  recordSkipped(agentKey: any) {
    const data = this._read();
    const entry = data.agents[agentKey] || this._createDefault({ key: agentKey });
    entry.lastStatus = 'skipped';
    entry.totalSkips = (entry.totalSkips || 0) + 1;
    data.agents[agentKey] = entry;
    data.updatedAt = new Date().toISOString();
    this._write(data);
  }

  /**
   * Get health for a specific agent.
   */
  getHealth(agentKey: any) {
    const data = this._read();
    return data.agents[agentKey] || null;
  }

  /**
   * Get all agent health data.
   */
  getAllHealth() {
    const data = this._read();
    return data.agents;
  }

  /**
   * Get agents by health status.
   */
  getByHealth(status: any) {
    const data = this._read();
    return (Object.entries(data.agents) as [string, any][])
      .filter(([, entry]) => entry.health === status)
      .map(([key, entry]) => ({ key, ...entry }));
  }

  /**
   * Get summary statistics.
   */
  getSummary() {
    const data = this._read();
    const agents = (Object.values(data.agents) as any[]);
    const total = agents.length;
    const healthy = agents.filter(a => a.health === 'healthy').length;
    const degraded = agents.filter(a => a.health === 'degraded').length;
    const critical = agents.filter(a => a.health === 'critical').length;
    const unknown = agents.filter(a => a.health === 'unknown' || !a.health).length;
    const avgSuccessRate = agents.length > 0
      ? Math.round(agents.reduce((s, a) => s + (a.successRate || 0), 0) / agents.length)
      : 0;
    const totalRuns = agents.reduce((s, a) => s + (a.totalRuns || 0), 0);

    return {
      totalAgents: total,
      healthy,
      degraded,
      critical,
      unknown,
      averageSuccessRate: avgSuccessRate,
      totalExecutions: totalRuns,
      updatedAt: data.updatedAt
    };
  }

  _createDefault(agent: any) {
    const m = agent.metadata || {};
    const key = agent.key || agent;
    return {
      key,
      name: m.name || key,
      stage: m.executionStage || 'unknown',
      priority: m.priority || 50,
      dependencies: m.dependencies || [],
      platforms: m.platforms || [],
      lifecycle: m.lifecycle || 'active',
      hasRun: agent.hasRun !== false,
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      totalSkips: 0,
      consecutiveFailures: 0,
      successRate: 0,
      lastExecution: null,
      lastDuration: 0,
      lastStatus: 'never',
      lastError: null,
      health: 'unknown'
    };
  }
}

// Singleton
const instance = new AgentHealthTracker();
export default instance;
export { AgentHealthTracker };
