import fs from 'fs-extra';
import path from 'path';
// LocatorHistoryStore - Tracks locator versions, successes, failures, and replacements over time
// Stores persistent history under ai/memory/locator-history.json

class LocatorHistoryStore {
  [key: string]: any;
  constructor(options: any = {}) {
    this.storePath = options.storePath || path.join(process.cwd(), 'ai/memory/locator-history/locator-history.json');
    fs.ensureDirSync(path.dirname(this.storePath));
    this._ensureStore();
  }

  _ensureStore() {
    if (!fs.existsSync(this.storePath)) {
      fs.writeJsonSync(this.storePath, {
        locators: {} as Record<string, any>,
        versionCounter: 0,
        analytics: { totalRecorded: 0, totalReplacements: 0 }
      }, { spaces: 2 });
    }
  }

  _read() {
    return fs.readJsonSync(this.storePath);
  }

  _write(data: any) {
    fs.writeJsonSync(this.storePath, data, { spaces: 2 });
  }

  _makeKey(pageName: any, locatorName: any) {
    return `${pageName}::${locatorName}`.toLowerCase();
  }

  /**
   * Record a successful locator usage
   */
  recordLocator(pageName: any, locatorName: any, locatorValue: any, locatorType = 'css') {
    const data = this._read();
    const key = this._makeKey(pageName, locatorName);

    if (!data.locators[key]) {
      data.locators[key] = {
        pageName,
        locatorName,
        currentValue: locatorValue,
        currentType: locatorType,
        firstSeen: new Date().toISOString(),
        versions: [] as any[],
        totalSuccesses: 0,
        totalFailures: 0,
        consecutiveFailures: 0,
        lastUsed: null,
        lastFailureError: null
      };
    }

    const entry = data.locators[key];
    entry.lastUsed = new Date().toISOString();
    entry.totalSuccesses = (entry.totalSuccesses || 0) + 1;
    entry.consecutiveFailures = 0;
    data.analytics.totalRecorded = (data.analytics.totalRecorded || 0) + 1;
    this._write(data);
    return key;
  }

  /**
   * Record a locator failure
   */
  recordFailure(pageName: any, locatorName: any, errorMessage = '') {
    const data = this._read();
    const key = this._makeKey(pageName, locatorName);
    if (!data.locators[key]) return null;

    const entry = data.locators[key];
    entry.totalFailures = (entry.totalFailures || 0) + 1;
    entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
    entry.lastFailure = new Date().toISOString();
    entry.lastFailureError = errorMessage;
    data.analytics.totalRecorded = (data.analytics.totalRecorded || 0) + 1;
    this._write(data);
    return entry;
  }

  /**
   * Record a locator replacement (version bump)
   */
  recordReplacement(pageName: any, locatorName: any, oldValue: any, newValue: any, reason = 'healing') {
    const data = this._read();
    const key = this._makeKey(pageName, locatorName);
    if (!data.locators[key]) return null;

    const entry = data.locators[key];
    const version = (data.versionCounter || 0) + 1;
    data.versionCounter = version;

    entry.versions = entry.versions || [];
    entry.versions.push({
      version,
      previousValue: oldValue,
      newValue,
      reason,
      replacedAt: new Date().toISOString(),
      rolledBack: false
    });
    entry.currentValue = newValue;
    entry.consecutiveFailures = 0;
    data.analytics.totalReplacements = (data.analytics.totalReplacements || 0) + 1;
    this._write(data);
    return { key, version };
  }

  /**
   * Mark a replacement as rolled back
   */
  markRolledBack(pageName: any, locatorName: any, version: any) {
    const data = this._read();
    const key = this._makeKey(pageName, locatorName);
    if (!data.locators[key]) return false;

    const entry = data.locators[key];
    const ver = (entry.versions || []).find((v: any) => v.version === version);
    if (ver) {
      ver.rolledBack = true;
      this._write(data);
      return true;
    }
    return false;
  }

  /**
   * Get full history for a specific locator
   */
  getLocatorHistory(pageName: any, locatorName: any) {
    const data = this._read();
    const key = this._makeKey(pageName, locatorName);
    return data.locators[key] || null;
  }

  /**
   * Get all locators that have high failure rates or consecutive failures
   */
  getAllUnstableLocators(threshold = 3) {
    const data = this._read();
    return (Object.entries(data.locators) as [string, any][])
      .filter(([, entry]) => {
        const consFail = entry.consecutiveFailures || 0;
        const totalFail = entry.totalFailures || 0;
        const totalSuccess = entry.totalSuccesses || 0;
        const failureRatio = totalFail / Math.max(totalSuccess + totalFail, 1);
        return consFail >= threshold || failureRatio > 0.3;
      })
      .map(([key, entry]) => ({ key, ...entry }));
  }

  /**
   * Get summary analytics
   */
  getAnalytics() {
    const data = this._read();
    return data.analytics;
  }

  /**
   * Get overall healing success rate
   */
  getHealingSuccessRate() {
    const data = this._read();
    const total = data.analytics.totalReplacements || 0;
    if (total === 0) {
      return { rate: 1.0, message: 'No replacements recorded yet' };
    }

    let successful = 0;
    for (const entry of (Object.values(data.locators) as any[])) {
      for (const v of (entry.versions || [])) {
        if (!v.rolledBack) successful++;
      }
    }

    return {
      rate: total > 0 ? Math.round((successful / total) * 100) / 100 : 1,
      totalReplacements: total,
      successfulReplacements: successful,
      rolledBackReplacements: total - successful
    };
  }

  /**
   * Clear all history
   */
  clear() {
    fs.writeJsonSync(this.storePath, {
      locators: {} as Record<string, any>,
      versionCounter: 0,
      analytics: { totalRecorded: 0, totalReplacements: 0 }
    }, { spaces: 2 });
  }
}

export default LocatorHistoryStore;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Locator History Store",
  "version": "1.0.0",
  "description": "Persistent storage of locator versions, successes, failures, and replacements",
  "dependencies": [] as any[],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "healing",
    "storage"
  ],
  "executionStage": "analysis",
  "priority": 30,
  "conditions": [] as any[],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "internal"
};
