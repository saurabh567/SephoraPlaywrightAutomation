const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const AppiumAgent = require('./AppiumAgent');
const UnifiedHealth = require('../health/unifiedHealth');

class TestExecutionAgent {
  constructor(options = {}) {
    this.options = options;
  }

  async run() {
    console.log('[TestExecutionAgent] Starting AI-driven test execution');

    // 1) Health check (Ollama + Vector fallback)
    try {
      const health = await UnifiedHealth.run();
      console.log('[TestExecutionAgent] Health OK:', health.summary || 'ok');
    } catch (err) {
      console.error('[TestExecutionAgent] Health check failed:', err.message);
      throw err;
    }

    // Ensure Ollama and Chroma are running for any subsequent vector operations (non-fatal)
    try {
      const ollamaManager = require('../health/ollamaManager');
      const ores = await ollamaManager.ensureRunning();
      console.log('[TestExecutionAgent] ollama ensureRunning:', ores && (ores.ok || ores.started || ores.alreadyRunning) ? 'ok' : JSON.stringify(ores));
    } catch (e) {
      console.warn('[TestExecutionAgent] ollama ensureRunning failed (continuing):', e.message);
    }
    try {
      const chromaManager = require('../vector-db/chromaServerManager');
      const ensure = await chromaManager.ensureRunning();
      console.log('[TestExecutionAgent] chroma ensureRunning:', ensure && ensure.ok ? 'ok' : JSON.stringify(ensure));
    } catch (e) {
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
        } catch (e) {
          console.warn('[TestExecutionAgent] Appium stop step failed:', e.message);
        }
      }
    }

    const exitCode = testCmd && typeof testCmd.status === 'number' ? testCmd.status : 0;

    // 5) Ingest artifacts into local vector store
    try {
      console.log('[TestExecutionAgent] Ingesting artifacts into local vector store');
      spawnSync('node', [path.join('ai', 'local', 'localIngest.js')], { stdio: 'inherit', env: process.env });
    } catch (err) {
      console.error('[TestExecutionAgent] Ingest failed:', err.message);
    }

    // 6) Run post-execution RAG analysis (failure analysis, locator healing, etc.)
    try {
      console.log('[TestExecutionAgent] Running post-execution RAG analysis');
      const workflow = require('../workflows/runPostExecutionAgents');
      await workflow.run();
    } catch (err) {
      console.error('[TestExecutionAgent] Post-execution RAG failed:', err.stack || err.message);
    }

    // 7) Write a basic summary
    const summaryPath = path.join(process.cwd(), 'ai', 'output', 'test-execution-summary.json');
    fs.ensureDirSync(path.dirname(summaryPath));
    fs.writeJsonSync(summaryPath, { platform, exitCode, executedAt: new Date().toISOString() }, { spaces: 2 });

    console.log('[TestExecutionAgent] Completed. Exit code:', exitCode);

    if (exitCode !== 0) {
      const err = new Error(`Tests failed with exit code ${exitCode}`);
      err.code = exitCode;
      throw err;
    }

    return { agent: 'TestExecutionAgent', exitCode };
  }
}

module.exports = TestExecutionAgent;
