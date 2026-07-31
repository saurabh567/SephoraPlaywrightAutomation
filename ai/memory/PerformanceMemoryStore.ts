import fs from 'fs-extra';
import path from 'path';
/**
 * PerformanceMemoryStore.js
 *
 * Tracks test execution performance metrics across runs for trend analysis.
 * Stores: duration, pass/fail counts, scenario counts, platform, browser.
 */


const STORE_PATH = path.join(__dirname, 'performance-memory.json');

class PerformanceMemoryStore {
  constructor() {
    this._ensure();
  }

  _ensure() {
    fs.ensureDirSync(path.dirname(STORE_PATH));
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeJsonSync(STORE_PATH, { runs: [] as any[] }, { spaces: 2 });
    }
  }

  _read() { return fs.readJsonSync(STORE_PATH); }
  _write(data: any) { fs.writeJsonSync(STORE_PATH, data, { spaces: 2 }); }

  /**
   * Record performance metrics from an execution run.
   */
  recordRun(metrics: any) {
    const data = this._read();
    const entry = {
      runId: metrics.runId || `run-${Date.now()}`,
      timestamp: new Date().toISOString(),
      platform: metrics.platform || process.env.TEST_PLATFORM || 'WEB',
      browser: metrics.browser || process.env.BROWSER || 'chromium',
      environment: process.env.ENV || 'dev',
      durationMs: metrics.durationMs || 0,
      totalScenarios: metrics.totalScenarios || 0,
      passed: metrics.passed || 0,
      failed: metrics.failed || 0,
      skipped: metrics.skipped || 0,
      passRate: metrics.totalScenarios > 0
        ? Math.round(((metrics.passed || 0) / metrics.totalScenarios) * 10000) / 100
        : 0
    };

    data.runs.push(entry);

    // Keep last 500 runs
    if (data.runs.length > 500) {
      data.runs = data.runs.slice(-500);
    }

    this._write(data);
    return entry;
  }

  /**
   * Get performance trends.
   */
  getTrends(window = 10) {
    const data = this._read();
    const recent = data.runs.slice(-window);

    if (recent.length === 0) {
      return { recentRuns: 0, averageDuration: 0, averagePassRate: 0, trend: 'insufficient-data' };
    }

    const avgDuration = Math.round(recent.reduce((s: any, r: any) => s + r.durationMs, 0) / recent.length);
    const avgPassRate = Math.round(recent.reduce((s: any, r: any) => s + r.passRate, 0) / recent.length);

    // Determine trend direction
    const half = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, half);
    const secondHalf = recent.slice(half);
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s: any, r: any) => s + r.passRate, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s: any, r: any) => s + r.passRate, 0) / secondHalf.length : 0;

    let trend = 'stable';
    if (secondAvg - firstAvg > 5) trend = 'improving';
    else if (firstAvg - secondAvg > 5) trend = 'degrading';

    return {
      recentRuns: recent.length,
      averageDuration: avgDuration,
      averagePassRate: Math.round(avgPassRate * 100) / 100,
      trend,
      firstHalfAvg: Math.round(firstAvg * 100) / 100,
      secondHalfAvg: Math.round(secondAvg * 100) / 100
    };
  }

  /**
   * Get platform-specific performance.
   */
  getPlatformPerformance(platform: any) {
    const data = this._read();
    const platformRuns = data.runs.filter((r: any) => r.platform === platform.toUpperCase());
    return {
      totalRuns: platformRuns.length,
      averageDuration: platformRuns.length > 0
        ? Math.round(platformRuns.reduce((s: any, r: any) => s + r.durationMs, 0) / platformRuns.length)
        : 0,
      averagePassRate: platformRuns.length > 0
        ? Math.round(platformRuns.reduce((s: any, r: any) => s + r.passRate, 0) / platformRuns.length * 100) / 100
        : 0
    };
  }
}

export default PerformanceMemoryStore;
