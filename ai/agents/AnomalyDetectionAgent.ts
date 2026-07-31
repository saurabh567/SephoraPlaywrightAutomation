import path from 'path';
// AnomalyDetectionAgent - Phase 13
// Real-time AI-powered anomaly detection and smart alerting for test execution.
// Detects flaky tests, performance regressions, locator decay patterns, and
// generates actionable alerts with suggested remediation steps.

const ANOMALY_STATE_PATH = path.join(process.cwd(), 'ai/memory/anomaly-state.json');
const ALERTS_DIR = path.join(process.cwd(), 'reports', 'ai', 'alerts');
const HISTORY_WINDOW = 50;  // number of recent runs to keep for trend analysis

function ensureDirs() {
  fs.ensureDirSync(path.dirname(ANOMALY_STATE_PATH));
  fs.ensureDirSync(ALERTS_DIR);
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(ANOMALY_STATE_PATH)) {
    fs.writeJsonSync(ANOMALY_STATE_PATH, { history: [] as any[], alerts: [] as any[] }, { spaces: 2 });
  }
  return fs.readJsonSync(ANOMALY_STATE_PATH);
}

function saveState(state: any) {
  fs.writeJsonSync(ANOMALY_STATE_PATH, state, { spaces: 2 });
}

function timestamp() {
  return new Date().toISOString();
}

function safeReadJson(filePath: any) {
  try {
    if (fs.existsSync(filePath)) return fs.readJsonSync(filePath);
  } catch { /* ignore */ }
  return null;
}

// ---------- Analysis Functions ----------

// Parse cucumber report to extract per-scenario results
function extractScenarioResults() {
  var reportPaths = [
    path.join(process.cwd(), 'reports/json/cucumber-report.json'),
    path.join(process.cwd(), 'reports/web/json/cucumber-report.json'),
  ];
  var report = null;
  for (var i = 0; i < reportPaths.length; i++) {
    report = safeReadJson(reportPaths[i]);
    if (report) break;
  }
  if (!report) return [];

  var features = Array.isArray(report) ? report : [] as any[];
  var results: any = [];
  features.forEach(function(f) {
    (f.elements || []).forEach(function(el: any) {
      if (el.type !== 'scenario') return;
      var failed = (el.steps || []).some(function(st: any) { return st.result && st.result.status === 'failed'; });
      var skipped = (el.steps || []).every(function(st: any) { return st.result && (st.result.status === 'skipped' || st.result.status === 'undefined'); });
      var passed = !failed && !skipped;
      var duration = (el.steps || []).reduce(function(sum: any, st: any) {
        return sum + (st.result && st.result.duration ? st.result.duration : 0);
      }, 0);
      results.push({
        scenario: el.name || 'unknown',
        feature: f.name || 'unknown',
        passed: passed,
        failed: failed,
        skipped: skipped,
        durationNs: duration,
        durationMs: Number((duration / 1e6).toFixed(2)),
        uri: f.uri || '',
      });
    });
  });
  return results;
}

// Detect flaky tests from execution history
function detectFlakyTests(state: any) {
  var flaky: any = [];
  var scenarioMap: Record<string, any> = {};

  state.history.forEach(function(run: any) {
    (run.scenarios || []).forEach(function(s: any) {
      var key = s.scenario;
      if (!scenarioMap[key]) scenarioMap[key] = [];
      scenarioMap[key].push(s.passed);
    });
  });

  Object.keys(scenarioMap).forEach(function(scenario) {
    var results = scenarioMap[scenario];
    if (results.length >= 3) {
      var passedCount = results.filter(function(r: any) { return r; }).length;
      var failCount = results.length - passedCount;
      var passRate = (passedCount / results.length) * 100;
      // Flaky: between 20% and 80% pass rate over multiple runs
      if (passRate > 20 && passRate < 80) {
        flaky.push({
          scenario: scenario,
          passRate: Number(passRate.toFixed(1)),
          runs: results.length,
          passed: passedCount,
          failed: failCount,
          severity: passRate < 40 ? 'high' : (passRate < 60 ? 'medium' : 'low'),
        });
      }
    }
  });

  return flaky.sort(function(a: any, b: any) { return a.passRate - b.passRate; });
}

// Detect performance regressions
function detectPerformanceRegression(state: any) {
  var regressions: any = [];
  var scenarioDurationMap: Record<string, any> = {};

  state.history.forEach(function(run: any) {
    (run.scenarios || []).forEach(function(s: any) {
      if (!s.passed) return;  // only analyze passed scenarios for performance
      var key = s.scenario;
      if (!scenarioDurationMap[key]) scenarioDurationMap[key] = [];
      scenarioDurationMap[key].push(s.durationMs);
    });
  });

  Object.keys(scenarioDurationMap).forEach(function(scenario) {
    var durations = scenarioDurationMap[scenario];
    if (durations.length >= 3) {
      var recent = durations.slice(-3);
      var baseline = durations.slice(0, -3);
      if (baseline.length > 0) {
        var avgBaseline = baseline.reduce(function(a: any, b: any) { return a + b; }, 0) / baseline.length;
        var avgRecent = recent.reduce(function(a: any, b: any) { return a + b; }, 0) / recent.length;
        if (avgBaseline > 0) {
          var changePercent = ((avgRecent - avgBaseline) / avgBaseline) * 100;
          if (changePercent > 20) {
            regressions.push({
              scenario: scenario,
              baselineMs: Number(avgBaseline.toFixed(1)),
              recentMs: Number(avgRecent.toFixed(1)),
              changePercent: Number(changePercent.toFixed(1)),
              baselineRuns: baseline.length,
              recentRuns: recent.length,
              severity: changePercent > 50 ? 'high' : (changePercent > 30 ? 'medium' : 'low'),
            });
          }
        }
      }
    }
  });

  return regressions.sort(function(a: any, b: any) { return b.changePercent - a.changePercent; });
}

// Detect locator decay patterns from failure messages
function detectLocatorDecay(scenarios: any) {
  var locatorErrors: any = [];
  var errorKeywords = ['TimeoutError', 'element not found', 'no such element', 'unable to locate',
    'stale element', 'element not interactable', 'cannot find', 'not visible'];

  scenarios.forEach(function(s: any) {
    if (!s.failed) return;
    // Check if any step error message contains locator-related keywords
    // (We can't easily get error messages from cucumber JSON, so we check scenario name patterns)
    var lowerName = (s.scenario || '').toLowerCase();
    var lowerFeature = (s.feature || '').toLowerCase();
    var combined = lowerName + ' ' + lowerFeature;

    var hasLocatorPattern = errorKeywords.some(function(kw) { return combined.indexOf(kw) !== -1; });
    // Also flag if the scenario name suggests UI element interaction
    var uiKeywords = ['button', 'link', 'input', 'field', 'select', 'menu', 'tab', 'icon', 'image', 'card', 'search', 'cart'];
    var isUIElement = uiKeywords.some(function(kw) { return lowerName.indexOf(kw) !== -1; });

    // If scenario failed and is UI-related, flag as potential locator issue
    if (hasLocatorPattern || isUIElement) {
      locatorErrors.push({
        scenario: s.scenario,
        feature: s.feature,
        severity: 'medium',
        pattern: hasLocatorPattern ? 'matches locator error keywords' : 'UI interaction scenario',
      });
    }
  });

  return locatorErrors;
}

// Generate smart alerts with remediation
function generateAlerts(flaky: any, regressions: any, locatorIssues: any, state: any) {
  var alerts: any = [];
  var now = timestamp();

  // Flaky test alerts
  flaky.forEach(function(f: any) {
    var existing = (state.alerts || []).find(function(a: any) {
      return a.type === 'flaky_test' && a.target === f.scenario && a.status === 'open';
    });
    if (!existing) {
      alerts.push({
        id: 'alert-' + Date.now() + '-' + alerts.length,
        type: 'flaky_test',
        severity: f.severity,
        target: f.scenario,
        title: 'Flaky test detected: ' + f.scenario,
        description: 'Scenario has ' + f.passRate + '% pass rate over ' + f.runs + ' runs (' + f.passed + ' passed, ' + f.failed + ' failed)',
        remediation: f.severity === 'high'
          ? 'Investigate test immediately. Check for race conditions, async issues, or environment dependencies.'
          : 'Review test stability. Consider adding retries, stabilizing locators, or isolating test data.',
        status: 'open',
        createdAt: now,
        source: 'AnomalyDetectionAgent',
      });
    }
  });

  // Performance regression alerts
  regressions.forEach(function(r: any) {
    var existing = (state.alerts || []).find(function(a: any) {
      return a.type === 'performance_regression' && a.target === r.scenario && a.status === 'open';
    });
    if (!existing) {
      alerts.push({
        id: 'alert-' + Date.now() + '-' + alerts.length,
        type: 'performance_regression',
        severity: r.severity,
        target: r.scenario,
        title: 'Performance regression: ' + r.scenario,
        description: 'Duration increased by ' + r.changePercent + '% (' + r.baselineMs + 'ms -> ' + r.recentMs + 'ms)',
        remediation: r.severity === 'high'
          ? 'Investigate page load time, network conditions, or application changes affecting this scenario.'
          : 'Monitor trend. Check for any recent application changes that may impact performance.',
        status: 'open',
        createdAt: now,
        source: 'AnomalyDetectionAgent',
      });
    }
  });

  // Locator decay alerts
  locatorIssues.forEach(function(l: any) {
    var existing = (state.alerts || []).find(function(a: any) {
      return a.type === 'locator_decay' && a.target === l.scenario && a.status === 'open';
    });
    if (!existing) {
      alerts.push({
        id: 'alert-' + Date.now() + '-' + alerts.length,
        type: 'locator_decay',
        severity: l.severity,
        target: l.scenario,
        title: 'Potential locator decay: ' + l.scenario,
        description: 'UI interaction scenario failed. Pattern: ' + l.pattern,
        remediation: 'Run locator healing agent: node ai/agents/LocatorApplyManager.js. Review page structure changes.',
        status: 'open',
        createdAt: now,
        source: 'AnomalyDetectionAgent',
      });
    }
  });

  return alerts;
}

// ---------- Main Agent ----------
var AnomalyDetectionAgent = {
  name: 'AnomalyDetectionAgent',
  version: '1.0.0',

  // Main analysis run
  run: function(input: any) {
    console.log('[AnomalyDetectionAgent] Running anomaly detection and smart alerting');

    var state = loadState();
    var scenarios = extractScenarioResults();

    if (scenarios.length === 0) {
      console.log('[AnomalyDetectionAgent] No scenario results found. Skipping analysis.');
      return { ok: true, message: 'No scenario data available for analysis', alerts: [] as any[], anomalies: {} as Record<string, any> };
    }

    // Add current run to history
    var currentRun = {
      runId: 'run-' + Date.now(),
      executedAt: timestamp(),
      scenarios: scenarios,
      totalScenarios: scenarios.length,
      passed: scenarios.filter(function(s: any) { return s.passed; }).length,
      failed: scenarios.filter(function(s: any) { return s.failed; }).length,
    };
    state.history.push(currentRun);

    // Keep history within window
    if (state.history.length > HISTORY_WINDOW) {
      state.history = state.history.slice(-HISTORY_WINDOW);
    }

    // Run detection algorithms
    var flaky = detectFlakyTests(state);
    var regressions = detectPerformanceRegression(state);
    var locatorIssues = detectLocatorDecay(scenarios);

    // Generate alerts
    var newAlerts = generateAlerts(flaky, regressions, locatorIssues, state);
    newAlerts.forEach(function(a: any) {
      state.alerts.push(a);
    });

    // Compute anomaly summary
    var anomalies = {
      totalRunsAnalyzed: state.history.length,
      currentRun: {
        scenarios: scenarios.length,
        passed: currentRun.passed,
        failed: currentRun.failed,
        passRate: scenarios.length > 0 ? Number(((currentRun.passed / scenarios.length) * 100).toFixed(1)) : 0,
      },
      flakyTests: flaky,
      performanceRegressions: regressions,
      locatorDecayCandidates: locatorIssues,
      newAlertsGenerated: newAlerts.length,
      openAlerts: (state.alerts || []).filter(function(a: any) { return a.status === 'open'; }).length,
    };

    saveState(state);

    // Generate anomaly report
    var reportPath = path.join(ALERTS_DIR, 'anomaly-report-' + Date.now() + '.md');
    var lines: any[] = [];
    lines.push('# Anomaly Detection Report');
    lines.push('');
    lines.push('Generated: ' + timestamp());
    lines.push('Agent: ' + this.name + ' v' + this.version);
    lines.push('');
    lines.push('## Current Run Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push('| Scenarios | ' + anomalies.currentRun.scenarios + ' |');
    lines.push('| Passed | ' + anomalies.currentRun.passed + ' |');
    lines.push('| Failed | ' + anomalies.currentRun.failed + ' |');
    lines.push('| Pass Rate | ' + anomalies.currentRun.passRate + '% |');
    lines.push('| Historical Runs | ' + anomalies.totalRunsAnalyzed + ' |');
    lines.push('');
    lines.push('## Flaky Tests Detected');
    lines.push('');
    if (flaky.length > 0) {
      lines.push('| Scenario | Pass Rate | Runs | Severity |');
      lines.push('|---|---|---|---|');
      flaky.forEach(function(f: any) {
        var icon = f.severity === 'high' ? '&#x1F534;' : (f.severity === 'medium' ? '&#x26A0;&#xFE0F;' : '&#x1F7E1;');
        lines.push('| ' + icon + ' ' + f.scenario + ' | ' + f.passRate + '% | ' + f.runs + ' | ' + f.severity + ' |');
      });
    } else {
      lines.push('*(none detected)*');
    }
    lines.push('');
    lines.push('## Performance Regressions');
    lines.push('');
    if (regressions.length > 0) {
      lines.push('| Scenario | Baseline | Recent | Change | Severity |');
      lines.push('|---|---|---|---|---|');
      regressions.forEach(function(r: any) {
        var icon = r.severity === 'high' ? '&#x1F534;' : (r.severity === 'medium' ? '&#x26A0;&#xFE0F;' : '&#x1F7E1;');
        lines.push('| ' + icon + ' ' + r.scenario + ' | ' + r.baselineMs + 'ms | ' + r.recentMs + 'ms | +' + r.changePercent + '% | ' + r.severity + ' |');
      });
    } else {
      lines.push('*(none detected)*');
    }
    lines.push('');
    lines.push('## Locator Decay Candidates');
    lines.push('');
    if (locatorIssues.length > 0) {
      locatorIssues.forEach(function(l: any) {
        lines.push('- ' + l.scenario + ' (' + l.severity + ') - ' + l.pattern);
      });
    } else {
      lines.push('*(none detected)*');
    }
    lines.push('');
    lines.push('## Active Alerts (' + anomalies.openAlerts + ')');
    lines.push('');
    var openAlerts = (state.alerts || []).filter(function(a: any) { return a.status === 'open'; });
    if (openAlerts.length > 0) {
      openAlerts.forEach(function(a: any) {
        var icon = a.severity === 'high' ? '&#x1F534;' : (a.severity === 'medium' ? '&#x26A0;&#xFE0F;' : '&#x1F7E1;');
        lines.push('### ' + icon + ' ' + a.title);
        lines.push('');
        lines.push('- Type: ' + a.type);
        lines.push('- Severity: ' + a.severity);
        lines.push('- Description: ' + a.description);
        lines.push('- Remediation: ' + a.remediation);
        lines.push('');
      });
    }

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

    // Also generate a consolidated alerts summary
    var summaryPath = path.join(ALERTS_DIR, 'active-alerts.md');
    var summaryLines: any[] = [];
    summaryLines.push('# Active Smart Alerts');
    summaryLines.push('');
    summaryLines.push('Last Updated: ' + timestamp());
    summaryLines.push('');
    summaryLines.push('| Type | Severity | Target | Status | Created |');
    summaryLines.push('|---|---|---|---|---|');
    (state.alerts || []).forEach(function(a: any) {
      if (a.status === 'open') {
        summaryLines.push('| ' + a.type + ' | ' + a.severity + ' | ' + a.target + ' | ' + a.status + ' | ' + a.createdAt.slice(0, 19) + ' |');
      }
    });
    fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');

    return {
      ok: true,
      reportPath: path.relative(process.cwd(), reportPath),
      summaryPath: path.relative(process.cwd(), summaryPath),
      anomalies: anomalies,
    };
  },

  // Get all active alerts
  getActiveAlerts: function() {
    var state = loadState();
    return (state.alerts || []).filter(function(a: any) { return a.status === 'open'; });
  },

  // Get all alerts (including resolved)
  getAllAlerts: function() {
    var state = loadState();
    return state.alerts || [];
  },

  // Resolve an alert by ID
  resolveAlert: function(alertId: any) {
    var state = loadState();
    var alert = (state.alerts || []).find(function(a: any) { return a.id === alertId; });
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = timestamp();
      saveState(state);
      return { ok: true, alert: alert };
    }
    return { ok: false, error: 'Alert not found: ' + alertId };
  },

  // Get anomaly analysis history
  getAnalysisHistory: function() {
    var state = loadState();
    return state.history || [];
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'run';

  if (command === 'run' || command === 'analyze') {
    var result: any = AnomalyDetectionAgent.run({});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'alerts') {
    var sub = args[1] || 'all';
    if (sub === 'active') {
      var alerts = AnomalyDetectionAgent.getActiveAlerts();
      console.log(JSON.stringify(alerts, null, 2));
    } else if (sub === 'all') {
      var allAlerts = AnomalyDetectionAgent.getAllAlerts();
      console.log(JSON.stringify(allAlerts, null, 2));
    } else {
      console.log('Usage: alerts [active|all]');
    }
    return;
  }

  if (command === 'resolve') {
    var alertId = args[1];
    if (!alertId) { console.log('Usage: resolve <alert-id>'); return; }
    var result: any = AnomalyDetectionAgent.resolveAlert(alertId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'history') {
    var history = AnomalyDetectionAgent.getAnalysisHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: run, alerts [active|all], resolve <id>, history');
}

if (require.main === module) {
  try {
    main();
  } catch (e: any) {
    console.error('[AnomalyDetectionAgent] CLI error:', e.message);
    process.exit(1);
  }
}

export default AnomalyDetectionAgent;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Anomaly Detection Agent",
  "version": "1.0.0",
  "description": "Real-time anomaly detection for flaky tests, performance regressions, locator decay",
  "dependencies": [
    "executionMemoryAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "analysis",
    "anomaly"
  ],
  "executionStage": "multi-agent",
  "priority": 50,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
