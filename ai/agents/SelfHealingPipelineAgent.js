// SelfHealingPipelineAgent - Phase 9
// AI-powered self-healing test pipeline that orchestrates cross-platform execution,
// automatic retry, locator healing, failure analysis, root cause detection,
// and pipeline status reporting for CI/CD integration.
const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');

const REPORTS_DIR = path.join(process.cwd(), 'reports', 'pipeline');
const PIPELINE_STATE_PATH = path.join(process.cwd(), 'ai/memory/pipeline-state.json');
const AGENTS_DIR = path.join(process.cwd(), 'ai', 'agents');

// ---------- Utilities ----------
function ensureDirs() {
  fs.ensureDirSync(REPORTS_DIR);
  fs.ensureDirSync(path.dirname(PIPELINE_STATE_PATH));
}

function loadPipelineState() {
  ensureDirs();
  if (!fs.existsSync(PIPELINE_STATE_PATH)) {
    fs.writeJsonSync(PIPELINE_STATE_PATH, { runs: [], currentRun: null }, { spaces: 2 });
  }
  return fs.readJsonSync(PIPELINE_STATE_PATH);
}

function savePipelineState(state) {
  fs.writeJsonSync(PIPELINE_STATE_PATH, state, { spaces: 2 });
}

function timestamp() {
  return new Date().toISOString();
}

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

// ---------- Pipeline Agent ----------
const SelfHealingPipelineAgent = {
  name: 'SelfHealingPipelineAgent',
  version: '1.0.0',

  // Run a single platform test suite and return exit code
  _runPlatformTests(platform, envOverrides = {}) {
    const scripts = {
      web: 'test:web',
      android: 'test:android',
      ios: 'test:ios',
      'cross-browser': 'test:cross-browser',
      parallel: 'test:parallel',
      core: 'test:core',
    };
    const scriptName = scripts[platform] || 'test:core';
    const env = { ...process.env, ...envOverrides };

    console.log(`[SelfHealingPipelineAgent] Running ${scriptName} (platform=${platform})`);

    const result = spawnSync('npm', ['run', scriptName], {
      stdio: 'inherit',
      env,
      shell: true,
      timeout: 600000,
    });

    return result && typeof result.status === 'number' ? result.status : -1;
  },

  // Run self-healing cycle: test -> analyze -> heal -> retry
  async runSelfHealingCycle(platform, options = {}) {
    const cycleId = `cycle-${platform}-${Date.now()}`;
    const maxRetries = options.maxRetries || 2;
    const tags = options.tags || '';
    const envOverrides = options.envOverrides || {};

    console.log(`[SelfHealingPipelineAgent] Self-healing cycle ${cycleId} for ${platform}`);

    const cycle = {
      cycleId,
      platform,
      startedAt: timestamp(),
      status: 'running',
      attempts: [],
      healAttempts: [],
      finalStatus: null,
    };

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      console.log(`[SelfHealingPipelineAgent] Attempt ${attempt}/${maxRetries + 1} for ${platform}`);

      const env = { ...envOverrides, TAGS: tags, RETRY_ATTEMPT: String(attempt) };
      const exitCode = this._runPlatformTests(platform, env);

      const attemptRecord = {
        attempt,
        exitCode,
        completedAt: timestamp(),
        status: exitCode === 0 ? 'passed' : 'failed',
      };
      cycle.attempts.push(attemptRecord);

      if (exitCode === 0) {
        cycle.finalStatus = 'passed';
        break;
      }

      // If last attempt failed, mark final status
      if (attempt === maxRetries + 1) {
        cycle.finalStatus = 'failed';
        break;
      }

      // Attempt self-healing between retries
      console.log(`[SelfHealingPipelineAgent] Attempting self-healing after attempt ${attempt}`);

      const healResult = await this._executeHealing(platform, attempt);
      cycle.healAttempts.push(healResult);

      if (healResult.ok) {
        console.log(`[SelfHealingPipelineAgent] Healing applied, retrying tests`);
      } else {
        console.log(`[SelfHealingPipelineAgent] Healing skipped or failed, retrying without changes`);
      }
    }

    cycle.completedAt = timestamp();
    cycle.status = cycle.finalStatus;

    return cycle;
  },

  // Execute self-healing: failure analysis → locator healing → re-ingest
  async _executeHealing(platform, attempt) {
    try {
      // 1. Failure analysis
      const failureAgent = safeRequire(path.join(AGENTS_DIR, 'failureAnalysisAgent'));
      let analysisResult = { skipped: true };
      if (failureAgent && typeof failureAgent.analyzeWithRag === 'function') {
        analysisResult = await failureAgent.analyzeWithRag({
          executionSummary: {
            platform,
            attempt,
            timestamp: timestamp(),
            reportDir: path.join(process.cwd(), 'reports', platform),
          },
        });
      }

      // 2. Locator healing
      const healingAgent = safeRequire(path.join(AGENTS_DIR, 'locatorHealingAgent'));
      let healResult = { skipped: true };
      if (healingAgent && typeof healingAgent.suggestWithRag === 'function') {
        healResult = await healingAgent.suggestWithRag({
          failures: analysisResult.failures || [],
          reportDir: path.join(process.cwd(), 'reports', platform),
        });
      }

      // 3. Re-ingest into vector store
      try {
        const ingestionService = safeRequire(path.join(process.cwd(), 'ai/vector-db/unifiedIngestionService'));
        if (ingestionService) {
          const service = new ingestionService();
          await service.ingestAll();
        }
      } catch {
        // non-fatal
      }

      return { ok: true, analysis: analysisResult.skipped ? 'skipped' : 'applied', healing: healResult.skipped ? 'skipped' : 'applied' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // Orchestrate execution across multiple platforms with self-healing
  async runCrossPlatform(platforms = [], options = {}) {
    const runId = `pipeline-${Date.now()}`;
    console.log(`[SelfHealingPipelineAgent] Cross-platform pipeline ${runId} for [${platforms.join(', ')}]`);

    const state = loadPipelineState();
    const pipelineRun = {
      runId,
      platforms,
      startedAt: timestamp(),
      status: 'running',
      cycles: [],
      summary: {},
    };
    state.currentRun = pipelineRun;
    savePipelineState(state);

    // Ensure infrastructure: Ollama + Chroma for AI analysis
    try {
      const ollamaManager = safeRequire(path.join(process.cwd(), 'ai/health/ollamaManager'));
      if (ollamaManager) await ollamaManager.ensureRunning();
    } catch { /* non-fatal */ }
    try {
      const chromaManager = safeRequire(path.join(process.cwd(), 'ai/vector-db/chromaServerManager'));
      if (chromaManager) await chromaManager.ensureRunning();
    } catch { /* non-fatal */ }

    // Run each platform sequentially (can be parallelized later)
    for (const platform of platforms) {
      console.log(`[SelfHealingPipelineAgent] Processing platform: ${platform}`);
      const cycle = await this.runSelfHealingCycle(platform, options);
      pipelineRun.cycles.push(cycle);
    }

    // Compute summary
    const passed = pipelineRun.cycles.filter((c) => c.finalStatus === 'passed').length;
    const failed = pipelineRun.cycles.filter((c) => c.finalStatus === 'failed').length;
    const totalAttempts = pipelineRun.cycles.reduce((sum, c) => sum + c.attempts.length, 0);
    const totalHeals = pipelineRun.cycles.reduce((sum, c) => sum + c.healAttempts.length, 0);

    pipelineRun.summary = {
      totalPlatforms: platforms.length,
      passed,
      failed,
      totalAttempts,
      totalHeals,
      overallStatus: failed === 0 ? 'passed' : 'failed',
    };
    pipelineRun.status = 'completed';
    pipelineRun.completedAt = timestamp();
    state.runs.push(pipelineRun);
    state.currentRun = null;
    savePipelineState(state);

    // Generate pipeline report
    const reportPath = path.join(REPORTS_DIR, `${runId}-pipeline-report.md`);
    const lines = [];
    lines.push('# Self-Healing Pipeline Execution Report');
    lines.push('');
    lines.push(`Run ID: ${runId}`);
    lines.push(`Executed At: ${timestamp()}`);
    lines.push(`Overall Status: **${pipelineRun.summary.overallStatus === 'passed' ? '✅ PASSED' : '❌ FAILED'}**`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push('|---|---|');
    lines.push(`| Platforms Executed | ${platforms.length} |`);
    lines.push(`| Passed | ${passed} |`);
    lines.push(`| Failed | ${failed} |`);
    lines.push(`| Total Test Attempts | ${totalAttempts} |`);
    lines.push(`| Self-Healing Attempts | ${totalHeals} |`);
    lines.push('');
    lines.push('## Platform Results');
    lines.push('');
    lines.push('| Platform | Status | Attempts | Heals | Final Result |');
    lines.push('|---|---|---|---|---|');
    for (const cycle of pipelineRun.cycles) {
      const icon = cycle.finalStatus === 'passed' ? '✅' : '❌';
      lines.push(`| ${cycle.platform} | ${icon} | ${cycle.attempts.length} | ${cycle.healAttempts.length} | ${cycle.finalStatus} |`);
    }
    lines.push('');
    lines.push('## Attempt Details');
    lines.push('');
    for (const cycle of pipelineRun.cycles) {
      lines.push(`### ${cycle.platform} (${cycle.cycleId})`);
      lines.push('');
      lines.push('| Attempt | Exit Code | Status |');
      lines.push('|---|---|---|');
      for (const a of cycle.attempts) {
        lines.push(`| ${a.attempt} | ${a.exitCode} | ${a.status} |`);
      }
      lines.push('');
    }
    lines.push('## Self-Healing Actions');
    lines.push('');
    for (const cycle of pipelineRun.cycles) {
      if (cycle.healAttempts.length > 0) {
        lines.push(`### ${cycle.platform}`);
        lines.push('');
        for (const h of cycle.healAttempts) {
          const status = h.ok ? '✅ Applied' : '❌ Failed';
          lines.push(`- Healing: ${status} ${h.error ? `(${h.error})` : ''}`);
        }
        lines.push('');
      }
    }

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

    return {
      ok: pipelineRun.summary.overallStatus === 'passed',
      runId,
      reportPath: path.relative(process.cwd(), reportPath),
      summary: pipelineRun.summary,
      cycles: pipelineRun.cycles.map((c) => ({
        platform: c.platform,
        finalStatus: c.finalStatus,
        attempts: c.attempts.length,
        heals: c.healAttempts.length,
      })),
    };
  },

  // Run a single platform with self-healing (convenience wrapper)
  async run(input = {}) {
    console.log('[SelfHealingPipelineAgent] AI-powered self-healing test pipeline');

    const platform = (input.platform || process.env.TEST_PLATFORM || 'web').toLowerCase();
    const platforms = input.platforms || [platform];
    const maxRetries = input.maxRetries || Number(process.env.PIPELINE_MAX_RETRIES || 2);
    const tags = input.tags || process.env.TAGS || '';

    return this.runCrossPlatform(platforms, { maxRetries, tags, envOverrides: input.envOverrides });
  },

  // Get pipeline execution history
  getRunHistory() {
    const state = loadPipelineState();
    return state.runs || [];
  },

  // Get current/running pipeline
  getCurrentRun() {
    const state = loadPipelineState();
    return state.currentRun;
  },
};

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'run' || command === 'single') {
    const platform = args[1] || process.env.TEST_PLATFORM || 'web';
    const result = await SelfHealingPipelineAgent.run({ platform });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'pipeline' || command === 'cross-platform') {
    const platforms = args.slice(1).length > 0 ? args.slice(1) : ['web', 'android', 'ios'];
    const result = await SelfHealingPipelineAgent.runCrossPlatform(platforms);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'history') {
    const history = SelfHealingPipelineAgent.getRunHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  if (command === 'current') {
    const current = SelfHealingPipelineAgent.getCurrentRun();
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  if (command === 'help') {
    console.log('SelfHealingPipelineAgent - AI-powered self-healing test pipeline');
    console.log('');
    console.log('Commands:');
    console.log('  run [platform]              Run single platform with self-healing (default: web)');
    console.log('  pipeline [platforms...]      Run cross-platform pipeline (default: web android ios)');
    console.log('  cross-platform [platforms..] Alias for pipeline');
    console.log('  history                     Show pipeline execution history');
    console.log('  current                     Show current/running pipeline');
    return;
  }

  console.log(`Unknown command: ${command}. Use "help" for usage.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[SelfHealingPipelineAgent] CLI error:', e.message);
    process.exit(1);
  });
}

module.exports = SelfHealingPipelineAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Self-Healing Pipeline Agent",
  "version": "1.0.0",
  "description": "Cross-platform self-healing pipeline with automatic retry and healing",
  "dependencies": [
    "failureAnalysisAgent",
    "locatorHealingAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "healing",
    "pipeline"
  ],
  "executionStage": "multi-agent",
  "priority": 55,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 2,
    "backoff": "exponential"
  },
  "lifecycle": "active"
};
