// RCAAgent - Root Cause Analysis agent that classifies failures into categories
const fs = require('fs-extra');
const path = require('path');

// Strategy Pattern: RCAAgent is the OWNER of root cause analysis.
// Delegates to failureAnalysisAgent (RAG strategy) when mode=rag,
// or runs its own static classification (default).
const failureAnalysisAgent = require("./failureAnalysisAgent");


const FAILURE_CATEGORIES = {
  LOCATOR_ISSUE: { weight: 0.3, label: 'Locator Issue', severity: 'high' },
  ENVIRONMENT_ISSUE: { weight: 0.2, label: 'Environment Issue', severity: 'high' },
  NETWORK_ISSUE: { weight: 0.15, label: 'Network Issue', severity: 'medium' },
  APPLICATION_ISSUE: { weight: 0.15, label: 'Application Issue', severity: 'high' },
  TEST_ISSUE: { weight: 0.1, label: 'Test Issue', severity: 'medium' },
  DATA_ISSUE: { weight: 0.1, label: 'Data Issue', severity: 'medium' }
};

function classifyError(errorMessage) {
  const lower = (errorMessage || '').toLowerCase();

  if (!lower) return { category: 'UNKNOWN', score: 0 };

  // Locator issues
  if (lower.includes('locator') || lower.includes('selector') ||
      lower.includes('element not found') || lower.includes('no such element') ||
      lower.includes('strict mode violation') || lower.includes('timeout') && lower.includes('locator') ||
      lower.includes('intercepted') || lower.includes('detached')) {
    return { category: 'LOCATOR_ISSUE', score: 0.9 };
  }

  // Network issues
  if (lower.includes('network') || lower.includes('etimedout') || lower.includes('econnrefused') ||
      lower.includes('enotfound') || lower.includes('dns') || lower.includes('socket') ||
      lower.includes('connection reset') || lower.includes('connect failed') ||
      lower.includes('timeout') && (lower.includes('page') || lower.includes('navigation'))) {
    return { category: 'NETWORK_ISSUE', score: 0.85 };
  }

  // Environment issues
  if (lower.includes('environment') || lower.includes('selenium') || lower.includes('driver') ||
      lower.includes('browser') && lower.includes('not found') || lower.includes('capabilities') ||
      lower.includes('session') || lower.includes('appium') || lower.includes('device') ||
      lower.includes('emulator') || lower.includes('simulator') || lower.includes('platform')) {
    return { category: 'ENVIRONMENT_ISSUE', score: 0.8 };
  }

  // Application issues
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') ||
      lower.includes('internal server') || lower.includes('application error') ||
      lower.includes('unexpected error') || lower.includes('crash') ||
      lower.includes('assertion') && lower.includes('failed')) {
    return { category: 'APPLICATION_ISSUE', score: 0.85 };
  }

  // Test issues
  if (lower.includes('test') || lower.includes('step') && lower.includes('failed') ||
      lower.includes('assertion') || lower.includes('expected') || lower.includes('should')) {
    return { category: 'TEST_ISSUE', score: 0.6 };
  }

  // Data issues
  if (lower.includes('data') || lower.includes('test data') || lower.includes('fixture') ||
      lower.includes('not found') || lower.includes('missing')) {
    return { category: 'DATA_ISSUE', score: 0.5 };
  }

  // Timeout catch-all
  if (lower.includes('timeout')) {
    return { category: 'ENVIRONMENT_ISSUE', score: 0.4 };
  }

  return { category: 'UNKNOWN', score: 0.3 };
}

function extractLocatorFromError(errorMessage) {
  if (!errorMessage) return null;
  var patterns = [
    /locator[:\s]+["']([^"']+)["']/i,
    /selector[:\s]+["']([^"']+)["']/i,
    /element[:\s]+["']([^"']+)["']/i,
    /["']([\w\-.#\[\]=\s]+)["']/
  ];
  for (var pi = 0; pi < patterns.length; pi++) {
    var m = errorMessage.match(patterns[pi]);
    if (m) return m[1];
  }
  return null;
}

function getRecommendation(category, locator) {
  var recs = {
    LOCATOR_ISSUE: locator
      ? 'The locator `' + locator + '` is unstable. Consider using a more robust selector (data-testid, role, or ID-based). Run locator healing to find alternatives.'
      : 'Locator is failing. Consider using more robust selectors like data-testid or role-based locators.',
    ENVIRONMENT_ISSUE: 'Check browser/driver versions, Appium status, emulator/device availability, and environment variables.',
    NETWORK_ISSUE: 'Check network connectivity, proxy settings, VPN status, and API endpoint availability.',
    APPLICATION_ISSUE: 'This is likely an application bug. Verify manually and create a defect ticket.',
    TEST_ISSUE: 'Review test logic for correctness. Check assertions and expected values match actual application behavior.',
    DATA_ISSUE: 'Verify test data exists and is correctly configured. Check test-data files and environment variables.',
    UNKNOWN: 'Manual investigation needed. Check screenshots, videos, and traces in reports/ directory.'
  };
  return recs[category] || recs.UNKNOWN;
}

module.exports = {
  run: async function run(input) {
    if (!input) input = {};
    console.log("[RCAAgent] Performing root cause analysis");

    // Strategy Pattern delegation — RAG mode delegates to failureAnalysisAgent
    var mode = input.mode || "static";
    if (mode === "rag") {
      console.log("[RCAAgent] Delegating to RAG strategy (failureAnalysisAgent)");
      try {
        var ragResult = await failureAnalysisAgent.analyzeWithRag(input);
        return { ok: true, strategy: "rag", result: ragResult, totalFailures: ragResult.failedScenarios || 0 };
      } catch (err) {
        console.warn("[RCAAgent] RAG strategy failed, falling back to static:", err.message);
      }
    }

    // Default: static classification
    var reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    var failures = [];

    if (fs.existsSync(reportPath)) {
      try {
        var report = fs.readJsonSync(reportPath);
        var features = Array.isArray(report) ? report : [];

        for (var fi = 0; fi < features.length; fi++) {
          var feature = features[fi];
          var elements = feature.elements || [];
          for (var ei = 0; ei < elements.length; ei++) {
            var element = elements[ei];
            if (element.type !== 'scenario') continue;
            var steps = element.steps || [];
            var failedStep = null;
            for (var si = 0; si < steps.length; si++) {
              if (steps[si].result && steps[si].result.status === 'failed') {
                failedStep = steps[si];
                break;
              }
            }
            if (!failedStep) continue;

            failures.push({
              feature: feature.name || 'Unknown Feature',
              scenario: element.name || 'Unknown Scenario',
              step: failedStep.name || '',
              error: (failedStep.result && failedStep.result.error_message) || 'No error message',
              uri: feature.uri || '',
              line: element.line || 0
            });
          }
        }
      } catch (e) {
        console.warn('[RCAAgent] Could not parse cucumber report:', e.message);
      }
    }

    if (!failures.length) {
      var outPath = path.join(process.cwd(), 'reports/ai', 'root-cause.md');
      fs.ensureDirSync(path.dirname(outPath));
      fs.writeFileSync(outPath, '# Root Cause Analysis\n\nNo failures detected.\n', 'utf8');
      return { ok: true, skipped: true, reason: 'No failures found', totalFailures: 0 };
    }

    console.log("[RCAAgent] Analyzing " + failures.length + " failures");

    var analysis = [];
    for (var fi2 = 0; fi2 < failures.length; fi2++) {
      var f = failures[fi2];
      var classification = classifyError(f.error);
      var locator = extractLocatorFromError(f.error);
      var catInfo = FAILURE_CATEGORIES[classification.category];
      analysis.push({
        feature: f.feature,
        scenario: f.scenario,
        step: f.step,
        error: f.error.slice(0, 500),
        classification: {
          category: classification.category,
          label: catInfo ? catInfo.label : 'Unknown',
          severity: catInfo ? catInfo.severity : 'low',
          confidence: classification.score,
          locator: locator
        },
        recommendation: getRecommendation(classification.category, locator)
      });
    }

    // Aggregate statistics
    var categoryCount = {};
    var severityCount = {};
    for (var ai = 0; ai < analysis.length; ai++) {
      var a = analysis[ai];
      var cat = a.classification.category;
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      var sev = a.classification.severity;
      severityCount[sev] = (severityCount[sev] || 0) + 1;
    }

    var totalFailures = failures.length;

    // Write report
    var outPath = path.join(process.cwd(), 'reports/ai', 'root-cause.md');
    fs.ensureDirSync(path.dirname(outPath));

    var lines = [];
    lines.push('# Root Cause Analysis');
    lines.push('');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('Total Failures Analyzed: ' + totalFailures);
    lines.push('');
    lines.push('## Classification Summary');
    lines.push('');
    lines.push('| Category | Count | Percentage |');
    lines.push('|---|---|---|');
    var catKeys = Object.keys(categoryCount);
    for (var cki = 0; cki < catKeys.length; cki++) {
      var cat = catKeys[cki];
      var count = categoryCount[cat];
      var label = (FAILURE_CATEGORIES[cat] && FAILURE_CATEGORIES[cat].label) || cat;
      lines.push('| ' + label + ' | ' + count + ' | ' + ((count / totalFailures) * 100).toFixed(1) + '% |');
    }
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|---|---|');
    var sevKeys = Object.keys(severityCount);
    for (var ski = 0; ski < sevKeys.length; ski++) {
      lines.push('| ' + sevKeys[ski] + ' | ' + severityCount[sevKeys[ski]] + ' |');
    }
    lines.push('');
    lines.push('## Detailed Analysis');
    lines.push('');

    for (var ai2 = 0; ai2 < analysis.length; ai2++) {
      var a = analysis[ai2];
      lines.push('### ' + a.scenario);
      lines.push('- **Feature**: ' + a.feature);
      lines.push('- **Failed Step**: ' + a.step);
      lines.push('- **Classification**: ' + a.classification.label + ' (confidence: ' + (a.classification.confidence * 100).toFixed(0) + '%)');
      lines.push('- **Severity**: ' + a.classification.severity);
      if (a.classification.locator) {
        lines.push('- **Problematic Locator**: `' + a.classification.locator + '`');
      }
      lines.push('- **Error**: ```\n' + a.error.slice(0, 300) + '\n```');
      lines.push('- **Recommendation**: ' + a.recommendation);
      lines.push('');
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      totalFailures: totalFailures,
      categoryDistribution: categoryCount,
      severityDistribution: severityCount,
      analysis: analysis
    };
  }
};


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Root Cause Analysis Agent",
  "version": "1.0.0",
  "description": "Static classification of test failures into 6 categories",
  "dependencies": [
    "failureAnalysisAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "analysis",
    "rca"
  ],
  "executionStage": "analysis",
  "priority": 65,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "strategy": "owner",
  "responsibilities": ["root-cause-analysis"],
  "strategies": ["failureAnalysisAgent"],
  "lifecycle": "active"
};
