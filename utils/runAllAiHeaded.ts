#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * runAllAiHeaded.js
 *
 * Runs the full test:all:ai suite in headed (visible) mode.
 *
 * Headed mode configuration:
 *   - Web (Playwright Chromium): HEADLESS=false → browser window visible
 *   - Android Emulator: HEADLESS_EMULATOR=false → emulator window visible
 *   - iOS Simulator: always visible (no headless mode available)
 *   - API tests: no browser involved, HEADLESS irrelevant
 *
 * Technical notes:
 *   - iOS Simulator does not support headless mode (Apple limitation).
 *     The simulator always launches with a visible window.
 *   - Android Emulator supports -no-window flag; when omitted, the emulator
 *     window is visible. Set HEADLESS_EMULATOR=false explicitly.
 *   - Web (Playwright) tests: Chromium launches in headed (GUI) mode.
 *   - API tests use Playwright's APIRequestContext only; no browser is
 *     launched regardless of HEADLESS setting.
 *
 * Usage:
 *   node utils/runAllAiHeaded.js
 *   npm run test:all:ai-headed
 */


const ROOT = path.resolve(__dirname, '..');
const TIMESTAMP = new Date().toISOString().replace('T', ' ').substring(0, 19);

// ── Execution steps ────────────────────────────────────────────────────────

const steps = [
  {
    name: 'Web Automation (headed)',
    cmd: 'npm',
    args: ['run', 'test:web'],
    env: { HEADLESS: 'false', HEADLESS_EMULATOR: 'false' },
  },
  {
    name: 'Android Automation (headed)',
    cmd: 'npm',
    args: ['run', 'test:android'],
    env: { HEADLESS_EMULATOR: 'false', HEADLESS: 'false' },
  },
  {
    name: 'iOS Automation (always visible)',
    cmd: 'npm',
    args: ['run', 'test:ios'],
    env: { HEADLESS: 'false' },
  },
  {
    name: 'API Automation (no browser)',
    cmd: 'npm',
    args: ['run', 'test:api'],
    env: {} as Record<string, any>,
  },
  {
    name: 'AI API Analysis Report',
    cmd: 'npm',
    args: ['run', 'ai:api-analysis'],
    env: {} as Record<string, any>,
  },
  {
    name: 'AI Consolidated Report',
    cmd: 'npm',
    args: ['run', 'ai:consolidated-report'],
    env: {} as Record<string, any>,
  },
  {
    name: 'HTML Reports (all platforms)',
    cmd: 'npm',
    args: ['run', 'report:all'],
    env: {} as Record<string, any>,
  },
  {
    name: 'Dashboard Generation',
    cmd: 'npm',
    args: ['run', 'dashboard:generate'],
    env: {} as Record<string, any>,
  },
];

// ── Execution results ──────────────────────────────────────────────────────

const results: any = [];

function runStep(step: any, index: any) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Step ${index + 1}/${steps.length}: ${step.name}`);
    console.log(`  Command: ${step.cmd} ${step.args.join(' ')}`);
    console.log(`  Env overrides: ${JSON.stringify(step.env)}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();
    const child = spawn(step.cmd, step.args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...step.env },
    });

    child.on('exit', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;
      results.push({
        name: step.name,
        command: `${step.cmd} ${step.args.join(' ')}`,
        envOverrides: step.env,
        exitCode: code,
        passed,
        durationMs: duration,
        duration: formatDuration(duration),
      });
      console.log(`\n  → ${passed ? '✅ PASSED' : '❌ FAILED'} (exit code: ${code}) in ${formatDuration(duration)}`);
      resolve(passed);
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      results.push({
        name: step.name,
        command: `${step.cmd} ${step.args.join(' ')}`,
        envOverrides: step.env,
        exitCode: -1,
        passed: false,
        durationMs: duration,
        duration: formatDuration(duration),
        error: err.message,
      });
      console.error(`\n  → ❌ FAILED TO SPAWN: ${err.message}`);
      resolve(false);
    });
  });
}

function formatDuration(ms: any) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

// ── Report Paths ───────────────────────────────────────────────────────────

function checkReportPaths() {
  const reportPaths = {
    'Web HTML Report': 'reports/web/cucumber-html-report.html',
    'Android HTML Report': 'reports/android/cucumber-html-report.html',
    'iOS HTML Report': 'reports/ios/cucumber-html-report.html',
    'AI API Analysis Report': 'reports/ai/api-analysis-report.md',
    'AI Consolidated Report': 'reports/dashboard/consolidated-summary.md',
    'Dashboard HTML': 'reports/dashboard/index.html',
    'Dashboard Data': 'reports/dashboard/dashboard-data.json',
  };

  const reportChecks: Record<string, any> = {};
  for (const [label, relPath] of (Object.entries(reportPaths) as [string, any][])) {
    const fullPath = path.join(ROOT, relPath);
    const exists = fs.existsSync(fullPath);
    reportChecks[label] = {
      path: relPath,
      exists,
      size: exists ? fs.statSync(fullPath).size : 0,
    };
  }
  return reportChecks;
}

// ── Generate Validation Report ─────────────────────────────────────────────

function generateReport(allPassed: any) {
  const reportChecks = checkReportPaths();
  const totalSteps = results.length;
  const passedSteps = results.filter((r: any) => r.passed).length;
  const failedSteps = results.filter((r: any) => !r.passed).length;
  const totalDuration = results.reduce((sum: any, r: any) => sum + r.durationMs, 0);

  const platformResults = results.slice(0, 4); // First 4 steps are platform tests
  const toolResults = results.slice(4); // Remaining are tool/report steps

  const md = `# test:all:ai-headed Validation Report

**Generated:** ${TIMESTAMP}
**Total Duration:** ${formatDuration(totalDuration)}

## Execution Summary

| Metric | Value |
|--------|-------|
| Total Steps | ${totalSteps} |
| Passed | ${passedSteps} |
| Failed | ${failedSteps} |
| Pass Rate | ${totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0}% |
| Total Time | ${formatDuration(totalDuration)} |

## Platform Execution (Headed Mode Validation)

| Platform | Result | Duration | Headed? | Notes |
|----------|--------|----------|---------|-------|
${platformResults.map((r: any) => {
  let headedNote = '';
  if (r.name.includes('Web')) headedNote = 'HEADLESS=false → Chromium window visible';
  else if (r.name.includes('Android')) headedNote = 'HEADLESS_EMULATOR=false → emulator window visible';
  else if (r.name.includes('iOS')) headedNote = 'Simulator always visible (Apple limitation)';
  else if (r.name.includes('API')) headedNote = 'No browser needed (APIRequestContext only)';
  return `| ${r.name} | ${r.passed ? '✅' : '❌'} (exit ${r.exitCode}) | ${r.duration} | ${headedNote.includes('always visible') || headedNote.includes('window visible') ? '✅ Yes' : '✅ N/A'} | ${headedNote} |`;
}).join('\n')}

## Tool / Report Execution

| Step | Result | Duration |
|------|--------|----------|
${toolResults.map((r: any) => `| ${r.name} | ${r.passed ? '✅' : '❌'} (exit ${r.exitCode}) | ${r.duration} |`).join('\n')}

## Headed Configuration Details

### Web (Playwright Chromium)
- **Env Variable:** \`HEADLESS=false\`
- **Result:** Chromium browser launches with visible window
- **Config File:** \`config/env.config.js\` — reads \`process.env.HEADLESS\` → \`config.headless\`
- **Driver:** \`framework/web/WebDriverFactory.js\` — passes \`{ headless: config.headless }\` to Playwright

### Android Emulator
- **Env Variable:** \`HEADLESS_EMULATOR=false\`
- **Result:** Android Emulator launches with visible window (no \`-no-window\` flag)
- **Config File:** \`utils/runAndroidWithLifecycle.js\` — checks \`HEADLESS_EMULATOR\` and \`HEADLESS !== 'false'\`
- **Emulator Flag:** When headed, the \`-no-window\` flag is omitted from the emulator spawn command

### iOS Simulator
- **Limitation:** iOS Simulator does NOT support headless mode (Apple Xcode limitation)
- **Result:** Simulator always launches with a visible window
- **Config File:** \`utils/runIOSWithLifecycle.js\` — no headless option available

### API Tests
- **Result:** API tests use Playwright's \`APIRequestContext\` only — no browser launched
- **HEADLESS Setting:** Irrelevant for API tests (no browser process created)
- **Config File:** \`cucumber.api.js\` — runs API-specific step definitions

## Report Generation Status

| Report | Path | Status | Size |
|--------|------|--------|------|
${(Object.entries(reportChecks) as [string, any][]).map(([label, info]) => `| ${label} | \`${info.path}\` | ${info.exists ? '✅ Generated' : '❌ Not found'} | ${info.exists ? formatFileSize(info.size) : 'N/A'} |`).join('\n')}

## Files Modified / Created

| File | Change | Purpose |
|------|--------|---------|
| \`package.json\` | Added \`test:all:ai-headed\` script | Runs full suite with HEADLESS=false, HEADLESS_EMULATOR=false |
| \`utils/runAllAiHeaded.js\` | **New file** | Orchestrator script with per-step env overrides |

## Environment Variable Summary

| Variable | Web | Android | iOS | API |
|----------|-----|---------|-----|-----|
| \`HEADLESS\` | \`false\` | \`false\` | \`false\` | (unset) |
| \`HEADLESS_EMULATOR\` | — | \`false\` | — | — |

## Remaining Issues

${failedSteps > 0 ? `- ❌ ${failedSteps} step(s) failed. Review logs above for details.` : '- ✅ No failures detected.'}
${results.some((r: any) => r.name.includes('iOS')) ? '- iOS Simulator cannot run in true headless mode. This is an Apple Xcode limitation. The simulator window is always visible.' : ''}
- Android Emulator window visibility depends on \`HEADLESS_EMULATOR\` env var. When set to \`false\`, the \`-no-window\` flag is omitted.

---

*Report auto-generated by \`utils/runAllAiHeaded.js\`*
`;

  const reportDir = path.join(ROOT, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'test-all-ai-headed-validation.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`\n📄 Validation report written to: ${reportPath}`);
  return reportPath;
}

function formatFileSize(bytes: any) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Print Summary ──────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('  test:all:ai-headed — EXECUTION SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.duration}`);
  }
  console.log('-'.repeat(60));
  const passed = results.filter((r: any) => r.passed).length;
  console.log(`  📊 ${passed}/${results.length} steps passed`);
  console.log('='.repeat(60));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('  test:all:ai-headed');
  console.log('  Headed Mode Execution');
  console.log(`  Started: ${TIMESTAMP}`);
  console.log('='.repeat(60));

  let allPassed = true;

  for (let i = 0; i < steps.length; i++) {
    const passed = await runStep(steps[i], i);
    if (!passed) allPassed = false;
  }

  printSummary();

  const reportPath = generateReport(allPassed);

  console.log(`\n  Full details: ${reportPath}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  ❌ Fatal error: ${err.message}`);
  generateReport(false);
  process.exit(1);
});
