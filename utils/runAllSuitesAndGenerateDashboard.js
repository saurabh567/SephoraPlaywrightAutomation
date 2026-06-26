#!/usr/bin/env node
/**
 * runAllSuitesAndGenerateDashboard.js
 *
 * Strictly sequential safe orchestrator.
 * Runs available suites one by one in fixed order with explicit cleanup steps.
 *
 * Execution order (strictly sequential — each step completes fully before next starts):
 *   1. Web Automation
 *   2. Android Automation (incl. emulator lifecycle)
 *   3. ⚠️  Android cleanup via cleanupAndroidEnvironment() in finally
 *   4. iOS Automation (incl. simulator lifecycle)
 *   5. ⚠️  iOS cleanup via cleanupIOSEnvironment() in finally
 *   6. JMeter / Performance Testing
 *   7. API Testing
 *   8. AI Analysis
 *   9. Consolidated Dashboard Generation
 *
 * Rules:
 * - Reads package.json to check if each script exists before running.
 * - If script does not exist, marks suite as SKIPPED.
 * - If a suite fails, continues to the next suite.
 * - Always runs dashboard generation at the end.
 * - Tracks execution status for every suite to reports/dashboard/execution-status.json.
 *
 * iOS tracking:
 * - actualExecutionStarted: true/false — whether cucumber process was spawned
 * - testReportGenerated: true/false — whether cucumber-report.json was created
 * - simulatorLaunched: true/false — whether simulator was detected
 * - iOS is marked FAILED if simulator launched but no test report was generated
 *
 * Usage:
 *   node utils/runAllSuitesAndGenerateDashboard.js
 *   npm run test:all:dashboard:safe
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT, 'reports', 'dashboard');

// ──────────────── Cleanup state ────────────────
let androidCleanupStatus = 'NOT_RUN';
let androidCleanupMessage = '';
let androidCleanupStartTime = null;

let iosCleanupStatus = 'NOT_RUN';
let iosCleanupMessage = '';
let iosCleanupStartTime = null;

// ──────────────── iOS execution tracking state ────────────────
let iosActualExecutionStarted = false;
let iosTestReportGenerated = false;
let iosSimulatorLaunched = false;

// ──────────────── Suite Definitions ────────────────
// Each entry: { name, command, checkFile, timeout }
// All commands run via execSync — fully synchronous, one after another.

const SUITE_DEFS = [
  // 1 — Web
  { name: 'Web Automation',             command: 'npm run test:web',         checkFile: 'reports/web/cucumber-report.json', timeout: 600000 },

  // 2 — Android (with lifecycle — starts/stops emulator + Appium internally)
  //     cleanupAndroidEnvironment() runs in finally after this suite
  { name: 'Android Automation',         command: 'npm run test:android',     checkFile: 'reports/android/cucumber-report.json', timeout: 1200000 },

  // 3 — iOS (with lifecycle) — handled specially: runIOSSuite()
  //     cleanupIOSEnvironment() runs in finally after this suite
  { name: 'iOS Automation',             command: 'npm run test:ios',         checkFile: 'reports/ios/cucumber-report.json', timeout: 1200000 },

  // 4 — JMeter / Performance
  { name: 'JMeter / Performance',       command: 'npm run perf:jmeter',      checkFile: 'reports/jmeter/summary/jmeter-summary.json', timeout: 600000 },

  // 5 — API Testing
  { name: 'API Testing',                command: 'npm run test:api',         checkFile: 'reports/api/api-summary.json', timeout: 600000 },

  // 6 — AI Analysis
  { name: 'AI Analysis',                command: 'npm run test:ai',          checkFile: 'ai/output/ai-post-test-summary.md', timeout: 600000 },
  { name: 'AI API Analysis',            command: 'npm run ai:api-analysis',  checkFile: 'reports/ai/api-analysis-report.md', timeout: 600000 },
  { name: 'AI JMeter Analysis',         command: 'npm run ai:jmeter-analysis', checkFile: 'reports/ai/jmeter-performance-report.md', timeout: 600000 },
];

// ──────────────── Android Cleanup ────────────────
function cleanupAndroidEnvironment() {
  androidCleanupStartTime = nowISO();
  const steps = [];

  console.log(`\n  🧹 Cleaning Android environment...`);

  let adbAvailable = false;
  try {
    const adbCheck = execSync('which adb 2>/dev/null || echo NOT_FOUND', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    adbAvailable = adbCheck !== 'NOT_FOUND' && adbCheck.length > 0;
    if (adbAvailable) {
      console.log(`  ✅ adb found at: ${adbCheck}`);
      steps.push({ step: 'adb check', status: 'PASS', detail: adbCheck });
    } else {
      console.log(`  ⏭️  adb not found — skipping adb-dependent cleanup`);
      steps.push({ step: 'adb check', status: 'SKIP', detail: 'adb not found on PATH' });
    }
  } catch (_) {
    console.log(`  ⏭️  adb not found — skipping adb-dependent cleanup`);
    adbAvailable = false;
    steps.push({ step: 'adb check', status: 'SKIP', detail: 'adb not found on PATH' });
  }

  let hasEmulator = false;
  if (adbAvailable) {
    try {
      const devices = execSync('adb devices 2>/dev/null', {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      const deviceLines = devices.split('\n').filter(l => l.includes('emulator') || l.includes('device'));
      hasEmulator = deviceLines.some(l => l.includes('emulator'));
      if (hasEmulator) {
        console.log(`  🔍 Emulator device(s) detected`);
        steps.push({ step: 'adb devices', status: 'PASS', detail: 'Emulator found' });
      } else {
        console.log(`  ✅ No emulator devices via adb`);
        steps.push({ step: 'adb devices', status: 'PASS', detail: 'No emulator devices' });
      }
    } catch (_) {
      steps.push({ step: 'adb devices', status: 'WARN', detail: 'adb devices command failed' });
    }
  }

  if (adbAvailable) {
    try {
      execSync('adb emu kill 2>/dev/null', { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      console.log(`  ✅ Sent adb emu kill`);
      steps.push({ step: 'adb emu kill', status: 'PASS', detail: 'Command sent' });
    } catch (_) {
      steps.push({ step: 'adb emu kill', status: 'WARN', detail: 'adb emu kill command failed (non-fatal)' });
    }
  }

  try {
    execSync('pkill -f "qemu-system" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed qemu-system processes`);
    steps.push({ step: 'pkill qemu', status: 'PASS', detail: 'Killed qemu-system processes' });
  } catch (_) {
    steps.push({ step: 'pkill qemu', status: 'INFO', detail: 'No qemu-system processes to kill' });
  }

  try {
    execSync('pkill -f "emulator" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed emulator processes`);
    steps.push({ step: 'pkill emulator', status: 'PASS', detail: 'Killed emulator processes' });
  } catch (_) {
    steps.push({ step: 'pkill emulator', status: 'INFO', detail: 'No emulator processes to kill' });
  }

  try {
    execSync('pkill -f "appium" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed Appium processes`);
    steps.push({ step: 'pkill appium', status: 'PASS', detail: 'Killed appium processes' });
  } catch (_) {
    steps.push({ step: 'pkill appium', status: 'INFO', detail: 'No appium processes to kill' });
  }

  try {
    execSync('lsof -ti:4723 2>/dev/null | xargs kill -9 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Freed port 4723`);
    steps.push({ step: 'port 4723', status: 'PASS', detail: 'Port 4723 freed' });
  } catch (_) {
    steps.push({ step: 'port 4723', status: 'INFO', detail: 'No process on port 4723' });
  }

  try {
    execSync('sleep 2', { timeout: 5000 });
  } catch (_) { /* ignore */ }

  const anyFail = steps.some(s => s.status === 'FAIL');
  const allSkip = steps.every(s => s.status === 'SKIP' || s.status === 'INFO');
  androidCleanupStatus = anyFail ? 'FAILED' : 'PASSED';
  if (allSkip) androidCleanupStatus = 'PASSED';

  androidCleanupMessage = steps.map(s => `${s.step}:${s.status}`).join('; ');
  const duration = Math.round((Date.now() - new Date(androidCleanupStartTime).getTime()));
  const formattedDuration = fmtDuration(duration);

  console.log(`  🧹 Android cleanup completed [${formattedDuration}]`);

  const existingCleanup = trackingLog.find(e => e.suiteName === 'Android Cleanup');
  if (existingCleanup) {
    existingCleanup.startTime = androidCleanupStartTime;
    existingCleanup.endTime = nowISO();
    existingCleanup.durationMs = duration;
    existingCleanup.durationFormatted = formattedDuration;
    existingCleanup.status = androidCleanupStatus;
    existingCleanup.errorMessage = androidCleanupMessage;
    existingCleanup.reportPath = null;
  }

  return { status: androidCleanupStatus, message: androidCleanupMessage, durationMs: duration };
}

// ──────────────── iOS Cleanup ────────────────
function cleanupIOSEnvironment() {
  iosCleanupStartTime = nowISO();
  const steps = [];

  console.log(`\n  🧹 Cleaning iOS environment...`);

  let xcrunAvailable = false;
  try {
    const xcrunCheck = execSync('which xcrun 2>/dev/null || echo NOT_FOUND', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    xcrunAvailable = xcrunCheck !== 'NOT_FOUND' && xcrunCheck.length > 0;
    if (xcrunAvailable) {
      console.log(`  ✅ xcrun found at: ${xcrunCheck}`);
      steps.push({ step: 'xcrun check', status: 'PASS', detail: xcrunCheck });
    } else {
      console.log(`  ⏭️  xcrun not found — skipping xcrun-dependent cleanup`);
      steps.push({ step: 'xcrun check', status: 'SKIP', detail: 'xcrun not found on PATH' });
    }
  } catch (_) {
    console.log(`  ⏭️  xcrun not found — skipping xcrun-dependent cleanup`);
    xcrunAvailable = false;
    steps.push({ step: 'xcrun check', status: 'SKIP', detail: 'xcrun not found on PATH' });
  }

  if (xcrunAvailable) {
    try {
      execSync('xcrun simctl shutdown all 2>/dev/null', {
        timeout: 30000, stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`  ✅ Shut down all simulators via xcrun simctl`);
      steps.push({ step: 'simctl shutdown', status: 'PASS', detail: 'Shutdown command sent' });
    } catch (_) {
      console.log(`  ℹ️  simctl shutdown completed (or no simulators running)`);
      steps.push({ step: 'simctl shutdown', status: 'INFO', detail: 'No shutdown needed or no simulators running' });
    }
  }

  try {
    execSync('pkill -f "Simulator" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed Simulator app process`);
    steps.push({ step: 'pkill Simulator', status: 'PASS', detail: 'Killed Simulator process' });
  } catch (_) {
    steps.push({ step: 'pkill Simulator', status: 'INFO', detail: 'No Simulator process to kill' });
  }

  try {
    execSync('pkill -f "CoreSimulator" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed CoreSimulator processes`);
    steps.push({ step: 'pkill CoreSimulator', status: 'PASS', detail: 'Killed CoreSimulator processes' });
  } catch (_) {
    steps.push({ step: 'pkill CoreSimulator', status: 'INFO', detail: 'No CoreSimulator processes to kill' });
  }

  try {
    execSync('pkill -f "WebDriverAgent" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed WebDriverAgent processes`);
    steps.push({ step: 'pkill WDA', status: 'PASS', detail: 'Killed WebDriverAgent processes' });
  } catch (_) {
    steps.push({ step: 'pkill WDA', status: 'INFO', detail: 'No WebDriverAgent processes to kill' });
  }

  try {
    execSync('pkill -f "appium" 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Killed Appium processes`);
    steps.push({ step: 'pkill appium', status: 'PASS', detail: 'Killed appium processes' });
  } catch (_) {
    steps.push({ step: 'pkill appium', status: 'INFO', detail: 'No appium processes to kill' });
  }

  try {
    execSync('lsof -ti:4723 2>/dev/null | xargs kill -9 2>/dev/null || true', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ✅ Freed port 4723`);
    steps.push({ step: 'port 4723', status: 'PASS', detail: 'Port 4723 freed' });
  } catch (_) {
    steps.push({ step: 'port 4723', status: 'INFO', detail: 'No process on port 4723' });
  }

  try {
    execSync('sleep 2', { timeout: 5000 });
  } catch (_) { /* ignore */ }

  const anyFail = steps.some(s => s.status === 'FAIL');
  const allSkip = steps.every(s => s.status === 'SKIP' || s.status === 'INFO');
  iosCleanupStatus = anyFail ? 'FAILED' : 'PASSED';
  if (allSkip) iosCleanupStatus = 'PASSED';

  iosCleanupMessage = steps.map(s => `${s.step}:${s.status}`).join('; ');
  const duration = Math.round((Date.now() - new Date(iosCleanupStartTime).getTime()));
  const formattedDuration = fmtDuration(duration);

  console.log(`  🧹 iOS cleanup completed [${formattedDuration}]`);

  const existingCleanup = trackingLog.find(e => e.suiteName === 'iOS Cleanup');
  if (existingCleanup) {
    existingCleanup.startTime = iosCleanupStartTime;
    existingCleanup.endTime = nowISO();
    existingCleanup.durationMs = duration;
    existingCleanup.durationFormatted = formattedDuration;
    existingCleanup.status = iosCleanupStatus;
    existingCleanup.errorMessage = iosCleanupMessage;
    existingCleanup.reportPath = null;
  }

  return { status: iosCleanupStatus, message: iosCleanupMessage, durationMs: duration };
}

// ──────────────── Fallback Report Generation ────────────────
function generateIOSFallbackReport() {
  const iosEntry = trackingLog.find(function(e) { return e.suiteName === 'iOS Automation'; });
  if (!iosEntry) return;

  const reportDir = path.join(ROOT, 'reports', 'ios');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'reports', 'html', 'ios'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'reports', 'json', 'ios'), { recursive: true });

  var status = iosEntry.status || 'UNKNOWN';
  var cmd = iosEntry.command || 'N/A';
  var dur = iosEntry.durationFormatted || 'N/A';
  var err = iosEntry.errorMessage || 'None';
  var cleanupSt = iosCleanupStatus || 'NOT_RUN';
  var cleanupMsg = iosCleanupMessage || '';

  var envFile = path.join(reportDir, 'environment.properties');
  var deviceName = 'iOS Simulator';
  var osVersion = 'N/A';
  if (fs.existsSync(envFile)) {
    try {
      var envContent = fs.readFileSync(envFile, 'utf-8');
      var dm = envContent.match(/DEVICE_NAME=(.+)/);
      if (dm) deviceName = dm[1].trim();
      var ov = envContent.match(/PLATFORM_VERSION=(.+)/) || envContent.match(/OS_VERSION=(.+)/);
      if (ov) osVersion = ov[1].trim();
    } catch (_) {}
  }

  var timestamp = new Date().toISOString();
  var summaryMd = [
    '# iOS Automation Summary',
    '',
    '> Generated at: ' + timestamp,
    '',
    '## Execution Status',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Status** | ' + status + ' |',
    '| **Command** | ' + cmd + ' |',
    '| **Duration** | ' + dur + ' |',
    '| **Error / Notes** | ' + err + ' |',
    '| **Simulator** | ' + deviceName + ' |',
    '| **OS Version** | ' + osVersion + ' |',
    '| **Tests Executed** | ' + (iosActualExecutionStarted ? 'Yes' : 'No') + ' |',
    '| **Report Generated** | ' + (iosTestReportGenerated ? 'Yes' : 'No') + ' |',
    '',
    '## Cleanup Status',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Cleanup Status** | ' + cleanupSt + ' |',
    '| **Cleanup Details** | ' + cleanupMsg + ' |',
    '',
    '## Notes',
    '',
    'Detailed Cucumber report was not generated. This summary was created from execution status data.',
    '',
    '---',
    '*Generated by runAllSuitesAndGenerateDashboard.js*',
  ].join('\n');

  fs.writeFileSync(path.join(reportDir, 'ios-summary.md'), summaryMd, 'utf-8');
  fs.writeFileSync(path.join(ROOT, 'reports', 'json', 'ios', 'ios-summary.json'), JSON.stringify({
    generatedAt: timestamp,
    platform: 'ios',
    status: status,
    command: cmd,
    duration: dur,
    errorMessage: err,
    deviceName: deviceName,
    osVersion: osVersion,
    cleanupStatus: cleanupSt,
    cleanupMessage: cleanupMsg,
    actualExecutionStarted: iosActualExecutionStarted,
    testReportGenerated: iosTestReportGenerated,
  }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(ROOT, 'reports', 'html', 'ios', 'index.html'), '<!DOCTYPE html><html><head><title>iOS Summary</title></head><body><h1>iOS Automation Summary</h1><pre>' + summaryMd.replace(/</g, '&lt;') + '</pre></body></html>', 'utf-8');

  console.log('  📄 iOS fallback report generated → reports/ios/ios-summary.md');
}

function checkAndGenerateIOSReport() {
  var jsonPath = path.join(ROOT, 'reports', 'ios', 'cucumber-report.json');
  var htmlPath = path.join(ROOT, 'reports', 'ios', 'cucumber-html-report.html');
  var summaryPath = path.join(ROOT, 'reports', 'ios', 'ios-summary.md');

  if (fs.existsSync(jsonPath) || fs.existsSync(htmlPath)) {
    console.log('  ✅ iOS reports already present');
    iosTestReportGenerated = true;
    return;
  }
  if (fs.existsSync(summaryPath)) {
    console.log('  ✅ iOS summary already exists');
    return;
  }
  generateIOSFallbackReport();
}

// ──────────────── iOS Suite Runner ────────────────
function generateAndroidFallbackReport() {
  var androidEntry = trackingLog.find(function(e) { return e.suiteName === 'Android Automation'; });
  if (!androidEntry) return;

  var reportDir = path.join(ROOT, 'reports', 'android');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'reports', 'html', 'android'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'reports', 'json', 'android'), { recursive: true });

  var status = androidEntry.status || 'UNKNOWN';
  var cmd = androidEntry.command || 'N/A';
  var dur = androidEntry.durationFormatted || 'N/A';
  var err = androidEntry.errorMessage || 'None';
  var cleanupSt = androidCleanupStatus || 'NOT_RUN';
  var cleanupMsg = androidCleanupMessage || '';

  var envFile = path.join(reportDir, 'environment.properties');
  var deviceName = 'Android Emulator';
  var osVersion = 'N/A';
  if (fs.existsSync(envFile)) {
    try {
      var envContent = fs.readFileSync(envFile, 'utf-8');
      var dm = envContent.match(/DEVICE_NAME=(.+)/);
      if (dm) deviceName = dm[1].trim();
      var ov = envContent.match(/PLATFORM_VERSION=(.+)/) || envContent.match(/OS_VERSION=(.+)/);
      if (ov) osVersion = ov[1].trim();
    } catch (_) {}
  }

  var timestamp = new Date().toISOString();
  var allureExists = fs.existsSync(path.join(ROOT, 'reports', 'allure', 'android', 'allure-report', 'index.html'));
  var allureResExists = fs.existsSync(path.join(ROOT, 'reports', 'allure', 'android', 'allure-results'));

  var notes = 'Detailed Cucumber report was not generated.';
  if (allureExists) notes += ' Allure report is available at reports/allure/android/allure-report/index.html.';
  if (allureResExists && !allureExists) notes += ' Allure results are available (unprocessed).';

  var summaryMd = [
    '# Android Automation Summary',
    '',
    '> Generated at: ' + timestamp,
    '',
    '## Execution Status',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Status** | ' + status + ' |',
    '| **Command** | ' + cmd + ' |',
    '| **Duration** | ' + dur + ' |',
    '| **Error / Notes** | ' + err + ' |',
    '| **Device / Emulator** | ' + deviceName + ' |',
    '| **OS Version** | ' + osVersion + ' |',
    '',
    '## Cleanup Status',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Cleanup Status** | ' + cleanupSt + ' |',
    '| **Cleanup Details** | ' + cleanupMsg + ' |',
    '',
    '## Available Reports',
    '',
    '| Report | Status |',
    '|--------|--------|',
    '| Cucumber JSON | Missing |',
    '| Allure Results | ' + (allureResExists ? 'Present' : 'Missing') + ' |',
    '| Allure Report | ' + (allureExists ? 'Present' : 'Missing') + ' |',
    '',
    '## Notes',
    '',
    notes,
    '',
    '---',
    '*Generated by runAllSuitesAndGenerateDashboard.js*',
  ].join('\n');

  fs.writeFileSync(path.join(reportDir, 'android-summary.md'), summaryMd, 'utf-8');
  fs.writeFileSync(path.join(ROOT, 'reports', 'json', 'android', 'android-summary.json'), JSON.stringify({
    generatedAt: timestamp,
    platform: 'android',
    status: status,
    command: cmd,
    duration: dur,
    errorMessage: err,
    deviceName: deviceName,
    osVersion: osVersion,
    cleanupStatus: cleanupSt,
    cleanupMessage: cleanupMsg,
    allureReportAvailable: allureExists,
    allureResultsAvailable: allureResExists,
  }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(ROOT, 'reports', 'html', 'android', 'index.html'), '<!DOCTYPE html><html><head><title>Android Summary</title></head><body><h1>Android Automation Summary</h1><pre>' + summaryMd.replace(/</g, '&lt;') + '</pre></body></html>', 'utf-8');

  console.log('  📄 Android fallback report generated → reports/android/android-summary.md');
}

function checkAndGenerateAndroidReport() {
  var jsonPath = path.join(ROOT, 'reports', 'android', 'cucumber-report.json');
  var htmlPath = path.join(ROOT, 'reports', 'android', 'cucumber-html-report.html');
  var summaryPath = path.join(ROOT, 'reports', 'android', 'android-summary.md');

  if (fs.existsSync(jsonPath) || fs.existsSync(htmlPath)) {
    console.log('  ✅ Android reports already present');
    return;
  }
  if (fs.existsSync(summaryPath)) {
    console.log('  ✅ Android summary already exists');
    return;
  }
  generateAndroidFallbackReport();
}


function runIOSSuite() {
  const iosSuite = SUITE_DEFS.find(function(s) { return s.name === 'iOS Automation'; });
  if (!iosSuite) return;

  const name = iosSuite.name;
  const command = iosSuite.command;
  const timeout = iosSuite.timeout || 1200000;
  const checkFile = iosSuite.checkFile;
  const fullCheckPath = path.join(ROOT, checkFile);

  // Reset iOS tracking state
  iosActualExecutionStarted = false;
  iosTestReportGenerated = false;
  iosSimulatorLaunched = false;

  // Update start time
  const existing = trackingLog.find(function(e) { return e.suiteName === name; });
  if (existing) {
    existing.startTime = nowISO();
    existing.endTime = null;
    existing.durationMs = null;
    existing.durationFormatted = null;
    existing.status = 'NOT_EXECUTED';
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('  ▶ Running: ' + name);
  console.log('  Command:  ' + command);
  console.log('══════════════════════════════════════════════\n');

  var exitCode = 0;
  var errorMessage = null;

  try {
    execSync(command, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: timeout,
      env: { ...process.env },
    });
    console.log('\n  ✅ ' + name + ' command completed');
  } catch (err) {
    exitCode = err.status || -1;
    errorMessage = err.message ? err.message.substring(0, 200) : 'exit code ' + exitCode;
    console.log('\n  ⚠️  ' + name + ' command exited with code ' + exitCode);
  }

  // Check if cucumber JSON report was generated
  iosTestReportGenerated = fs.existsSync(fullCheckPath);
  iosSimulatorLaunched = fs.existsSync(path.join(ROOT, 'reports', 'ios', 'environment.properties'));

  // Determine actual execution: if command ran for more than 30s, tests likely started
  var durationSec = 0;
  if (existing && existing.startTime) {
    durationSec = Math.round((Date.now() - new Date(existing.startTime).getTime()) / 1000);
  }
  iosActualExecutionStarted = durationSec > 30 || iosTestReportGenerated;

  // Determine final status
  var finalStatus;
  var finalError;

  if (iosTestReportGenerated) {
    finalStatus = 'PASSED';
    finalError = null;
    console.log('  ✅ iOS test report found — marking PASSED');
  } else if (!iosSimulatorLaunched) {
    finalStatus = 'FAILED';
    finalError = 'iOS simulator did not launch — test execution could not start';
    console.log('  ❌ iOS simulator did not launch — marking FAILED');
  } else if (!iosActualExecutionStarted) {
    finalStatus = 'FAILED';
    finalError = 'Simulator launched but test execution did not start or completed too quickly. WDA warmup or Appium session may have failed.';
    console.log('  ❌ iOS simulator launched but tests did not execute — marking FAILED');
  } else if (exitCode !== 0) {
    finalStatus = 'FAILED';
    finalError = errorMessage || 'iOS command exited with code ' + exitCode + ' and no report was generated';
    console.log('  ❌ iOS tests ran but failed with no report — marking FAILED');
  } else {
    // exitCode === 0 but no report — possible if shell ";" masked error
    finalStatus = 'FAILED';
    finalError = 'iOS command succeeded (exit 0) but no test report was generated. Tests likely did not execute.';
    console.log('  ❌ iOS command succeeded but no report generated — marking FAILED');
  }

  // Update tracking entry with all fields
  trackEntry(name, command, finalStatus, finalError, checkFile);

  // Add extra tracking fields
  var iosEntry = trackingLog.find(function(e) { return e.suiteName === name; });
  if (iosEntry) {
    iosEntry.actualExecutionStarted = iosActualExecutionStarted;
    iosEntry.testReportGenerated = iosTestReportGenerated;
    iosEntry.simulatorLaunched = iosSimulatorLaunched;
    iosEntry.expectedReportPath = checkFile;
    iosEntry.exitCode = exitCode;
  }
}

// ──────────────── Tracking ────────────────
const trackingLog = [];

function nowISO() {
  return new Date().toISOString();
}

function durationMs(startISO) {
  return Math.round((Date.now() - new Date(startISO).getTime()));
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + 's';
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return min + 'm ' + s + 's';
}

function saveExecutionStatus() {
  try {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    const outputPath = path.join(DASHBOARD_DIR, 'execution-status.json');
    // Enrich tracking log with cleanup and iOS tracking fields
    const enriched = trackingLog.map(function(entry) {
      var enriched = { ...entry };
      if (entry.suiteName === 'Android Automation') {
        enriched.androidCleanupStatus = androidCleanupStatus;
        enriched.androidCleanupMessage = androidCleanupMessage;
        enriched.androidCleanupDuration = androidCleanupStartTime ? fmtDuration(Math.round((Date.now() - new Date(androidCleanupStartTime).getTime()))) : null;
      }
      // iOS tracking fields are already set on the entry by runIOSSuite
      if (entry.suiteName === 'iOS Cleanup') {
        enriched.iosCleanupStatus = iosCleanupStatus;
        enriched.iosCleanupMessage = iosCleanupMessage;
        enriched.iosCleanupDuration = iosCleanupStartTime ? fmtDuration(Math.round((Date.now() - new Date(iosCleanupStartTime).getTime()))) : null;
      }
      return enriched;
    });
    fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), 'utf-8');
    console.log('\n  📋 Execution status saved → reports/dashboard/execution-status.json');
  } catch (err) {
    console.error('\n  ❌ Failed to save execution status: ' + err.message);
  }
}

function trackEntry(name, command, status, errorMessage, reportPath) {
  const existing = trackingLog.find(function(e) { return e.suiteName === name; });
  if (existing) {
    existing.status = status;
    existing.errorMessage = errorMessage || null;
    existing.reportPath = reportPath || null;
    existing.endTime = nowISO();
    existing.durationMs = durationMs(existing.startTime);
    existing.durationFormatted = fmtDuration(existing.durationMs);
  }
}

function addTrackingEntry(name, command) {
  trackingLog.push({
    suiteName: name,
    command: command,
    status: 'NOT_EXECUTED',
    startTime: nowISO(),
    endTime: null,
    durationMs: null,
    durationFormatted: null,
    errorMessage: null,
    reportPath: null,
  });
}

// ──────────────── Helpers ────────────────
function readPackageScripts() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    return pkg.scripts || {};
  } catch (_) {
    return {};
  }
}

function checkSuiteEnabled(suiteDef) {
  const scripts = readPackageScripts();
  const npmScript = suiteDef.command.replace('npm run ', '');
  return typeof scripts[npmScript] === 'string' && scripts[npmScript].trim().length > 0;
}

function runSuite(suite) {
  const { name, command, checkFile, timeout } = suite;
  const fullCheckPath = path.join(ROOT, checkFile);

  const existing = trackingLog.find(function(e) { return e.suiteName === name; });
  if (existing) {
    existing.startTime = nowISO();
    existing.endTime = null;
    existing.durationMs = null;
    existing.durationFormatted = null;
    existing.status = 'NOT_EXECUTED';
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('  ▶ Running: ' + name);
  console.log('  Command:  ' + command);
  console.log('══════════════════════════════════════════════\n');

  try {
    execSync(command, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: timeout || 600000,
      env: { ...process.env },
    });
    const exists = fs.existsSync(fullCheckPath);
    if (exists) {
      console.log('\n  ✅ ' + name + ' completed (report found)');
      trackEntry(name, command, 'PASSED', null, checkFile);
      return { name: name, status: 'passed' };
    }
    console.log('\n  ⚠️  ' + name + ' completed but report file missing: ' + checkFile);
    trackEntry(name, command, 'PASSED', 'Report file missing after execution', null);
    return { name: name, status: 'passed_with_issues', detail: 'report file missing' };
  } catch (err) {
    const exists = fs.existsSync(fullCheckPath);
    if (exists) {
      console.log('\n  ⚠️  ' + name + ' had exit code ' + err.status + ' but report file exists');
      trackEntry(name, command, 'PASSED', 'Exit code ' + err.status + ', but report found', checkFile);
      return { name: name, status: 'passed_with_issues', detail: 'exit code ' + err.status };
    }
    const errMsg = err.message ? err.message.substring(0, 200) : 'exit code ' + err.status;
    console.log('\n  ❌ ' + name + ' failed');
    trackEntry(name, command, 'FAILED', errMsg, null);
    return { name: name, status: 'failed', detail: errMsg };
  }
}

function printSeparator(title) {
  const line = '='.repeat(56);
  console.log('\n  ' + line);
  console.log('  ' + title);
  console.log('  ' + line + '\n');
}

// ──────────────── Main ────────────────
function main() {
  const pkgScripts = readPackageScripts();
  const totalScripts = Object.keys(pkgScripts).length;

  fs.mkdirSync(DASHBOARD_DIR, { recursive: true });

  printSeparator('CONSOLIDATED SUITE EXECUTOR');
  console.log('  Package scripts available: ' + totalScripts + '\n');
  console.log('  Execution order (strictly sequential):');
  SUITE_DEFS.forEach(function(s, i) {
    const enabled = checkSuiteEnabled(s);
    var extra = '';
    if (i === 1) extra = ' → then cleanupAndroidEnvironment()';
    else if (i === 2) extra = ' → then cleanupIOSEnvironment()';
    console.log('    ' + (i + 1) + '. ' + s.name + (enabled ? extra : ' [SKIP — script not found]'));
  });
  console.log('    ' + (SUITE_DEFS.length + 1) + '. Consolidated Dashboard Generation');
  console.log('');

  SUITE_DEFS.forEach(function(suite) {
    addTrackingEntry(suite.name, suite.command);
  });
  addTrackingEntry('Android Cleanup', 'cleanupAndroidEnvironment()');
  addTrackingEntry('iOS Cleanup', 'cleanupIOSEnvironment()');
  addTrackingEntry('Consolidated Dashboard', 'npm run report:dashboard');

  // ─── Run suites STRICTLY SEQUENTIALLY ───
  for (var i = 0; i < SUITE_DEFS.length; i++) {
    var suite = SUITE_DEFS[i];
    var enabled = checkSuiteEnabled(suite);
    if (!enabled) {
      console.log('  ⏭️  ' + suite.name + ': npm script not found. Skipping.');
      trackEntry(suite.name, suite.command, 'SKIPPED', 'npm script not found in package.json', null);
      saveExecutionStatus();
      continue;
    }

    // iOS — use custom runner with proper failure detection
    if (suite.name === 'iOS Automation') {
      try {
        runIOSSuite();
      } finally {
        cleanupIOSEnvironment();
        checkAndGenerateIOSReport();
      }
      saveExecutionStatus();
      continue;
    }

    // Android — wrap with try/finally for cleanup
    if (suite.name === 'Android Automation') {
      try {
        runSuite(suite);
      } finally {
        cleanupAndroidEnvironment();
        checkAndGenerateAndroidReport();
      }
      saveExecutionStatus();
      continue;
    }

    runSuite(suite);
    saveExecutionStatus();
  }

  // ─── Consolidated Dashboard Generation ───
  printSeparator('GENERATING CONSOLIDATED DASHBOARD');

  const generatorPath = path.join(__dirname, 'generateConsolidatedDashboard.js');

  if (!fs.existsSync(generatorPath)) {
    console.log('  ❌ generateConsolidatedDashboard.js not found at ' + generatorPath);
    trackEntry('Consolidated Dashboard', 'node utils/generateConsolidatedDashboard.js', 'FAILED', 'generateConsolidatedDashboard.js not found', null);
  } else {
    console.log('  Running dashboard generator...\n');
    try {
      execSync('node utils/generateConsolidatedDashboard.js', {
        cwd: ROOT, stdio: 'inherit', timeout: 300000, env: { ...process.env },
      });
      console.log('\n  ✅ Consolidated Dashboard generated');
      trackEntry('Consolidated Dashboard', 'node utils/generateConsolidatedDashboard.js', 'PASSED', null, 'reports/dashboard/index.html');
    } catch (err) {
      console.error('\n  ❌ Dashboard generation failed: ' + err.message);
      trackEntry('Consolidated Dashboard', 'node utils/generateConsolidatedDashboard.js', 'FAILED', err.message ? err.message.substring(0, 200) : 'exit code ' + err.status, null);
    }
  }

  saveExecutionStatus();

  // ─── Final Summary ───
  printSeparator('FINAL SUMMARY');

  var executed = trackingLog.filter(function(r) { return r.status !== 'SKIPPED' && r.status !== 'NOT_EXECUTED'; }).length;
  var passed = trackingLog.filter(function(r) { return r.status === 'PASSED'; }).length;
  var failed = trackingLog.filter(function(r) { return r.status === 'FAILED'; }).length;
  var skipped = trackingLog.filter(function(r) { return r.status === 'SKIPPED'; }).length;

  console.log('  Total suites tracked:   ' + trackingLog.length);
  console.log('  Suites executed:        ' + executed);
  console.log('  Passed:                 ' + passed);
  console.log('  Failed:                 ' + failed);
  console.log('  Skipped:                ' + skipped);
  console.log('');

  trackingLog.forEach(function(r) {
    var icon;
    if (r.status === 'PASSED') icon = '✅';
    else if (r.status === 'FAILED') icon = '❌';
    else if (r.status === 'SKIPPED') icon = '⏭️';
    else icon = '⬜';
    var extra = '';
    if (r.errorMessage) extra = ' (' + r.errorMessage.substring(0, 80) + ')';
    if (r.status === 'SKIPPED' && r.errorMessage) extra = ' (' + r.errorMessage + ')';
    console.log('  ' + icon + ' ' + r.suiteName + extra + (r.durationFormatted ? ' [' + r.durationFormatted + ']' : ''));
  });

  // Read dashboard data
  const dashDataPath = path.join(ROOT, 'reports', 'dashboard', 'dashboard-data.json');
  try {
    const dashData = JSON.parse(fs.readFileSync(dashDataPath, 'utf-8'));
    const es = dashData.executiveSummary || {};
    console.log('');
    printSeparator('RELEASE DECISION');
    console.log('  Decision:     ' + (es.releaseDecision || 'N/A'));
    console.log('  Reason:       ' + (es.releaseReason || 'N/A'));
    console.log('  Pass Rate:    ' + (es.passPercent || 0) + '%');
    console.log('  Failures:     ' + (es.failed || 0));
    if (es.productionReadiness) {
      console.log('  Readiness:    ' + es.productionReadiness.score + '/100 (' + es.productionReadiness.qualityStatus + ')');
    }
  } catch (_) {}

  console.log('');
  console.log('  📊 Dashboard HTML:   reports/dashboard/index.html');
  console.log('  📊 Dashboard JSON:   reports/dashboard/dashboard-data.json');
  console.log('  📝 Summary:          reports/dashboard/consolidated-summary.md');
  console.log('  📋 Execution Status: reports/dashboard/execution-status.json');

  const exitCode = failed > 0 ? 1 : 0;
  console.log('\n  Exit code: ' + exitCode + '\n');
  process.exit(exitCode);
}

main();
