#!/usr/bin/env node

/**
 * AI JMeter Performance Analysis Agent
 * ======================================
 * Reads JMeter JTL/summary report, analyzes performance metrics,
 * classifies issues, and generates an AI performance report.
 *
 * Usage:
 *   node ai/agents/jmeterPerformanceAnalysisAgent.js [--jtl <path>] [--json <path>]
 *
 * Environment:
 *   JMETER_SUMMARY_JSON  - path to jmeter-summary.json (auto-detected)
 *   JMETER_JTL           - path to JTL file (auto-detected)
 *   AI_MODEL             - LLM model name (optional, for future LLM integration)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SUMMARY_JSON_DIR = path.join(ROOT, 'reports', 'jmeter', 'summary');
const JTL_DIR = path.join(ROOT, 'reports', 'jmeter', 'jtl');
const HTML_DIR = path.join(ROOT, 'reports', 'jmeter', 'html');
const AI_REPORT_DIR = path.join(ROOT, 'reports', 'ai');
const AI_REPORT_PATH = path.join(AI_REPORT_DIR, 'jmeter-performance-report.md');

// --- ANSI colors for console ---
const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// --- Issue classification ---
const ISSUE_CLASSIFICATIONS = {
  HIGH_RESPONSE_TIME: {
    id: 'high_response_time',
    label: 'High Response Time',
    severity: 'high',
    description: 'Average or percentile response times exceed acceptable thresholds',
    recommendation: 'Optimize server-side processing, implement caching, use CDN, reduce payload size',
  },
  HIGH_ERROR_RATE: {
    id: 'high_error_rate',
    label: 'High Error Rate',
    severity: 'critical',
    description: 'Error percentage exceeds acceptable threshold',
    recommendation: 'Check server logs, validate API endpoints, review assertions, check for throttling',
  },
  THROUGHPUT_BOTTLENECK: {
    id: 'throughput_bottleneck',
    label: 'Throughput Bottleneck',
    severity: 'high',
    description: 'System cannot handle the expected number of requests per second',
    recommendation: 'Scale horizontally, optimize database queries, implement connection pooling',
  },
  SERVER_NETWORK_ISSUE: {
    id: 'server_network_issue',
    label: 'Server/Network Issue',
    severity: 'medium',
    description: 'High connect time, latency, or DNS resolution delays detected',
    recommendation: 'Check network infrastructure, DNS configuration, server health, firewall rules',
  },
  TEST_DATA_ISSUE: {
    id: 'test_data_issue',
    label: 'Test Data Issue',
    severity: 'low',
    description: 'Inconsistent test data causing varied response patterns',
    recommendation: 'Validate test data consistency, use data parameterization, check for cache poisoning',
  },
  NORMAL: {
    id: 'normal',
    label: 'Normal Performance',
    severity: 'info',
    description: 'All metrics within acceptable thresholds',
    recommendation: 'Continue monitoring; no action required',
  },
};

// --- Find latest summary JSON ---
function findLatestSummaryJson() {
  const explicit = process.env.JMETER_SUMMARY_JSON || getCliArg('--json');
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  if (fs.existsSync(SUMMARY_JSON_DIR)) {
    const files = fs.readdirSync(SUMMARY_JSON_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 0) return path.join(SUMMARY_JSON_DIR, files[0]);
  }

  // Check default path
  const defaultPath = path.join(SUMMARY_JSON_DIR, 'jmeter-summary.json');
  if (fs.existsSync(defaultPath)) return defaultPath;

  return null;
}

// --- Find latest JTL ---
function findLatestJtl() {
  const explicit = process.env.JMETER_JTL || getCliArg('--jtl');
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  if (fs.existsSync(JTL_DIR)) {
    const files = fs.readdirSync(JTL_DIR)
      .filter(f => f.endsWith('.jtl'))
      .sort()
      .reverse();
    if (files.length > 0) return path.join(JTL_DIR, files[0]);
  }

  return null;
}

// --- CLI arg helper ---
function getCliArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

// --- Classify issues from summary ---
function classifyIssues(summary, thresholds) {
  const issues = [];

  // 1. High Response Time
  if (summary.avgResponseTime > thresholds.avgResponseTime) {
    issues.push({
      ...ISSUE_CLASSIFICATIONS.HIGH_RESPONSE_TIME,
      metric: 'avgResponseTime',
      actual: summary.avgResponseTime,
      threshold: thresholds.avgResponseTime,
      details: `Average response time ${summary.avgResponseTime}ms exceeds threshold ${thresholds.avgResponseTime}ms`,
    });
  }
  if (summary.percentiles.p90 > thresholds.pct90) {
    // Check if not already added
    const existing = issues.find(i => i.id === 'high_response_time');
    if (existing) {
      existing.details += ` | P90 ${summary.percentiles.p90}ms exceeds threshold ${thresholds.pct90}ms`;
    } else {
      issues.push({
        ...ISSUE_CLASSIFICATIONS.HIGH_RESPONSE_TIME,
        metric: 'p90',
        actual: summary.percentiles.p90,
        threshold: thresholds.pct90,
        details: `P90 response time ${summary.percentiles.p90}ms exceeds threshold ${thresholds.pct90}ms`,
      });
    }
  }

  // 2. High Error Rate
  if (summary.errorPct > thresholds.errorPct) {
    issues.push({
      ...ISSUE_CLASSIFICATIONS.HIGH_ERROR_RATE,
      metric: 'errorPct',
      actual: summary.errorPct,
      threshold: thresholds.errorPct,
      details: `Error rate ${summary.errorPct}% exceeds threshold ${thresholds.errorPct}%`,
    });
  }

  // 3. Throughput Bottleneck (heuristic: throughput < 10 req/sec for web apps)
  if (summary.throughput < 10 && summary.totalSamples > 0) {
    issues.push({
      ...ISSUE_CLASSIFICATIONS.THROUGHPUT_BOTTLENECK,
      metric: 'throughput',
      actual: summary.throughput,
      threshold: 10,
      details: `Throughput ${summary.throughput} req/sec is below expected 10 req/sec`,
    });
  }

  // 4. Server/Network Issue (high connect time or latency)
  if (summary.avgConnectTime > 2000) {
    issues.push({
      ...ISSUE_CLASSIFICATIONS.SERVER_NETWORK_ISSUE,
      metric: 'avgConnectTime',
      actual: summary.avgConnectTime,
      threshold: 2000,
      details: `Average connect time ${summary.avgConnectTime}ms exceeds 2000ms threshold`,
    });
  }
  if (summary.avgLatency > summary.avgResponseTime * 0.8) {
    issues.push({
      ...ISSUE_CLASSIFICATIONS.SERVER_NETWORK_ISSUE,
      metric: 'latencyRatio',
      actual: summary.avgLatency,
      threshold: Math.round(summary.avgResponseTime * 0.8),
      details: `Latency ${summary.avgLatency}ms is >80% of response time ${summary.avgResponseTime}ms`,
    });
  }

  // 5. Test Data Issue (check per-label variance)
  if (summary.byLabel && summary.byLabel.length >= 2) {
    const responseTimes = summary.byLabel.map(l => l.avg);
    const maxRt = Math.max(...responseTimes);
    const minRt = Math.min(...responseTimes);
    if (minRt > 0 && maxRt / minRt > 10) {
      issues.push({
        ...ISSUE_CLASSIFICATIONS.TEST_DATA_ISSUE,
        metric: 'labelVariance',
        actual: Math.round(maxRt / minRt),
        threshold: 10,
        details: `Response time variance across transactions is ${Math.round(maxRt / minRt)}x (min=${minRt}ms, max=${maxRt}ms)`,
      });
    }
  }

  // 6. Check per-label errors
  if (summary.byLabel) {
    for (const label of summary.byLabel) {
      if (label.errorPct > 0) {
        issues.push({
          ...ISSUE_CLASSIFICATIONS.HIGH_ERROR_RATE,
          id: `high_error_rate_${label.label.replace(/\s+/g, '_')}`,
          metric: 'errorPct',
          label: label.label,
          actual: label.errorPct,
          threshold: 0,
          details: `Transaction "${label.label}" has ${label.errorPct}% error rate (${label.errors}/${label.samples})`,
        });
      }
    }
  }

  if (issues.length === 0) {
    issues.push(ISSUE_CLASSIFICATIONS.NORMAL);
  }

  return issues;
}

// --- Generate AI analysis report ---
async function generateReport(summary, thresholds, issues, jtlPath) {
  const now = new Date().toISOString();
  const overallSeverity = issues.some(i => i.severity === 'critical') ? 'CRITICAL'
    : issues.some(i => i.severity === 'high') ? 'HIGH'
    : issues.some(i => i.severity === 'medium') ? 'MEDIUM'
    : 'LOW';

  const md = [];
  md.push('# 🤖 AI-Powered JMeter Performance Analysis Report');
  md.push('');
  md.push(`**Generated:** ${now}`);
  md.push(`**Overall Status:** ${issues.length === 1 && issues[0].id === 'normal' ? '✅ HEALTHY' : overallSeverity === 'CRITICAL' ? '❌ CRITICAL' : overallSeverity === 'HIGH' ? '⚠️  DEGRADED' : '⚠️  WARNING'}`);
  md.push(`**Source JTL:** ${jtlPath || 'N/A'}`);
  md.push('');
  md.push('---');
  md.push('');
  md.push('## 📋 Summary Metrics');
  md.push('');
  md.push('| Metric | Value | Evaluation |');
  md.push('|--------|-------|------------|');
  md.push(`| Total Samples | ${summary.totalSamples} | — |`);
  md.push(`| Throughput | ${summary.throughput} req/sec | ${summary.throughput >= 10 ? '✅ Good' : '⚠️ Low'} |`);
  md.push(`| Avg Response Time | ${summary.avgResponseTime} ms | ${summary.avgResponseTime <= thresholds.avgResponseTime ? '✅ Within limit' : '❌ Exceeded'} |`);
  md.push(`| Min Response Time | ${summary.minResponseTime} ms | — |`);
  md.push(`| Max Response Time | ${summary.maxResponseTime} ms | — |`);
  md.push(`| Avg Latency | ${summary.avgLatency} ms | ${summary.avgLatency <= 2000 ? '✅ Normal' : '⚠️ High'} |`);
  md.push(`| Avg Connect Time | ${summary.avgConnectTime} ms | ${summary.avgConnectTime <= 2000 ? '✅ Normal' : '❌ High'} |`);
  md.push(`| Error Rate | ${summary.errorPct}% | ${summary.errorPct <= thresholds.errorPct ? '✅ Within limit' : '❌ Exceeded'} |`);
  md.push(`| Duration | ${summary.durationSec}s | — |`);
  md.push('');
  md.push('## 📊 Percentile Analysis');
  md.push('');
  md.push('| Percentile | Response Time (ms) | Status |');
  md.push('|------------|-------------------|--------|');
  md.push(`| P50 (Median) | ${summary.percentiles.p50} | ${summary.percentiles.p50 <= thresholds.avgResponseTime ? '✅' : '⚠️'} |`);
  md.push(`| P90 | ${summary.percentiles.p90} | ${summary.percentiles.p90 <= thresholds.pct90 ? '✅' : '❌'} |`);
  md.push(`| P95 | ${summary.percentiles.p95} | ${summary.percentiles.p95 <= thresholds.pct90 * 1.2 ? '✅' : '❌'} |`);
  md.push(`| P99 | ${summary.percentiles.p99} | ${summary.percentiles.p99 <= thresholds.pct90 * 1.5 ? '⚠️' : '❌'} |`);
  md.push('');
  md.push('---');
  md.push('');
  md.push('## 🔍 Detected Issues');
  md.push('');

  if (issues.length === 0 || (issues.length === 1 && issues[0].id === 'normal')) {
    md.push('✅ **No issues detected.** All performance metrics are within acceptable thresholds.');
    md.push('');
  } else {
    for (const issue of issues) {
      const sevIcon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : issue.severity === 'medium' ? '🟡' : '🟢';
      md.push(`### ${sevIcon} ${issue.label}`);
      md.push('');
      md.push(`- **Severity:** ${issue.severity.toUpperCase()}`);
      md.push(`- **Description:** ${issue.description}`);
      md.push(`- **Details:** ${issue.details || 'N/A'}`);
      if (issue.recommendation) {
        md.push(`- **Recommendation:** ${issue.recommendation}`);
      }
      md.push('');
    }
  }

  md.push('---');
  md.push('');
  md.push('## 🏷️ Per-Transaction Breakdown');
  md.push('');
  md.push('| Transaction | Samples | Errors | Error% | Avg(ms) | Min(ms) | Max(ms) | Health |');
  md.push('|-------------|---------|--------|--------|---------|---------|---------|--------|');
  for (const label of summary.byLabel || []) {
    const healthy = label.errorPct === 0 && label.avg <= thresholds.avgResponseTime;
    md.push(`| ${label.label} | ${label.samples} | ${label.errors} | ${label.errorPct}% | ${label.avg} | ${label.min} | ${label.max} | ${healthy ? '✅' : '❌'} |`);
  }
  md.push('');
  md.push('---');
  md.push('');
  md.push('## 🧠 AI Insights & Recommendations');
  md.push('');

  // Generate AI-style analysis
  if (issues.length === 0 || (issues.length === 1 && issues[0].id === 'normal')) {
    md.push('The system is performing well under the current load profile. All key metrics — response time, error rate, and throughput — are within acceptable thresholds. Continue monitoring for regressions as traffic patterns evolve.');
    md.push('');
    md.push('### Recommendations:');
    md.push('- Continue regular performance regression testing');
    md.push('- Consider increasing load gradually to identify breaking points');
    md.push('- Monitor for seasonal traffic patterns');
  } else {
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highIssues = issues.filter(i => i.severity === 'high');
    const mediumIssues = issues.filter(i => i.severity === 'medium');

    if (criticalIssues.length > 0) {
      md.push('### 🔴 Critical Actions Required');
      md.push('');
      for (const ci of criticalIssues) {
        md.push(`1. **${ci.label}**: ${ci.recommendation}`);
      }
      md.push('');
    }

    if (highIssues.length > 0) {
      md.push('### 🟠 High Priority Improvements');
      md.push('');
      for (const hi of highIssues) {
        md.push(`1. **${hi.label}**: ${hi.recommendation}`);
      }
      md.push('');
    }

    if (mediumIssues.length > 0) {
      md.push('### 🟡 Medium Priority Items');
      md.push('');
      for (const mi of mediumIssues) {
        md.push(`1. **${mi.label}**: ${mi.recommendation}`);
      }
      md.push('');
    }

    md.push('### 📈 Trend Analysis');
    md.push('');
    md.push(`- The system handled ${summary.totalSamples} requests over ${summary.durationSec} seconds`);
    md.push(`- Throughput averaged ${summary.throughput} requests per second`);
    md.push(`- ${summary.errorPct > 0 ? `${summary.errorPct}% of requests failed` : 'All requests completed successfully'}`);
    md.push(`- P50 response time of ${summary.percentiles.p50}ms indicates typical user experience`);
    md.push(`- P99 response time of ${summary.percentiles.p99}ms represents worst-case user experience`);
    md.push('');
  }

  md.push('---');
  md.push('');
  md.push('## ⚙️ Thresholds Applied');
  md.push('');
  md.push('| Threshold | Value |');
  md.push('|-----------|-------|');
  md.push(`| Max Error Rate | ${thresholds.errorPct}% |`);
  md.push(`| Max Avg Response Time | ${thresholds.avgResponseTime} ms |`);
  md.push(`| Max P90 Response Time | ${thresholds.pct90} ms |`);
  md.push('');
  md.push('---');
  md.push('');
  md.push(`*Report generated by AI JMeter Performance Analysis Agent*`);
  md.push(`*Agent: jmeterPerformanceAnalysisAgent.js*`);

  const content = md.join('\n');
  fs.writeFileSync(AI_REPORT_PATH, content);
  console.log(`📄 AI Report: ${AI_REPORT_PATH}`);

  return content;
}

// --- Main ---
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AI JMeter Performance Analysis Agent        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Load summary data
  const jsonPath = findLatestSummaryJson();
  if (!jsonPath) {
    console.error('❌ No JMeter summary JSON found.');
    console.error('   Run `npm run perf:jmeter` first or provide --json flag.');
    process.exit(1);
  }
  console.log(`✅ Summary JSON: ${jsonPath}`);

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error(`❌ Failed to parse summary JSON: ${e.message}`);
    process.exit(1);
  }

  const results = summary.results;
  if (!results) {
    console.error('❌ Invalid summary format — missing "results" key.');
    process.exit(1);
  }

  // Step 2: Find JTL
  const jtlPath = findLatestJtl();
  if (jtlPath) {
    console.log(`✅ JTL Results: ${jtlPath}`);
  } else {
    console.log('⚠️  No JTL file found — using summary data only.');
  }

  // Step 3: Extract thresholds
  const thresholds = summary.thresholds || {
    maxErrorPct: parseFloat(process.env.THRESHOLD_ERROR_PCT || '5'),
    maxAvgResponseTimeMs: parseFloat(process.env.THRESHOLD_RESPONSE_TIME || '5000'),
    maxP90ResponseTimeMs: 8000,
  };

  const normalizedThresholds = {
    errorPct: thresholds.maxErrorPct || thresholds.errorPct || 5,
    avgResponseTime: thresholds.maxAvgResponseTimeMs || thresholds.avgResponseTime || 5000,
    pct90: thresholds.maxP90ResponseTimeMs || thresholds.pct90 || 8000,
  };

  console.log(`\n📊 Analyzing ${results.totalSamples} samples...`);
  console.log(`   Error rate: ${results.errorPct}% (threshold: ${normalizedThresholds.errorPct}%)`);
  console.log(`   Avg resp: ${results.avgResponseTime}ms (threshold: ${normalizedThresholds.avgResponseTime}ms)`);
  console.log(`   P90 resp: ${results.percentiles.p90}ms (threshold: ${normalizedThresholds.pct90}ms)`);

  // Step 4: Classify issues
  const issues = classifyIssues(results, normalizedThresholds);

  console.log(`\n🔍 Detected ${issues.length} issue(s):`);
  for (const issue of issues) {
    const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : issue.severity === 'medium' ? '🟡' : '✅';
    console.log(`   ${icon} [${issue.severity.toUpperCase()}] ${issue.label}`);
    if (issue.details) console.log(`      → ${issue.details}`);
  }

  // Step 5: Ensure report dir
  if (!fs.existsSync(AI_REPORT_DIR)) fs.mkdirSync(AI_REPORT_DIR, { recursive: true });

  // Step 6: Generate AI report
  console.log(`\n📝 Generating AI performance report...`);
  await generateReport(results, normalizedThresholds, issues, jtlPath);

  // Step 7: Print summary
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AI Analysis Complete                        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`   AI Report:    ${AI_REPORT_PATH}`);
  console.log(`   Issues Found: ${issues.length === 1 && issues[0].id === 'normal' ? 'None ✅' : issues.length}`);
  console.log(`   Severity:     ${issues.some(i => i.severity === 'critical') ? 'CRITICAL' : issues.some(i => i.severity === 'high') ? 'HIGH' : issues.some(i => i.severity === 'medium') ? 'MEDIUM' : 'NORMAL'}`);
  console.log('');

  process.exit(0);
}

if (require.main === module) {
main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
}


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "JMeter Performance Analysis Agent",
  "version": "1.0.0",
  "description": "Analyzes JMeter JTL/summary reports for performance issues",
  "dependencies": [],
  "platforms": ["WEB", "ANDROID", "IOS", "API"],
  "tags": ["performance", "jmeter"],
  "executionStage": "multi-agent",
  "priority": 40,
  "conditions": [{"type": "hasPerformanceData"}],
  "retryPolicy": {"maxRetries": 0, "backoff": "none"},
  "lifecycle": "active"
};
