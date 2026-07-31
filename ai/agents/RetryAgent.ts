import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
// RetryAgent - Manages retry logic for failed tests with smart backoff and selective re-execution

const retryStatePath = path.join(process.cwd(), 'ai/memory/retry-state.json');

function loadState() {
  fs.ensureDirSync(path.dirname(retryStatePath));
  if (!fs.existsSync(retryStatePath)) {
    fs.writeJsonSync(retryStatePath, { retryHistory: [] as any[], currentRetry: null }, { spaces: 2 });
  }
  return fs.readJsonSync(retryStatePath);
}

function saveState(state: any) {
  fs.writeJsonSync(retryStatePath, state, { spaces: 2 });
}

export const run = async function run(input: any = {}) {
    console.log('[RetryAgent] Managing retry logic');
    const maxRetries = input.maxRetries || 2;
    const retryDelay = input.retryDelay || 5000;
    const backoffFactor = input.backoffFactor || 2;
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    const failedScenarios: any[] = [];
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        for (const feature of features) {
          for (const element of (feature.elements || [])) {
            if (element.type !== 'scenario') continue;
            const failedStep = (element.steps || []).find((s: any) => s.result?.status === 'failed');
            if (failedStep) {
              const tags = (element.tags || []).map((t: any) => t.name).join(' ');
              failedScenarios.push({
                name: element.name,
                feature: feature.name || 'unknown',
                uri: feature.uri || '',
                line: element.line || 0,
                tags: tags,
                failedStep: failedStep.name || '',
                error: failedStep.result?.error_message || ''
              });
            }
          }
        }
      } catch (e: any) {
        console.warn('[RetryAgent] Could not parse report:', e.message);
      }
    }
    if (!failedScenarios.length) {
      const outPath = path.join(process.cwd(), 'reports/ai', 'retry-report.md');
      fs.ensureDirSync(path.dirname(outPath));
      fs.writeFileSync(outPath, '# Retry Report\n\nNo failed scenarios to retry.\n', 'utf8');
      return { ok: true, skipped: true, reason: 'No failures found' };
    }
    console.log(`[RetryAgent] ${failedScenarios.length} failed scenarios to retry`);
    const state = loadState();
    const retryRun: Record<string, any> = {
      runId: input.runId || `retry-${Date.now()}`,
      startedAt: new Date().toISOString(),
      maxRetries,
      retryDelay,
      backoffFactor,
      failedScenarios: failedScenarios.map(s => s.name),
      attempts: [] as any[]
    };
    let allPassed = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delay = retryDelay * Math.pow(backoffFactor, attempt - 1);
      console.log(`[RetryAgent] Retry attempt ${attempt}/${maxRetries} (waiting ${delay}ms)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      const tagExpressions = failedScenarios
        .filter(s => s.name)
        .map(s => `"${s.name.replace(/"/g, '\\"')}"`)
        .join(' or ');
      const env = { ...process.env };
      const cucumberBin = require('path').join(process.cwd(), 'node_modules', '.bin', 'cucumber-js');
      const result = spawnSync(cucumberBin, [
        '--config', 'cucumber.js',
        '--name', tagExpressions
      ], { stdio: 'pipe', encoding: 'utf8', env, shell: false });
      const attemptInfo = {
        attempt,
        exitCode: result && typeof result.status === 'number' ? result.status : -1,
        stdout: (result.stdout || '').slice(-1000),
        stderr: (result.stderr || '').slice(-1000)
      };
      retryRun.attempts.push(attemptInfo);
      if (attemptInfo.exitCode === 0) {
        allPassed = true;
        break;
      }
    }
    retryRun.completedAt = new Date().toISOString();
    retryRun.allPassed = allPassed;
    state.retryHistory.push(retryRun);
    state.currentRetry = retryRun;
    saveState(state);
    const outPath = path.join(process.cwd(), 'reports/ai', 'retry-report.md');
    fs.ensureDirSync(path.dirname(outPath));
    const lines: any[] = [];
    lines.push('# Retry Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Run ID: ${retryRun.runId}`);
    lines.push(`Failed Scenarios: ${failedScenarios.length}`);
    lines.push(`Max Retries: ${maxRetries}`);
    lines.push(`Overall Result: ${allPassed ? 'All retries passed' : 'Some failures remain after retries'}`);
    lines.push('');
    lines.push('## Retry Attempts');
    lines.push('');
    for (const a of retryRun.attempts) {
      lines.push(`### Attempt ${a.attempt}`);
      lines.push(`- **Exit Code**: ${a.exitCode}`);
      lines.push(`- **Status**: ${a.exitCode === 0 ? 'PASSED' : 'FAILED'}`);
      lines.push('');
    }
    lines.push('## Failed Scenarios');
    lines.push('');
    for (const s of failedScenarios) {
      lines.push(`- ${s.name} (${s.feature})`);
    }
    lines.push('');
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    return {
      ok: allPassed,
      report: path.relative(process.cwd(), outPath),
      failedScenarios: failedScenarios.length,
      attempts: retryRun.attempts.length,
      allPassed
    };
  };
export const getRetryHistory = function() {
    const state = loadState();
    return state.retryHistory;
  };
export default { run: async function run(input: any = {}) {
    console.log('[RetryAgent] Managing retry logic');
    const maxRetries = input.maxRetries || 2;
    const retryDelay = input.retryDelay || 5000;
    const backoffFactor = input.backoffFactor || 2;
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    const failedScenarios: any[] = [];
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        for (const feature of features) {
          for (const element of (feature.elements || [])) {
            if (element.type !== 'scenario') continue;
            const failedStep = (element.steps || []).find((s: any) => s.result?.status === 'failed');
            if (failedStep) {
              const tags = (element.tags || []).map((t: any) => t.name).join(' ');
              failedScenarios.push({
                name: element.name,
                feature: feature.name || 'unknown',
                uri: feature.uri || '',
                line: element.line || 0,
                tags: tags,
                failedStep: failedStep.name || '',
                error: failedStep.result?.error_message || ''
              });
            }
          }
        }
      } catch (e: any) {
        console.warn('[RetryAgent] Could not parse report:', e.message);
      }
    }
    if (!failedScenarios.length) {
      const outPath = path.join(process.cwd(), 'reports/ai', 'retry-report.md');
      fs.ensureDirSync(path.dirname(outPath));
      fs.writeFileSync(outPath, '# Retry Report\n\nNo failed scenarios to retry.\n', 'utf8');
      return { ok: true, skipped: true, reason: 'No failures found' };
    }
    console.log(`[RetryAgent] ${failedScenarios.length} failed scenarios to retry`);
    const state = loadState();
    const retryRun: Record<string, any> = {
      runId: input.runId || `retry-${Date.now()}`,
      startedAt: new Date().toISOString(),
      maxRetries,
      retryDelay,
      backoffFactor,
      failedScenarios: failedScenarios.map(s => s.name),
      attempts: [] as any[]
    };
    let allPassed = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delay = retryDelay * Math.pow(backoffFactor, attempt - 1);
      console.log(`[RetryAgent] Retry attempt ${attempt}/${maxRetries} (waiting ${delay}ms)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      const tagExpressions = failedScenarios
        .filter(s => s.name)
        .map(s => `"${s.name.replace(/"/g, '\\"')}"`)
        .join(' or ');
      const env = { ...process.env };
      const cucumberBin = require('path').join(process.cwd(), 'node_modules', '.bin', 'cucumber-js');
      const result = spawnSync(cucumberBin, [
        '--config', 'cucumber.js',
        '--name', tagExpressions
      ], { stdio: 'pipe', encoding: 'utf8', env, shell: false });
      const attemptInfo = {
        attempt,
        exitCode: result && typeof result.status === 'number' ? result.status : -1,
        stdout: (result.stdout || '').slice(-1000),
        stderr: (result.stderr || '').slice(-1000)
      };
      retryRun.attempts.push(attemptInfo);
      if (attemptInfo.exitCode === 0) {
        allPassed = true;
        break;
      }
    }
    retryRun.completedAt = new Date().toISOString();
    retryRun.allPassed = allPassed;
    state.retryHistory.push(retryRun);
    state.currentRetry = retryRun;
    saveState(state);
    const outPath = path.join(process.cwd(), 'reports/ai', 'retry-report.md');
    fs.ensureDirSync(path.dirname(outPath));
    const lines: any[] = [];
    lines.push('# Retry Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Run ID: ${retryRun.runId}`);
    lines.push(`Failed Scenarios: ${failedScenarios.length}`);
    lines.push(`Max Retries: ${maxRetries}`);
    lines.push(`Overall Result: ${allPassed ? 'All retries passed' : 'Some failures remain after retries'}`);
    lines.push('');
    lines.push('## Retry Attempts');
    lines.push('');
    for (const a of retryRun.attempts) {
      lines.push(`### Attempt ${a.attempt}`);
      lines.push(`- **Exit Code**: ${a.exitCode}`);
      lines.push(`- **Status**: ${a.exitCode === 0 ? 'PASSED' : 'FAILED'}`);
      lines.push('');
    }
    lines.push('## Failed Scenarios');
    lines.push('');
    for (const s of failedScenarios) {
      lines.push(`- ${s.name} (${s.feature})`);
    }
    lines.push('');
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    return {
      ok: allPassed,
      report: path.relative(process.cwd(), outPath),
      failedScenarios: failedScenarios.length,
      attempts: retryRun.attempts.length,
      allPassed
    };
  }, getRetryHistory: function() {
    const state = loadState();
    return state.retryHistory;
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Retry Agent",
  "version": "1.0.0",
  "description": "Smart retry logic with backoff for failed tests",
  "dependencies": ["failureAnalysisAgent","RCAAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "retry",
    "execution"
  ],
  "executionStage": "execution",
  "priority": 60,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 3,
    "backoff": "exponential"
  },
  "lifecycle": "active"
};
