import fs from 'fs-extra';
import path from 'path';
/**
 * memoryAgent.js
 *
 * Unified memory agent that enriches ALL memory stores on every execution.
 *
 * Memory stores enriched:
 *   - Execution Memory:  run summaries (executionMemoryAgent)
 *   - Failure Memory:    failure signatures, frequency, trends
 *   - Locator Memory:    locator history (via LocatorHistoryStore)
 *   - Environment Memory: platform, browser, OS, Node version
 *   - Device Memory:     device/emulator/simulator sessions
 *   - Performance Memory: duration, pass/fail, trends
 *   - Historical Trends: anomaly detection data
 *   - Vector Database:   ChromaDB ingestion
 */


class MemoryAgent {
  async run(input: any = {}) {
    console.log('[MemoryAgent] Enriching all memory stores');

    const results: Record<string, any> = {};
    const executionResult = input.executionResult || {};
    const platform = input.platform || process.env.TEST_PLATFORM || 'WEB';
    const runId = `run-${Date.now()}`;

    // 1. Execution Memory
    try {
      const executionMemory = require('../memory/executionHistory');
      if (executionMemory && executionMemory.recordRun) {
        const entry = await executionMemory.recordRun({
          runId,
          platform,
          totalScenarios: executionResult.totalScenarios || 0,
          passed: executionResult.passed || 0,
          failed: executionResult.failed || 0,
          skipped: executionResult.skipped || 0,
          durationMs: input.durationMs || 0,
          browser: process.env.BROWSER || 'chromium'
        });
        results.executionMemory = { ok: true };
      }
    } catch (e: any) {
      results.executionMemory = { ok: false, error: e.message };
      console.warn('[MemoryAgent] Execution memory:', e.message);
    }

    // 2. Failure Memory
    try {
      const FailureMemoryStore = require('../memory/FailureMemoryStore');
      const failureStore = new FailureMemoryStore();
      const failResult = failureStore.recordFailures({
        runId,
        failures: executionResult.failures || []
      });
      results.failureMemory = { ok: true, recorded: failResult.recorded };
    } catch (e: any) {
      results.failureMemory = { ok: false, error: e.message };
      console.warn('[MemoryAgent] Failure memory:', e.message);
    }

    // 3. Environment Memory
    try {
      const EnvironmentMemoryStore = require('../memory/EnvironmentMemoryStore');
      const envStore = new EnvironmentMemoryStore();
      envStore.capture({ runId, platform });
      results.environmentMemory = { ok: true };
    } catch (e: any) {
      results.environmentMemory = { ok: false, error: e.message };
      console.warn('[MemoryAgent] Environment memory:', e.message);
    }

    // 4. Device Memory (if mobile)
    if (platform === 'ANDROID' || platform === 'IOS') {
      try {
        const DeviceMemoryStore = require('../memory/DeviceMemoryStore');
        const deviceStore = new DeviceMemoryStore();
        deviceStore.recordSession({
          runId,
          platform,
          deviceName: process.env.DEVICE_NAME || 'unknown',
          deviceType: platform === 'ANDROID' ? 'emulator' : 'simulator',
          success: executionResult.exitCode === 0
        });
        results.deviceMemory = { ok: true };
      } catch (e: any) {
        results.deviceMemory = { ok: false, error: e.message };
      }
    }

    // 5. Performance Memory
    try {
      const PerformanceMemoryStore = require('../memory/PerformanceMemoryStore');
      const perfStore = new PerformanceMemoryStore();
      perfStore.recordRun({
        runId,
        platform,
        durationMs: input.durationMs || 0,
        totalScenarios: executionResult.totalScenarios || 0,
        passed: executionResult.passed || 0,
        failed: executionResult.failed || 0,
        skipped: executionResult.skipped || 0
      });
      results.performanceMemory = { ok: true };
    } catch (e: any) {
      results.performanceMemory = { ok: false, error: e.message };
    }

    // 6. Vector Database ingestion (via ChromaDB)
    try {
      const { spawnSync } = require('child_process');
      spawnSync('node', [path.join('ai', 'local', 'localIngest.js')], {
        stdio: 'inherit',
        env: process.env
      });
      results.vectorDatabase = { ok: true };
    } catch (e: any) {
      results.vectorDatabase = { ok: false, error: e.message };
      console.warn('[MemoryAgent] Vector DB:', e.message);
    }

    console.log(`[MemoryAgent] Memory enriched: ${(Object.values(results) as any[]).filter(r => r.ok).length}/${Object.keys(results).length} stores`);

    return {
      ok: true,
      runId,
      stores: results
    };
  }
}

export default MemoryAgent;

export const metadata = {
  name: 'Memory Agent',
  version: '1.0.0',
  description: 'Unified memory management - enriches all memory stores on every execution',
  dependencies: [] as any[],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['memory', 'storage', 'trends'],
  executionStage: 'analysis',
  priority: 86,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['memory-management'],
  lifecycle: 'active'
};
