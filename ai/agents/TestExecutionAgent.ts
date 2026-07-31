import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import AppiumAgent from './AppiumAgent';
import UnifiedHealth from '../health/unifiedHealth';
import PlaywrightCLIAgent from './PlaywrightCLIAgent';


class TestExecutionAgent {
  [key: string]: any;
  constructor(options: any = {}) {
    this.options = options;
  }

  async run() {
    console.log('[TestExecutionAgent] Starting AI-driven test execution');

    // ── Route through Playwright CLI if enabled ─────────────────────────
    if (process.env.PLAYWRIGHT_CLI === 'true' || this.options.usePlaywrightCLI) {
      console.log('[TestExecutionAgent] Playwright CLI execution mode enabled — routing through PlaywrightCLIAgent');
      return this._executeViaPlaywrightCLI();
    }

    // ── Legacy execution path (preserved) ───────────────────────────────

    // 1) Health check (Ollama + Vector fallback)
    try {
      const health = await UnifiedHealth.run();
      console.log('[TestExecutionAgent] Health OK:', health.summary || 'ok');
    } catch (err: any) {
      console.error('[TestExecutionAgent] Health check failed:', err.message);
      throw err;
    }

    // Ensure Ollama and Chroma are running for any subsequent vector operations (non-fatal)
    try {
      const ollamaManager = require('../health/ollamaManager');
      const ores = await ollamaManager.ensureRunning();
      console.log('[TestExecutionAgent] ollama ensureRunning:', ores && (ores.ok || ores.started || ores.alreadyRunning) ? 'ok' : JSON.stringify(ores));
    } catch (e: any) {
      console.warn('[TestExecutionAgent] ollama ensureRunning failed (continuing):', e.message);
    }
    try {
      const chromaManager = require('../vector-db/chromaServerManager');
      const ensure = await chromaManager.ensureRunning();
      console.log('[TestExecutionAgent] chroma ensureRunning:', ensure && ensure.ok ? 'ok' : JSON.stringify(ensure));
    } catch (e: any) {
      console.warn('[TestExecutionAgent] chroma ensureRunning failed (continuing):', e.message);
    }

    const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    let testCmd = null;

    // 2) Start Appium if mobile
    if (platform === 'ANDROID' || platform === 'IOS') {
      console.log('[TestExecutionAgent] Preparing Appium for mobile run');
      await AppiumAgent.startServerIfNeeded();
    }

    // 3) Run tests per platform
    try {
      if (platform === 'WEB') {
        if (process.env.BROWSERS) {
          console.log('[TestExecutionAgent] Running cross-browser web tests');
          testCmd = spawnSync('npm', ['run', 'test:cross-browser'], { stdio: 'inherit', env: process.env });
        } else {
          console.log('[TestExecutionAgent] Running web tests');
          testCmd = spawnSync('npm', ['run', 'test:web'], { stdio: 'inherit', env: process.env });
        }
      } else if (platform === 'ANDROID') {
        console.log('[TestExecutionAgent] Running Android tests');
        testCmd = spawnSync('npm', ['run', 'test:android'], { stdio: 'inherit', env: process.env });
      } else if (platform === 'IOS') {
        console.log('[TestExecutionAgent] Running iOS tests');
        testCmd = spawnSync('npm', ['run', 'test:ios'], { stdio: 'inherit', env: process.env });
      } else {
        console.log('[TestExecutionAgent] Unknown TEST_PLATFORM, falling back to core cucumber-js');
        testCmd = spawnSync('npm', ['run', 'test:core'], { stdio: 'inherit', env: process.env });
      }
    } finally {
      // 4) Ensure Appium stopped if framework started it
      if (platform === 'ANDROID' || platform === 'IOS') {
        try {
          await AppiumAgent.stopServerIfStartedByFramework();
        } catch (e: any) {
          console.warn('[TestExecutionAgent] Appium stop step failed:', e.message);
        }
      }
    }

    const exitCode = testCmd && typeof testCmd.status === 'number' ? testCmd.status : 0;

    // 5) Ingest artifacts into local vector store
    try {
      console.log('[TestExecutionAgent] Ingesting artifacts into local vector store');
      spawnSync('node', [path.join('ai', 'local', 'localIngest.js')], { stdio: 'inherit', env: process.env });
    } catch (err: any) {
      console.error('[TestExecutionAgent] Ingest failed:', err.message);
    }

    // 5b) Canonicalize Cucumber JSON
    try {
      const reportsRoot = path.join(process.cwd(), 'reports');
      function findCucumberReport(dir: any): any {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir);
        for (const e of entries) {
          const full = path.join(dir, e);
          let stat;
          try { stat = fs.statSync(full); } catch (ex: any) { continue; }
          if (stat.isDirectory()) {
            const flatCandidate = path.join(full, 'cucumber-report.json');
            if (fs.existsSync(flatCandidate)) return flatCandidate;
            const nestedCandidate = path.join(full, 'json', 'cucumber-report.json');
            if (fs.existsSync(nestedCandidate)) return nestedCandidate;
            const deeper = findCucumberReport(full);
            if (deeper) return deeper;
          }
        }
        return null;
      }

      async function waitForValidJson(filePath: any, { timeoutMs = 30000, intervalMs = 500 } = {}) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw || raw.trim().length === 0) throw new Error('empty');
            JSON.parse(raw);
            return true;
          } catch (e: any) {
            await new Promise(r => setTimeout(r, intervalMs));
          }
        }
        return false;
      }

      const found = findCucumberReport(reportsRoot);
      if (found) {
        const targetDir = path.join(process.cwd(), 'reports', 'json');
        fs.ensureDirSync(targetDir);
        const dest = path.join(targetDir, 'cucumber-report.json');
        const ok = await waitForValidJson(found, { timeoutMs: 30000, intervalMs: 500 });
        if (ok) {
          fs.copyFileSync(found, dest);
          console.log('[TestExecutionAgent] Copied cucumber JSON from', found, 'to', dest);
        } else {
          console.warn('[TestExecutionAgent] Found cucumber JSON but it appears incomplete or invalid after waiting; skipping copy to', dest);
        }
      } else {
        const topLevelFlat = path.join(reportsRoot, 'cucumber-report.json');
        if (fs.existsSync(topLevelFlat)) {
          const targetDir = path.join(process.cwd(), 'reports', 'json');
          fs.ensureDirSync(targetDir);
          const dest = path.join(targetDir, 'cucumber-report.json');
          fs.copyFileSync(topLevelFlat, dest);
          console.log('[TestExecutionAgent] Copied top-level cucumber JSON to', dest);
        } else {
          console.warn('[TestExecutionAgent] No cucumber-report.json found anywhere under reports/; post-exec RAG may fail');
        }
      }
    } catch (e: any) {
      console.warn('[TestExecutionAgent] Error while canonicalizing cucumber JSON:', e.message);
    }

    // 6) Run post-execution RAG analysis
    try {
      console.log('[TestExecutionAgent] Running post-execution RAG analysis');
      const workflow = require('../workflows/runPostExecutionAgents');
      await workflow.run();
    } catch (err: any) {
      console.error('[TestExecutionAgent] Post-execution RAG failed:', err.stack || err.message);
    }

    // 7) Write a basic summary
    const summaryPath = path.join(process.cwd(), 'ai', 'output', 'test-execution-summary.json');
    fs.ensureDirSync(path.dirname(summaryPath));
    fs.writeJsonSync(summaryPath, { platform, exitCode, executedAt: new Date().toISOString() }, { spaces: 2 });

    console.log('[TestExecutionAgent] Completed. Exit code:', exitCode);

    if (exitCode !== 0) {
      const err: any = new Error(`Tests failed with exit code `);
      err.code = exitCode;
      throw err;
    }

    return { agent: 'TestExecutionAgent', exitCode };
  }

  /**
   * Execute tests through the Playwright CLI agent.
   * This is the new official execution path — AI controls Playwright CLI.
   */
  async _executeViaPlaywrightCLI() {
    const platform = (process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    const executionConfig = require('../../config/executionConfig');
    const headed = executionConfig.isHeaded;

    console.log(`[TestExecutionAgent] Initializing Playwright CLI path for ${platform}`);

    // 1) Health checks
    try {
      const health = await UnifiedHealth.run();
      console.log('[TestExecutionAgent] Health OK:', health.summary || 'ok');
    } catch (err: any) {
      console.error('[TestExecutionAgent] Health check failed:', err.message);
      throw err;
    }

    try {
      const ollamaManager = require('../health/ollamaManager');
      await ollamaManager.ensureRunning();
    } catch (e: any) {
      console.warn('[TestExecutionAgent] ollama ensureRunning failed (continuing):', e.message);
    }

    try {
      const chromaManager = require('../vector-db/chromaServerManager');
      await chromaManager.ensureRunning();
    } catch (e: any) {
      console.warn('[TestExecutionAgent] chroma ensureRunning failed (continuing):', e.message);
    }

    // 2) Start Appium if mobile
    if (platform === 'ANDROID' || platform === 'IOS') {
      console.log('[TestExecutionAgent] Preparing Appium for mobile run');
      await AppiumAgent.startServerIfNeeded();
    }

    // 3) Execute via Playwright CLI Agent
    const cliAgent = new PlaywrightCLIAgent({
      platform,
      headed,
      browser: process.env.BROWSER || 'chromium',
      project: platform === 'ANDROID' ? 'android' : platform === 'IOS' ? 'ios' : platform === 'API' ? 'api' : undefined,
      envOverrides: {
        TEST_PLATFORM: platform,
        PLAYWRIGHT_CLI_AGENT: 'true',
        PLAYWRIGHT_CLI_EXECUTION: 'true'
      }
    });

    let cliResult: any;
    try {
      cliResult = await cliAgent.run({
        hasFailures: false,
        priority: this.options.priority || 'normal'
      });
    } catch (err: any) {
      // Playwright CLI threw — capture as failure result
      cliResult = { exitCode: 1, error: err.message, agent: 'PlaywrightCLIAgent' };
    } finally {
      // 4) Stop Appium if started
      if (platform === 'ANDROID' || platform === 'IOS') {
        try {
          await AppiumAgent.stopServerIfStartedByFramework();
        } catch (e: any) {
          console.warn('[TestExecutionAgent] Appium stop failed:', e.message);
        }
      }
    }

    const exitCode = cliResult && cliResult.exitCode !== undefined ? cliResult.exitCode : 0;

    // 5) Ingest artifacts into vector store
    try {
      console.log('[TestExecutionAgent] Ingesting artifacts into local vector store');
      spawnSync('node', [path.join('ai', 'local', 'localIngest.js')], { stdio: 'inherit', env: process.env });
    } catch (err: any) {
      console.error('[TestExecutionAgent] Ingest failed:', err.message);
    }

    // 6) Run post-execution RAG analysis
    try {
      console.log('[TestExecutionAgent] Running post-execution RAG analysis');
      const workflow = require('../workflows/runPostExecutionAgents');
      await workflow.run();
    } catch (err: any) {
      console.error('[TestExecutionAgent] Post-execution RAG failed:', err.stack || err.message);
    }

    // 7) Write summary with Playwright CLI metadata
    const summaryPath = path.join(process.cwd(), 'ai', 'output', 'test-execution-summary.json');
    fs.ensureDirSync(path.dirname(summaryPath));
    fs.writeJsonSync(summaryPath, {
      platform,
      exitCode,
      engine: 'playwright-cli',
      cliResult: {
        profile: cliResult.profileName || cliResult.profile,
        passed: cliResult.passed,
        failed: cliResult.failed,
        skipped: cliResult.skipped,
        duration: cliResult.duration
      },
      executedAt: new Date().toISOString()
    }, { spaces: 2 });

    console.log('[TestExecutionAgent] Playwright CLI path completed. Exit code:', exitCode);

    if (exitCode !== 0) {
      const err: any = new Error(`Tests failed with exit code `);
      err.code = exitCode;
      throw err;
    }

    return {
      agent: 'TestExecutionAgent',
      engine: 'playwright-cli',
      exitCode,
      cliResult
    };
  }
}

export default TestExecutionAgent;

// Programmatic convenience: expose run() for orchestrator
export const run = async function(options: any = {}) {;
  const inst = new TestExecutionAgent(options);
  return inst.run();
};


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Test Execution Agent",
  "version": "1.0.0",
  "description": "AI-driven test execution with health checks and platform orchestration. Supports Playwright CLI as official execution engine when PLAYWRIGHT_CLI=true.",
  "dependencies": [
    "PlaywrightCLIAgent",
    "AppiumAgent",
    "failureAnalysisAgent",
    "locatorHealingAgent",
    "executionMemoryAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "execution",
    "ai",
    "playwright-cli"
  ],
  "executionStage": "execution",
  "priority": 90,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 1,
    "backoff": "exponential"
  },
  "lifecycle": "active"
};
