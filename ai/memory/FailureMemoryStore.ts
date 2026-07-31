import fs from 'fs-extra';
import path from 'path';
/**
 * FailureMemoryStore.js
 *
 * Tracks test failures across executions for trend analysis.
 * Stores: failure signature, frequency, first/last seen, resolution status.
 */


const STORE_PATH = path.join(__dirname, 'failure-memory.json');

class FailureMemoryStore {
  constructor() {
    this._ensure();
  }

  _ensure() {
    fs.ensureDirSync(path.dirname(STORE_PATH));
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeJsonSync(STORE_PATH, { failures: [] as any[], version: 1 }, { spaces: 2 });
    }
  }

  _read() { return fs.readJsonSync(STORE_PATH); }
  _write(data: any) { fs.writeJsonSync(STORE_PATH, data, { spaces: 2 }); }

  /**
   * Record failures from an execution run.
   */
  recordFailures(executionSummary: any) {
    const data = this._read();
    const runId = executionSummary.runId || `run-${Date.now()}`;
    const failures = executionSummary.failures || [];

    for (const f of failures) {
      const signature = this._buildSignature(f);
      const existing = data.failures.find((x: any) => x.signature === signature);

      if (existing) {
        existing.lastSeen = new Date().toISOString();
        existing.count = (existing.count || 1) + 1;
        existing.runs.push(runId);
        existing.lastError = f.error ? f.error.slice(0,500) : existing.lastError;
      } else {
        data.failures.push({
          signature,
          feature: f.feature || 'unknown',
          scenario: f.scenario || 'unknown',
          step: f.failedStep || f.step || 'unknown',
          error: f.error ? f.error.slice(0,500) : '',
          locator: f.locator || '',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          count: 1,
          runs: [runId],
          resolved: false,
          resolutionRun: null
        });
      }
    }

    this._write(data);
    return { recorded: failures.length, totalUnique: data.failures.length };
  }

  /**
   * Mark a failure as resolved.
   */
  markResolved(signature: any, resolutionRun: any) {
    const data = this._read();
    const failure = data.failures.find((f: any) => f.signature === signature);
    if (failure) {
      failure.resolved = true;
      failure.resolutionRun = resolutionRun || `run-${Date.now()}`;
      this._write(data);
      return true;
    }
    return false;
  }

  /**
   * Get all unresolved failures.
   */
  getUnresolved() {
    const data = this._read();
    return data.failures.filter((f: any) => !f.resolved);
  }

  /**
   * Get top failures by frequency.
   */
  getTopFailures(limit = 10) {
    const data = this._read();
    return data.failures
      .filter((f: any) => !f.resolved)
      .sort((a: any, b: any) => (b.count || 0) - (a.count || 0))
      .slice(0, limit);
  }

  /**
   * Get trend data: failure rate over time.
   */
  getFailureRate(runCount = 10) {
    const data = this._read();
    const recentFailures = data.failures.filter((f: any) => {
      const age = Date.now() - new Date(f.lastSeen).getTime();
      return age < 86400000 * 30; // Last 30 days
    });
    return {
      totalUnique: data.failures.length,
      unresolved: data.failures.filter((f: any) => !f.resolved).length,
      recent30days: recentFailures.length
    };
  }

  _buildSignature(failure: any) {
    const scenario = failure.scenario || failure.test || '';
    const step = failure.failedStep || failure.step || '';
    const error = (failure.error || '').slice(0, 200);
    return `${scenario}::${step}::${error}`.replace(/\s+/g, ' ').trim();
  }
}

export default FailureMemoryStore;
