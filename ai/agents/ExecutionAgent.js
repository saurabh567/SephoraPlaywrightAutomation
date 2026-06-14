// ExecutionAgent - Coordinates test execution across platforms, manages retries, and tracks execution state
const fs = require('fs-extra');
const path = require('path');

const executionStatePath = path.join(process.cwd(), 'ai/memory/execution-state.json');

function loadState() {
  fs.ensureDirSync(path.dirname(executionStatePath));
  if (!fs.existsSync(executionStatePath)) {
    fs.writeJsonSync(executionStatePath, { runs: [], currentRun: null }, { spaces: 2 });
  }
  return fs.readJsonSync(executionStatePath);
}

function saveState(state) {
  fs.writeJsonSync(executionStatePath, state, { spaces: 2 });
}

module.exports = {
  run: async function run(input = {}) {
    console.log('[ExecutionAgent] Managing test execution');

    const runId = input.runId || `run-${Date.now()}`;
    const platform = (input.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    const tags = input.tags || process.env.TAGS || '';
    const browser = input.browser || process.env.BROWSER || 'chromium';
    const headless = input.headless !== false;

    const state = loadState();

    const runInfo = {
      runId,
      platform,
      browser,
      headless,
      tags,
      startedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries || 2,
      artifacts: { reports: [], screenshots: [], videos: [] }
    };

    state.currentRun = runInfo;
    saveState(state);

    try {
      let exitCode = null;
      const errors = [];

      for (let attempt = 1; attempt <= runInfo.maxRetries + 1; attempt++) {
        console.log(`[ExecutionAgent] Attempt ${attempt}/${runInfo.maxRetries + 1} on ${platform}`);

        const { spawnSync } = require('child_process');
        const env = { ...process.env, BROWSER: browser, HEADLESS: headless ? 'true' : 'false' };
        if (tags) env.TAGS = tags;

        let result;
        if (platform === 'WEB') {
          result = spawnSync('npm', ['run', 'test:web'], { stdio: 'inherit', env, shell: true });
        } else if (platform === 'ANDROID') {
          result = spawnSync('npm', ['run', 'test:android'], { stdio: 'inherit', env, shell: true });
        } else if (platform === 'IOS') {
          result = spawnSync('npm', ['run', 'test:ios'], { stdio: 'inherit', env, shell: true });
        } else {
          result = spawnSync('npm', ['run', 'test:core'], { stdio: 'inherit', env, shell: true });
        }

        exitCode = result && typeof result.status === 'number' ? result.status : -1;

        if (exitCode === 0) {
          runInfo.status = 'passed';
          break;
        } else {
          runInfo.retryCount = attempt;
          errors.push({ attempt, exitCode, stderr: result.stderr ? result.stderr.slice(-500) : '' });

          if (attempt <= runInfo.maxRetries) {
            console.log(`[ExecutionAgent] Retrying (attempt ${attempt} failed with code ${exitCode})`);
          } else {
            runInfo.status = 'failed';
          }
        }
      }

      runInfo.completedAt = new Date().toISOString();
      runInfo.exitCode = exitCode;
      runInfo.errors = errors;
      state.runs.push(runInfo);
      saveState(state);

      return {
        ok: runInfo.status === 'passed',
        runId,
        status: runInfo.status,
        attempts: runInfo.retryCount + 1,
        exitCode,
        errors
      };
    } catch (err) {
      runInfo.status = 'error';
      runInfo.error = err.message;
      state.runs.push(runInfo);
      saveState(state);

      return {
        ok: false,
        runId,
        status: 'error',
        error: err.message
      };
    }
  },

  getRunHistory: function() {
    const state = loadState();
    return state.runs;
  },

  getCurrentRun: function() {
    const state = loadState();
    return state.currentRun;
  }
};
