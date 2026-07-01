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

    // 5b) Canonicalize Cucumber JSON to reports/json/cucumber-report.json so post-exec RAG can find it.
    //     Searches both flat (reports/*/cucumber-report.json) and nested (reports/*/json/cucumber-report.json) structures.
    try {
      const reportsRoot = path.join(process.cwd(), 'reports');
      function findCucumberReport(dir) {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir);
        for (const e of entries) {
          const full = path.join(dir, e);
          let stat;
          try { stat = fs.statSync(full); } catch (ex) { continue; }
          if (stat.isDirectory()) {
            // Check flat structure: reports/{platform}/cucumber-report.json
            const flatCandidate = path.join(full, 'cucumber-report.json');
            if (fs.existsSync(flatCandidate)) return flatCandidate;
            // Check nested structure: reports/{platform}/json/cucumber-report.json
            const nestedCandidate = path.join(full, 'json', 'cucumber-report.json');
            if (fs.existsSync(nestedCandidate)) return nestedCandidate;
            // Recurse into subdirectory
            const deeper = findCucumberReport(full);
            if (deeper) return deeper;
          }
        }
        return null;
      }

      async function waitForValidJson(filePath, { timeoutMs = 30000, intervalMs = 500 } = {}) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw || raw.trim().length === 0) throw new Error('empty');
            JSON.parse(raw);
            return true;
          } catch (e) {
            // likely incomplete write — wait and retry
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
        // wait for the source JSON to be fully written and valid
        const ok = await waitForValidJson(found, { timeoutMs: 30000, intervalMs: 500 });
        if (ok) {
          fs.copyFileSync(found, dest);
          console.log('[TestExecutionAgent] Copied cucumber JSON from', found, 'to', dest);
        } else {
          console.warn('[TestExecutionAgent] Found cucumber JSON but it appears incomplete or invalid after waiting; skipping copy to', dest);
        }
      } else {
        // Also search the top-level reports directory directly
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
    } catch (e) {
      console.warn('[TestExecutionAgent] Error while canonicalizing cucumber JSON:', e.message);
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

// Programmatic convenience: expose run() for orchestrator
module.exports.run = async function(options = {}) {
  const inst = new TestExecutionAgent(options);
  return inst.run();
};
