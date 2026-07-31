import fs from 'fs-extra';
import path from 'path';
// AIDashboardAgent - Phase 10
// Aggregates all test execution, self-healing, device farm, mobile generation, and pipeline
// results into a unified AI Dashboard — an HTML report for visual consumption.

const DASHBOARD_DIR = path.join(process.cwd(), 'reports', 'ai', 'dashboard');
const REPORT_DIRS = {
  cucumber: path.join(process.cwd(), 'reports', 'json', 'cucumber-report.json'),
  pipeline: path.join(process.cwd(), 'reports', 'pipeline'),
  deviceFarm: path.join(process.cwd(), 'reports', 'mobile', 'device-farm'),
  aiReports: path.join(process.cwd(), 'reports', 'ai'),
  pipelineState: path.join(process.cwd(), 'ai', 'memory', 'pipeline-state.json'),
  deviceFarmState: path.join(process.cwd(), 'ai', 'memory', 'device-farm-state.json'),
};

function ensureDirs() {
  fs.ensureDirSync(DASHBOARD_DIR);
}

function safeReadJson(filePath: any) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readJsonSync(filePath);
    }
  } catch { /* ignore */ }
  return null;
}

function readDir(pattern: any) {
  try {
    if (fs.existsSync(pattern)) {
      return fs.readdirSync(pattern);
    }
  } catch { /* ignore */ }
  return [];
}

function h(str: any) {
  return String(str || 'N/A')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectTestSummary() {
  const report = safeReadJson(REPORT_DIRS.cucumber);
  if (!report) return { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0, duration: 0, features: 0 };

  const features = Array.isArray(report) ? report : [] as any[];
  const allScenarios = features.flatMap(function(f) {
    return (f.elements || []).filter(function(e: any) { return e.type === 'scenario'; });
  });
  const passed = allScenarios.filter(function(s) {
    return (s.steps || []).every(function(st: any) { return st.result && st.result.status === 'passed'; });
  }).length;
  const failed = allScenarios.filter(function(s) {
    return (s.steps || []).some(function(st: any) { return st.result && st.result.status === 'failed'; });
  }).length;
  const skipped = allScenarios.filter(function(s) {
    return (s.steps || []).every(function(st: any) {
      return st.result && (st.result.status === 'skipped' || st.result.status === 'undefined');
    });
  }).length;

  var duration = 0;
  features.forEach(function(f) {
    (f.elements || []).forEach(function(el: any) {
      (el.steps || []).forEach(function(st: any) {
        if (st.result && st.result.duration) {
          duration += st.result.duration;
        }
      });
    });
  });

  var total = allScenarios.length;
  var passRate = total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0;
  return {
    total: total,
    passed: passed,
    failed: failed,
    skipped: skipped,
    passRate: passRate,
    duration: Number((duration / 1e9).toFixed(2)),
    features: features.length,
  };
}

function collectAiReportStatus() {
  var reports = [
    'failure-analysis.md', 'root-cause.md', 'locator-healing-report.md',
    'execution-summary.md', 'execution-report.md', 'production-monitoring.md',
    'jenkins-analysis.md', 'pipeline-healing.md', 'code-review.md',
    'impact-analysis.md', 'release-decision.md', 'visual-validation.md',
    'mcp-health-check.md', 'flaky-tests.md',
  ];
  var results: any = [];
  reports.forEach(function(r) {
    var fullPath = path.join(REPORT_DIRS.aiReports, r);
    var exists = fs.existsSync(fullPath);
    results.push({
      name: r.replace('.md', ''),
      file: r,
      exists: exists,
      size: exists ? fs.statSync(fullPath).size : 0,
    });
  });
  return results;
}

function collectPipelineHistory() {
  var state = safeReadJson(REPORT_DIRS.pipelineState);
  if (!state || !state.runs) return [];
  return state.runs.map(function(r: any) {
    return {
      runId: r.runId,
      platforms: r.platforms || [],
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      status: r.status,
      summary: r.summary || {},
      cycles: (r.cycles || []).map(function(c: any) {
        return {
          platform: c.platform,
          finalStatus: c.finalStatus,
          attempts: c.attempts ? c.attempts.length : 0,
          heals: c.healAttempts ? c.healAttempts.length : 0,
        };
      }),
    };
  });
}

function collectDeviceFarmHistory() {
  var state = safeReadJson(REPORT_DIRS.deviceFarmState);
  if (!state || !state.runs) return [];
  return state.runs.map(function(r: any) {
    return {
      runId: r.runId,
      device: r.device,
      platform: r.platform,
      type: r.type,
      cloudProvider: r.cloudProvider,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      status: r.status,
      exitCode: r.exitCode,
    };
  });
}

function collectPipelineReports() {
  var files = readDir(REPORT_DIRS.pipeline);
  return files.filter(function(f) { return f.endsWith('.md'); }).map(function(f) {
    var fp = path.join(REPORT_DIRS.pipeline, f);
    return { name: f, path: fp, size: fs.statSync(fp).size };
  });
}

function buildCss() {
  return [
    '*{margin:0;padding:0;box-sizing:border-box;}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2c3e50;padding:20px;}',
    '.container{max-width:1200px;margin:0 auto;}',
    '.header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:30px;border-radius:12px;margin-bottom:20px;}',
    '.header h1{font-size:28px;margin-bottom:5px;}',
    '.header .sub{opacity:.85;font-size:14px;}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;}',
    '.card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);}',
    '.card h3{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#7f8c8d;margin-bottom:8px;}',
    '.card .val{font-size:32px;font-weight:700;}',
    '.card .sub{font-size:13px;color:#7f8c8d;margin-top:4px;}',
    '.section{background:#fff;border-radius:10px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);}',
    '.section h2{font-size:18px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #f1f2f6;}',
    'table{width:100%;border-collapse:collapse;font-size:14px;}',
    'th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #f1f2f6;}',
    'th{background:#f8f9fa;font-weight:600;color:#555;font-size:12px;text-transform:uppercase;letter-spacing:.3px;}',
    'tr:hover{background:#f8f9fa;}',
    '.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;}',
    '.bg-success{background:#d5f5e3;color:#27ae60;}',
    '.bg-danger{background:#fadbd8;color:#e74c3c;}',
    '.bg-warning{background:#fef9e7;color:#f39c12;}',
    '.footer{text-align:center;color:#95a5a6;font-size:12px;padding:20px 0;}',
  ].join('\n');
}

function generateDashboardHtml(data: any) {
  var passRate = data.testSummary.passRate;
  var passRateClass = passRate >= 90 ? 'bg-success' : (passRate >= 70 ? 'bg-warning' : 'bg-danger');
  var failedClass = data.testSummary.failed === 0 ? 'bg-success' : 'bg-danger';

  var aiReportRows = '';
  data.aiReports.forEach(function(r: any) {
    var icon = r.exists ? '&#x2705;' : '&#x274C;';
    var sizeStr = r.exists ? (r.size / 1024).toFixed(1) + ' KB' : '-';
    aiReportRows += '<tr><td>' + icon + '</td><td>' + h(r.name) + '</td><td>' + sizeStr + '</td></tr>';
  });

  var pipelineRows = '';
  data.pipelineHistory.forEach(function(r: any) {
    var ok = r.summary && r.summary.overallStatus === 'passed';
    var icon = ok ? '&#x2705;' : '&#x274C;';
    var platforms = (r.platforms || []).join(', ');
    var started = r.startedAt ? String(r.startedAt).slice(0, 19) : '-';
    pipelineRows += '<tr><td>' + h(r.runId) + '</td><td>' + h(platforms) + '</td><td>' + icon + ' ' + h(r.summary ? r.summary.overallStatus : '-') + '</td><td>' + r.cycles.length + '</td><td>' + started + '</td></tr>';
  });

  var deviceRows = '';
  data.deviceFarmHistory.forEach(function(r: any) {
    var icon = r.status === 'passed' ? '&#x2705;' : (r.status === 'failed' ? '&#x274C;' : '&#x23F3;');
    deviceRows += '<tr><td>' + icon + '</td><td>' + h(r.device) + '</td><td>' + h(r.platform) + '</td><td>' + h(r.type) + '</td><td>' + h(r.cloudProvider || 'local') + '</td><td>' + h(r.exitCode) + '</td><td>' + h(r.completedAt ? String(r.completedAt).slice(0, 19) : '-') + '</td></tr>';
  });

  var pipelineReportRows = '';
  data.pipelineReports.forEach(function(r: any) {
    pipelineReportRows += '<tr><td>&#x1F4C4;</td><td>' + h(r.name) + '</td><td>' + (r.size / 1024).toFixed(1) + ' KB</td></tr>';
  });

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">',
    '<title>AI Dashboard - Test Automation</title><style>' + buildCss() + '</style></head>',
    '<body><div class="container">',
    '<div class="header"><h1>&#x1F916; AI Dashboard</h1><div class="sub">Unified Test Automation Report &mdash; ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + '</div></div>',
    '<div class="grid">',
    '<div class="card"><h3>Total Scenarios</h3><div class="val">' + data.testSummary.total + '</div><div class="sub">' + data.testSummary.features + ' feature files</div></div>',
    '<div class="card"><h3>Passed</h3><div class="val" style="color:#27ae60">' + data.testSummary.passed + '</div><div class="sub">out of ' + data.testSummary.total + '</div></div>',
    '<div class="card"><h3>Failed</h3><div class="val" style="color:#e74c3c">' + data.testSummary.failed + '</div><div class="sub">scenarios with failures</div></div>',
    '<div class="card"><h3>Pass Rate</h3><div class="val" style="color:' + (passRate >= 90 ? '#27ae60' : '#f39c12') + '">' + passRate + '%</div><div class="sub">' + data.testSummary.duration + 's total duration</div></div>',
    '<div class="card"><h3>AI Reports</h3><div class="val">' + data.aiReports.filter(function(r: any) { return r.exists; }).length + '/' + data.aiReports.length + '</div><div class="sub">generated reports</div></div>',
    '<div class="card"><h3>Pipeline Runs</h3><div class="val">' + data.pipelineHistory.length + '</div><div class="sub">self-healing executions</div></div>',
    '<div class="card"><h3>Device Runs</h3><div class="val">' + data.deviceFarmHistory.length + '</div><div class="sub">device farm executions</div></div>',
    '</div>',
    '<div class="section"><h2>&#x1F4CA; Test Execution Summary</h2><table>',
    '<tr><th>Metric</th><th>Value</th></tr>',
    '<tr><td>Total Scenarios</td><td>' + data.testSummary.total + '</td></tr>',
    '<tr><td>Passed</td><td><span class="badge bg-success">' + data.testSummary.passed + '</span></td></tr>',
    '<tr><td>Failed</td><td><span class="badge ' + failedClass + '">' + data.testSummary.failed + '</span></td></tr>',
    '<tr><td>Skipped</td><td>' + data.testSummary.skipped + '</td></tr>',
    '<tr><td>Pass Rate</td><td><span class="badge ' + passRateClass + '">' + passRate + '%</span></td></tr>',
    '<tr><td>Duration</td><td>' + data.testSummary.duration + 's</td></tr>',
    '<tr><td>Feature Files</td><td>' + data.testSummary.features + '</td></tr>',
    '</table></div>',
    '<div class="section"><h2>&#x1F4C1; AI-Generated Reports</h2><table><tr><th>Status</th><th>Report</th><th>Size</th></tr>' + aiReportRows + '</table></div>',
    '<div class="section"><h2>&#x1F501; Self-Healing Pipeline History</h2>',
    (data.pipelineHistory.length > 0 ? '<table><tr><th>Run ID</th><th>Platforms</th><th>Status</th><th>Cycles</th><th>Started</th></tr>' + pipelineRows + '</table>' : '<p>No pipeline runs recorded yet.</p>'),
    '</div>',
    '<div class="section"><h2>&#x1F4F1; Device Farm Execution History</h2>',
    (data.deviceFarmHistory.length > 0 ? '<table><tr><th>Status</th><th>Device</th><th>Platform</th><th>Type</th><th>Cloud</th><th>Exit Code</th><th>Completed</th></tr>' + deviceRows + '</table>' : '<p>No device farm runs recorded yet.</p>'),
    '</div>',
    '<div class="section"><h2>&#x1F4C4; Pipeline Reports</h2>',
    (data.pipelineReports.length > 0 ? '<table><tr><th></th><th>Report</th><th>Size</th></tr>' + pipelineReportRows + '</table>' : '<p>No pipeline reports generated yet.</p>'),
    '</div>',
    '<div class="section"><h2>&#x1F4C8; Phase Activity</h2><table><tr><th>Phase</th><th>Status</th><th>Details</th></tr>',
    '<tr><td>Phase 7 - Mobile Test Generation</td><td><span class="badge bg-success">Done</span></td><td>Android + iOS Appium tests, page objects, locators, flows</td></tr>',
    '<tr><td>Phase 8 - Device Farm Agent</td><td><span class="badge bg-success">Done</span></td><td>' + data.deviceFarmHistory.length + ' run(s) recorded</td></tr>',
    '<tr><td>Phase 9 - Self-Healing Pipeline</td><td><span class="badge bg-success">Done</span></td><td>' + data.pipelineHistory.length + ' pipeline run(s) recorded</td></tr>',
    '<tr><td>Phase 10 - AI Dashboard</td><td><span class="badge bg-success">Active</span></td><td>This dashboard</td></tr>',
    '</table></div>',
    '<div class="footer">AI Dashboard generated by AIDashboardAgent v1.0.0 | Phase 10</div>',
    '</div></body></html>',
  ].join('\n');
}

// ---------- Dashboard Agent ----------
var AIDashboardAgent = {
  name: 'AIDashboardAgent',
  version: '1.0.0',

  // Collect all data and generate the dashboard
  run: function(input: any) {
    ensureDirs();
    console.log('[AIDashboardAgent] Generating unified AI dashboard');

    var data = {
      testSummary: collectTestSummary(),
      aiReports: collectAiReportStatus(),
      pipelineHistory: collectPipelineHistory(),
      deviceFarmHistory: collectDeviceFarmHistory(),
      pipelineReports: collectPipelineReports(),
      generatedAt: new Date().toISOString(),
    };

    var html = generateDashboardHtml(data);
    var indexPath = path.join(DASHBOARD_DIR, 'index.html');
    fs.writeFileSync(indexPath, html, 'utf8');

    // Also generate JSON data snapshot
    var jsonPath = path.join(DASHBOARD_DIR, 'dashboard-data.json');
    fs.writeJsonSync(jsonPath, data, { spaces: 2 });

    console.log('[AIDashboardAgent] Dashboard written to ' + path.relative(process.cwd(), indexPath));

    return {
      ok: true,
      dashboardPath: path.relative(process.cwd(), indexPath),
      dataPath: path.relative(process.cwd(), jsonPath),
      summary: {
        totalScenarios: data.testSummary.total,
        passed: data.testSummary.passed,
        failed: data.testSummary.failed,
        passRate: data.testSummary.passRate,
        aiReports: data.aiReports.filter(function(r: any) { return r.exists; }).length,
        totalReports: data.aiReports.length,
        pipelineRuns: data.pipelineHistory.length,
        deviceFarmRuns: data.deviceFarmHistory.length,
      },
    };
  },

  // Get latest dashboard path
  getDashboardPath: function() {
    return path.join(DASHBOARD_DIR, 'index.html');
  },

  // Get dashboard data JSON
  getDashboardData: function() {
    return safeReadJson(path.join(DASHBOARD_DIR, 'dashboard-data.json'));
  },
};

// CLI entry point
function main() {
  var command = process.argv[2] || 'generate';

  if (command === 'generate' || command === 'run') {
    var result: any = AIDashboardAgent.run({});
    console.log(JSON.stringify(result, null, 2));
    console.log('\nOpen dashboard: file://' + AIDashboardAgent.getDashboardPath());
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'path') {
    console.log(AIDashboardAgent.getDashboardPath());
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: generate, run, path');
}

if (require.main === module) {
  try {
    main();
  } catch (e: any) {
    console.error('[AIDashboardAgent] CLI error:', e.message);
    process.exit(1);
  }
}

export default AIDashboardAgent;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "AI Dashboard Agent",
  "version": "1.0.0",
  "description": "Unified HTML dashboard aggregating test results, pipeline runs, and AI reports",
  "dependencies": ["ReportAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "reporting",
    "dashboard"
  ],
  "executionStage": "reporting",
  "priority": 75,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 1,
    "backoff": "none"
  },
  "strategy": "dashboard-strategy",
  "responsibilities": ["reporting"],
  "owner": "ReportAgent",
  "lifecycle": "active"
};
