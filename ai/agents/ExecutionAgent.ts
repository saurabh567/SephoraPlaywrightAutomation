import fs from 'fs-extra';
import path from 'path';
// ExecutionAgent - Coordinates test execution across platforms, manages retries, and tracks execution state

const executionStatePath = path.join(process.cwd(), 'ai/memory/execution-state.json');

function loadState() {
  fs.ensureDirSync(path.dirname(executionStatePath));
  if (!fs.existsSync(executionStatePath)) {
    fs.writeJsonSync(executionStatePath, { runs: [] as any[], currentRun: null }, { spaces: 2 });
  }
  return fs.readJsonSync(executionStatePath);
}

function saveState(state: any) {
  fs.writeJsonSync(executionStatePath, state, { spaces: 2 });
}

export const run = async function run(input: any = {}) {
    console.log('[ExecutionAgent] Managing test execution');
    const runId = input.runId || `run-${Date.now()}`;
    const platform = (input.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    const tags = input.tags || process.env.TAGS || '';
    const browser = input.browser || process.env.BROWSER || 'chromium';
    const executionConfig = require('../../config/executionConfig');
    const headless = executionConfig.isHeadless;
    const state = loadState();
    const runInfo: Record<string, any> = {
      runId,
      platform,
      browser,
      headless,
      tags,
      startedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries || 2,
      artifacts: { reports: [] as any[], screenshots: [] as any[], videos: [] as any[] }
    };
    state.currentRun = runInfo;
    saveState(state);
    try {
      let exitCode = null;
      const errors: any[] = [];
      for (let attempt = 1; attempt <= runInfo.maxRetries + 1; attempt++) {
        console.log(`[ExecutionAgent] Attempt ${attempt}/${runInfo.maxRetries + 1} on ${platform}`);
        const { spawnSync } = require('child_process');
        const env = { ...process.env, ...executionConfig.toEnvOverrides(), BROWSER: browser };
        if (tags) env.TAGS = tags;
        let result;
        if (platform === 'WEB') {
          result = spawnSync('npm', ['run', 'test:web'], { stdio: 'inherit', env, shell: false });
        } else if (platform === 'ANDROID') {
          result = spawnSync('npm', ['run', 'test:android'], { stdio: 'inherit', env, shell: false });
        } else if (platform === 'IOS') {
          result = spawnSync('npm', ['run', 'test:ios'], { stdio: 'inherit', env, shell: false });
        } else {
          result = spawnSync('npm', ['run', 'test:core'], { stdio: 'inherit', env, shell: false });
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
    } catch (err: any) {
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
  };
export const getRunHistory = function() {
    const state = loadState();
    return state.runs;
  };
export const getCurrentRun = function() {
    const state = loadState();
    return state.currentRun;
  };
export default { run: async function run(input: any = {}) {
    console.log('[ExecutionAgent] Managing test execution');
    const runId = input.runId || `run-${Date.now()}`;
    const platform = (input.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
    const tags = input.tags || process.env.TAGS || '';
    const browser = input.browser || process.env.BROWSER || 'chromium';
    const executionConfig = require('../../config/executionConfig');
    const headless = executionConfig.isHeadless;
    const state = loadState();
    const runInfo: Record<string, any> = {
      runId,
      platform,
      browser,
      headless,
      tags,
      startedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries || 2,
      artifacts: { reports: [] as any[], screenshots: [] as any[], videos: [] as any[] }
    };
    state.currentRun = runInfo;
    saveState(state);
    try {
      let exitCode = null;
      const errors: any[] = [];
      for (let attempt = 1; attempt <= runInfo.maxRetries + 1; attempt++) {
        console.log(`[ExecutionAgent] Attempt ${attempt}/${runInfo.maxRetries + 1} on ${platform}`);
        const { spawnSync } = require('child_process');
        const env = { ...process.env, ...executionConfig.toEnvOverrides(), BROWSER: browser };
        if (tags) env.TAGS = tags;
        let result;
        if (platform === 'WEB') {
          result = spawnSync('npm', ['run', 'test:web'], { stdio: 'inherit', env, shell: false });
        } else if (platform === 'ANDROID') {
          result = spawnSync('npm', ['run', 'test:android'], { stdio: 'inherit', env, shell: false });
        } else if (platform === 'IOS') {
          result = spawnSync('npm', ['run', 'test:ios'], { stdio: 'inherit', env, shell: false });
        } else {
          result = spawnSync('npm', ['run', 'test:core'], { stdio: 'inherit', env, shell: false });
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
    } catch (err: any) {
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
  }, getRunHistory: function() {
    const state = loadState();
    return state.runs;
  }, getCurrentRun: function() {
    const state = loadState();
    return state.currentRun;
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Execution Coordinator",
  "version": "1.0.0",
  "description": "Coordinates test execution across platforms with retry and state tracking",
  "dependencies": ["PlannerAgent","DecisionAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "execution"
  ],
  "executionStage": "execution",
  "priority": 80,
  "conditions": [] as any[],
  "retryPolicy": {
    "maxRetries": 2,
    "backoff": "linear"
  },
  "lifecycle": "active"
};
