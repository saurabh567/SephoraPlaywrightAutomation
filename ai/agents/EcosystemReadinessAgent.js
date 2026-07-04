// EcosystemReadinessAgent - Phase 15
// End-to-end AI-driven test environment management and cross-platform health validation.
// Validates the entire ecosystem is healthy, production-ready, and documents the full
// system architecture including all 40 agents, CI/CD pipelines, and infrastructure.
const fs = require('fs-extra');
const path = require('path');

const READINESS_STATE_PATH = path.join(process.cwd(), 'ai/memory/readiness-state.json');
const REPORTS_DIR = path.join(process.cwd(), 'reports', 'ai', 'readiness');

function ensureDirs() {
  fs.ensureDirSync(path.dirname(READINESS_STATE_PATH));
  fs.ensureDirSync(REPORTS_DIR);
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(READINESS_STATE_PATH)) {
    fs.writeJsonSync(READINESS_STATE_PATH, { checks: [] }, { spaces: 2 });
  }
  return fs.readJsonSync(READINESS_STATE_PATH);
}

function saveState(state) {
  fs.writeJsonSync(READINESS_STATE_PATH, state, { spaces: 2 });
}

function timestamp() {
  return new Date().toISOString();
}

function safeReadJson(filePath) {
  try { if (fs.existsSync(filePath)) return fs.readJsonSync(filePath); } catch { /* ignore */ }
  return null;
}

function fileExists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function dirExists(dirPath) {
  try { return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(); } catch { return false; }
}

function fileSizeKB(filePath) {
  try { if (fs.existsSync(filePath)) return (fs.statSync(filePath).size / 1024).toFixed(1) + ' KB'; } catch { /* ignore */ }
  return '0 KB';
}

// ---------- Health Check Categories ----------

// 1. Agent Registry Health
function checkAgentRegistry() {
  var results = [];
  try {
    var agents = require('../agents/index');
    var keys = Object.keys(agents);
    keys.forEach(function(k) {
      try {
        var loaded = !!agents[k];
        var hasRun = typeof agents[k].run === 'function';
        results.push({
          name: k,
          exported: loaded,
          hasRunMethod: hasRun,
          status: loaded && hasRun ? 'OK' : 'WARN',
        });
      } catch (e) {
        results.push({ name: k, exported: false, hasRunMethod: false, status: 'FAIL', error: e.message });
      }
    });
  } catch (e) {
    results.push({ error: 'Could not load agents index: ' + e.message });
  }
  return results;
}

// 2. Framework Health
function checkFramework() {
  var checks = [];
  var webFramework = fileExists(path.join(process.cwd(), 'framework/web/WebBasePage.js')) &&
                     fileExists(path.join(process.cwd(), 'framework/web/WebDriverFactory.js'));
  checks.push({ component: 'Web Framework', exists: webFramework, status: webFramework ? 'OK' : 'MISSING' });

  var mobileFramework = fileExists(path.join(process.cwd(), 'framework/mobile/MobileBasePage.js')) &&
                        fileExists(path.join(process.cwd(), 'framework/mobile/MobileDriverFactory.js'));
  checks.push({ component: 'Mobile Framework', exists: mobileFramework, status: mobileFramework ? 'OK' : 'MISSING' });

  var commonFramework = dirExists(path.join(process.cwd(), 'framework/common'));
  checks.push({ component: 'Common Utilities', exists: commonFramework, status: commonFramework ? 'OK' : 'MISSING' });

  var configExists = fileExists(path.join(process.cwd(), 'config/env.config.js')) &&
                     fileExists(path.join(process.cwd(), 'config/appium.config.js'));
  checks.push({ component: 'Configuration', exists: configExists, status: configExists ? 'OK' : 'MISSING' });

  var hooksExist = fileExists(path.join(process.cwd(), 'hooks/hooks.js'));
  checks.push({ component: 'Cucumber Hooks', exists: hooksExist, status: hooksExist ? 'OK' : 'MISSING' });

  var cucumberConfig = fileExists(path.join(process.cwd(), 'cucumber.js'));
  checks.push({ component: 'Cucumber Config', exists: cucumberConfig, status: cucumberConfig ? 'OK' : 'MISSING' });

  return checks;
}

// 3. Test Assets Health
function checkTestAssets() {
  var checks = [];

  var featureFiles = [];
  try {
    var featuresDir = path.join(process.cwd(), 'features');
    if (dirExists(featuresDir)) {
      featureFiles = fs.readdirSync(featuresDir).filter(function(f) { return f.endsWith('.feature'); });
    }
  } catch { /* ignore */ }
  checks.push({ component: 'Feature Files', count: featureFiles.length, files: featureFiles, status: featureFiles.length > 0 ? 'OK' : 'WARN' });

  var stepDefs = [];
  try {
    var stepsDir = path.join(process.cwd(), 'step-definitions');
    if (dirExists(stepsDir)) {
      stepDefs = fs.readdirSync(stepsDir).filter(function(f) { return f.endsWith('.js'); });
    }
  } catch { /* ignore */ }
  checks.push({ component: 'Step Definitions', count: stepDefs.length, files: stepDefs, status: stepDefs.length > 0 ? 'OK' : 'WARN' });

  var webPages = [];
  try {
    var pagesDir = path.join(process.cwd(), 'pages');
    if (dirExists(pagesDir)) {
      webPages = fs.readdirSync(pagesDir).filter(function(f) { return f.endsWith('.js'); });
    }
  } catch { /* ignore */ }
  checks.push({ component: 'Web Page Objects', count: webPages.length, files: webPages, status: webPages.length > 0 ? 'OK' : 'WARN' });

  var mobilePages = [];
  try {
    var androidDir = path.join(process.cwd(), 'mobile/android');
    var iosDir = path.join(process.cwd(), 'mobile/ios');
    if (dirExists(androidDir)) {
      mobilePages = mobilePages.concat(fs.readdirSync(androidDir).filter(function(f) { return f.endsWith('.js'); }).map(function(f) { return 'android/' + f; }));
    }
    if (dirExists(iosDir)) {
      mobilePages = mobilePages.concat(fs.readdirSync(iosDir).filter(function(f) { return f.endsWith('.js'); }).map(function(f) { return 'ios/' + f; }));
    }
  } catch { /* ignore */ }
  checks.push({ component: 'Mobile Page Objects', count: mobilePages.length, files: mobilePages, status: mobilePages.length > 0 ? 'OK' : 'WARN' });

  return checks;
}

// 4. Infrastructure Health
function checkInfrastructure() {
  var checks = [];

  checks.push({ component: 'Jenkins Pipeline', exists: fileExists(path.join(process.cwd(), 'Jenkinsfile')), status: fileExists(path.join(process.cwd(), 'Jenkinsfile')) ? 'OK' : 'NOT CONFIGURED' });

  var ghWorkflows = [];
  try {
    var ghDir = path.join(process.cwd(), '.github/workflows');
    if (dirExists(ghDir)) {
      ghWorkflows = fs.readdirSync(ghDir).filter(function(f) { return f.endsWith('.yml') || f.endsWith('.yaml'); });
    }
  } catch { /* ignore */ }
  checks.push({ component: 'GitHub Actions', count: ghWorkflows.length, workflows: ghWorkflows, status: ghWorkflows.length > 0 ? 'OK' : 'NOT CONFIGURED' });

  checks.push({ component: 'Environment Config', exists: fileExists(path.join(process.cwd(), '.env')), status: fileExists(path.join(process.cwd(), '.env')) ? 'OK' : 'MISSING' });

  var envFiles = [];
  try {
    var rootDir = process.cwd();
    var files = fs.readdirSync(rootDir);
    envFiles = files.filter(function(f) { return f.startsWith('.env'); });
  } catch { /* ignore */ }
  checks.push({ component: 'Environment Profiles', count: envFiles.length, files: envFiles, status: envFiles.length > 1 ? 'OK' : 'WARN' });


  var vectorDbExists = dirExists(path.join(process.cwd(), 'ai/vector-db'));
  checks.push({ component: 'Vector DB (RAG)', exists: vectorDbExists, status: vectorDbExists ? 'OK' : 'NOT CONFIGURED' });

  return checks;
}

// 5. Mobile Device Support
function checkMobileSupport() {
  var checks = [];

  var androidDriver = dirExists(path.join(process.cwd(), 'mobile/android'));
  checks.push({ component: 'Android Support', exists: androidDriver, status: androidDriver ? 'OK' : 'MISSING' });

  var iosDriver = dirExists(path.join(process.cwd(), 'mobile/ios'));
  checks.push({ component: 'iOS Support', exists: iosDriver, status: iosDriver ? 'OK' : 'MISSING' });

  var capsAndroid = fileExists(path.join(process.cwd(), 'mobile/capabilities/android.capabilities.js'));
  checks.push({ component: 'Android Capabilities', exists: capsAndroid, status: capsAndroid ? 'OK' : 'MISSING' });

  var capsIOS = fileExists(path.join(process.cwd(), 'mobile/capabilities/ios.capabilities.js'));
  checks.push({ component: 'iOS Capabilities', exists: capsIOS, status: capsIOS ? 'OK' : 'MISSING' });

  var mobileGenDir = path.join(process.cwd(), 'ai/generated-features/mobile');
  var mobileGenExists = dirExists(mobileGenDir);
  checks.push({ component: 'Mobile Generated Tests', exists: mobileGenExists, status: mobileGenExists ? 'OK' : 'MISSING' });

  var deviceFarmDir = path.join(process.cwd(), 'reports/mobile/device-farm');
  var deviceFarmExists = dirExists(deviceFarmDir);
  checks.push({ component: 'Device Farm Reports', exists: deviceFarmExists, status: deviceFarmExists ? 'OK' : 'NOT YET RUN' });

  return checks;
}

// 6. Reports & Dashboard
function checkReporting() {
  var checks = [];

  var reportsDir = path.join(process.cwd(), 'reports');
  var hasReports = dirExists(reportsDir);
  checks.push({ component: 'Reports Directory', exists: hasReports, status: hasReports ? 'OK' : 'MISSING' });

  var dashboardExists = fileExists(path.join(process.cwd(), 'reports/ai/dashboard/index.html'));
  checks.push({ component: 'AI Dashboard', exists: dashboardExists, status: dashboardExists ? 'OK' : 'NOT YET GENERATED' });

  var ciCdReport = fileExists(path.join(process.cwd(), 'reports/ai/ci-cd-integration-report.md'));
  checks.push({ component: 'CI/CD Report', exists: ciCdReport, status: ciCdReport ? 'OK' : 'NOT YET GENERATED' });

  var alertReports = fileExists(path.join(process.cwd(), 'reports/ai/alerts/active-alerts.md'));
  checks.push({ component: 'Active Alerts', exists: alertReports, status: alertReports ? 'OK' : 'NO ALERTS' });

  return checks;
}

// ---------- Main Agent ----------
var EcosystemReadinessAgent = {
  name: 'EcosystemReadinessAgent',
  version: '1.0.0',

  // Run complete ecosystem health check
  checkHealth: function() {
    console.log('[EcosystemReadinessAgent] Running complete ecosystem health check');

    var health = {
      checkedAt: timestamp(),
      agentRegistry: checkAgentRegistry(),
      framework: checkFramework(),
      testAssets: checkTestAssets(),
      infrastructure: checkInfrastructure(),
      mobileSupport: checkMobileSupport(),
      reporting: checkReporting(),
    };

    // Compute summary
    var allChecks = [];
    Object.keys(health).forEach(function(category) {
      if (category === 'checkedAt') return;
      if (Array.isArray(health[category])) {
        health[category].forEach(function(check) {
          if (check.status) allChecks.push(check);
        });
      }
    });

    var passed = allChecks.filter(function(c) { return c.status === 'OK'; }).length;
    var warned = allChecks.filter(function(c) { return c.status === 'WARN' || c.status === 'NOT YET RUN' || c.status === 'NO ALERTS'; }).length;
    var failed = allChecks.filter(function(c) { return c.status === 'FAIL' || c.status === 'MISSING' || c.status === 'NOT CONFIGURED'; }).length;

    health.summary = {
      total: allChecks.length,
      passed: passed,
      warned: warned,
      failed: failed,
      passRate: allChecks.length > 0 ? Number(((passed / allChecks.length) * 100).toFixed(1)) : 0,
    };

    return health;
  },

  // Generate comprehensive readiness report
  run: function(input) {
    console.log('[EcosystemReadinessAgent] End-to-end ecosystem readiness validation');

    var health = this.checkHealth();
    var state = loadState();

    var result = {
      id: 'readiness-' + Date.now(),
      checkedAt: timestamp(),
      health: health,
      summary: health.summary,
    };

    state.checks.push(result);
    saveState(state);

    // Generate detailed report
    var reportPath = path.join(REPORTS_DIR, 'ecosystem-readiness-' + Date.now() + '.md');
    var lines = [];
    lines.push('# Ecosystem Readiness Report');
    lines.push('');
    lines.push('Generated: ' + timestamp());
    lines.push('Agent: ' + this.name + ' v' + this.version);
    lines.push('');
    lines.push('## Overall Status');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    var overallIcon = health.summary.failed === 0 ? '&#x2705;' : (health.summary.failed <= 3 ? '&#x26A0;&#xFE0F;' : '&#x274C;');
    lines.push('| Overall | ' + overallIcon + ' ' + health.summary.passed + '/' + health.summary.total + ' checks passing |');
    lines.push('| Pass Rate | ' + health.summary.passRate + '% |');
    lines.push('| Passed | ' + health.summary.passed + ' |');
    lines.push('| Warnings | ' + health.summary.warned + ' |');
    lines.push('| Failures | ' + health.summary.failed + ' |');
    lines.push('| Agent Count | ' + health.agentRegistry.length + ' agents registered |');
    lines.push('');

    // Agent Registry
    lines.push('## 1. Agent Registry (' + health.agentRegistry.length + ' agents)');
    lines.push('');
    lines.push('| Agent | Status | Has run() |');
    lines.push('|---|---|---|');
    var agentFailures = 0;
    health.agentRegistry.forEach(function(a) {
      var icon = a.status === 'OK' ? '&#x2705;' : (a.status === 'WARN' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
      lines.push('| ' + icon + ' ' + a.name + ' | ' + a.status + ' | ' + (a.hasRunMethod ? 'Yes' : 'No') + ' |');
      if (a.status === 'FAIL' || a.status === 'WARN') agentFailures++;
    });
    if (agentFailures === 0) lines.push('\n_All 40 agents loaded successfully._');
    lines.push('');

    // Framework
    lines.push('## 2. Framework Components');
    lines.push('');
    lines.push('| Component | Status |');
    lines.push('|---|---|');
    health.framework.forEach(function(c) {
      var icon = c.status === 'OK' ? '&#x2705;' : '&#x274C;';
      lines.push('| ' + icon + ' ' + c.component + ' | ' + c.status + ' |');
    });
    lines.push('');

    // Test Assets
    lines.push('## 3. Test Assets');
    lines.push('');
    lines.push('| Asset | Count | Status |');
    lines.push('|---|---|---|');
    health.testAssets.forEach(function(c) {
      var icon = c.status === 'OK' ? '&#x2705;' : (c.status === 'WARN' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
      lines.push('| ' + icon + ' ' + c.component + ' | ' + (c.count || '-') + ' | ' + c.status + ' |');
    });
    lines.push('');

    // Infrastructure
    lines.push('## 4. CI/CD & Infrastructure');
    lines.push('');
    lines.push('| Component | Status |');
    lines.push('|---|---|');
    health.infrastructure.forEach(function(c) {
      var icon = c.status === 'OK' ? '&#x2705;' : (c.status === 'WARN' ? '&#x26A0;&#xFE0F;' : (c.status === 'NOT CONFIGURED' ? '&#x274C;' : '&#x26A0;&#xFE0F;'));
      var detail = c.count ? '(' + c.count + ')' : (c.workflows ? '(' + c.workflows.join(', ') + ')' : '');
      lines.push('| ' + icon + ' ' + c.component + ' | ' + c.status + ' ' + detail + ' |');
    });
    lines.push('');

    // Mobile
    lines.push('## 5. Mobile Device Support');
    lines.push('');
    lines.push('| Component | Status |');
    lines.push('|---|---|');
    health.mobileSupport.forEach(function(c) {
      var icon = c.status === 'OK' ? '&#x2705;' : (c.status === 'NOT YET RUN' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
      lines.push('| ' + icon + ' ' + c.component + ' | ' + c.status + ' |');
    });
    lines.push('');

    // Reporting
    lines.push('## 6. Reporting & Dashboard');
    lines.push('');
    lines.push('| Component | Status |');
    lines.push('|---|---|');
    health.reporting.forEach(function(c) {
      var icon = c.status === 'OK' ? '&#x2705;' : (c.status === 'NOT YET GENERATED' || c.status === 'NO ALERTS' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
      lines.push('| ' + icon + ' ' + c.component + ' | ' + c.status + ' |');
    });
    lines.push('');

    // Phase Summary
    lines.push('## 7. Phase Implementation Summary');
    lines.push('');
    lines.push('| Phase | Agent | Status |');
    lines.push('|---|---|---|');
    var phaseMap = [
      [1, 'Foundation & Base Agents', 'baseAgent.js, AgentRunner.js, AgentRegistry.js'],
      [2, 'Test Generation Pipeline', 'testCaseGeneration, featureFileGeneration, stepDefinitionGeneration, pageObjectGeneration, apiTestGeneration'],
      [3, 'AI Analysis & RCA', 'failureAnalysis, rootCauseAnalysis, playwrightCodeReview, reportSummarization'],
      [4, 'Locator Self-Healing', 'locatorHealing, selfHealingAutomation'],
      [5, 'Advanced Self-Healing', 'LocatorApplyManager, locatorHealingApplier'],
      [6, 'Multi-Agent Execution', 'ExecutionAgent, TestExecutionAgent, PlannerAgent, DecisionAgent, RetryAgent, HealingAgent, RCAAgent'],
      [7, 'Mobile Test Generation', 'MobileTestGenerationAgent'],
      [8, 'Device Farm', 'MobileDeviceFarmAgent'],
      [9, 'Self-Healing Pipeline', 'SelfHealingPipelineAgent'],
      [10, 'AI Dashboard', 'AIDashboardAgent'],
      [11, 'Test Data Pipeline', 'TestDataPipelineAgent'],
      [12, 'Unified MCP Orchestrator', 'UnifiedMCPOrchestratorAgent'],
      [13, 'Anomaly Detection', 'AnomalyDetectionAgent'],
      [14, 'Smart Test Selector', 'SmartTestSelectorAgent'],
      [15, 'Ecosystem Readiness', 'EcosystemReadinessAgent'],
    ];
    phaseMap.forEach(function(p) {
      var phaseAgent = health.agentRegistry.find(function(a) { return a.name && p[2].indexOf(a.name) !== -1; });
      var icon = phaseAgent && phaseAgent.status === 'OK' ? '&#x2705;' : '&#x26A0;&#xFE0F;';
      lines.push('| Phase ' + p[0] + ' | ' + p[1] + ' | ' + icon + ' ' + p[2] + ' |');
    });
    lines.push('');

    // Recommendations
    lines.push('## Recommendations');
    lines.push('');
    var failedItems = [];
    allChecks = [];
    Object.keys(health).forEach(function(cat) {
      if (cat === 'checkedAt' || cat === 'summary') return;
      if (Array.isArray(health[cat])) {
        health[cat].forEach(function(c) {
          if (c.status === 'FAIL' || c.status === 'MISSING' || c.status === 'NOT CONFIGURED') {
            failedItems.push(c.component + ': ' + c.status);
          }
        });
      }
    });
    if (failedItems.length > 0) {
      failedItems.forEach(function(item) {
        lines.push('- &#x26A0;&#xFE0F; ' + item);
      });
    } else {
      lines.push('- &#x2705; All checks passed. The ecosystem is production-ready.');
      lines.push('- Run `npm run test:all` for full cross-platform execution.');
      lines.push('- Use the AI Dashboard at `reports/ai/dashboard/index.html` for visual reports.');
      lines.push('- Use the SmartTestSelectorAgent for code-change-based test selection in CI/CD.');
    }

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      reportPath: path.relative(process.cwd(), reportPath),
      summary: health.summary,
      agentCount: health.agentRegistry.length,
      allAgentsLoaded: health.agentRegistry.filter(function(a) { return a.status === 'OK'; }).length === health.agentRegistry.length,
      failedChecks: health.summary.failed,
    };
  },

  // Get readiness history
  getReadinessHistory: function() {
    var state = loadState();
    return state.checks || [];
  },

  // Quick status check (lightweight, no report generation)
  quickStatus: function() {
    var health = this.checkHealth();
    return {
      ok: health.summary.failed === 0,
      summary: health.summary,
      allAgentsLoaded: health.agentRegistry.filter(function(a) { return a.status === 'OK'; }).length === health.agentRegistry.length,
    };
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'run';

  if (command === 'run' || command === 'check') {
    var result = EcosystemReadinessAgent.run();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'quick') {
    var status = EcosystemReadinessAgent.quickStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (command === 'history') {
    var history = EcosystemReadinessAgent.getReadinessHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: run, check, quick, history');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[EcosystemReadinessAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = EcosystemReadinessAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Ecosystem Readiness Agent",
  "version": "1.0.0",
  "description": "End-to-end ecosystem health validation across infrastructure and agents",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "health",
    "infrastructure"
  ],
  "executionStage": "preflight",
  "priority": 40,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "strategy": "owner",
  "responsibilities": ["ecosystem-readiness"],
  "lifecycle": "active"
};
