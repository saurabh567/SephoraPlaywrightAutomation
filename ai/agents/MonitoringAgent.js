// MonitoringAgent - Monitors application health, API endpoints, and detects regressions
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  run: async function run(input = {}) {
    console.log('[MonitoringAgent] Checking application and pipeline health');

    const checks = [];
    const reportDir = path.join(process.cwd(), 'reports/ai');
    fs.ensureDirSync(reportDir);

    // 1. Check base URL availability
    const baseUrl = input.baseUrl || process.env.BASE_URL || 'https://www.amazon.in';
    try {
      const startTime = Date.now();
      const https = require('https');
      const http = require('http');
      const protocol = baseUrl.startsWith('https') ? https : http;

      const responseTime = await new Promise((resolve, reject) => {
        const req = protocol.get(baseUrl, (res) => {
          const elapsed = Date.now() - startTime;
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, responseTime: elapsed, bodyLength: data.length });
          });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
      });

      checks.push({
        type: 'APPLICATION_HEALTH',
        target: baseUrl,
        status: responseTime.statusCode >= 200 && responseTime.statusCode < 400 ? 'UP' : 'DEGRADED',
        statusCode: responseTime.statusCode,
        responseTimeMs: responseTime.responseTime,
        healthy: responseTime.statusCode >= 200 && responseTime.statusCode < 400
      });
    } catch (e) {
      checks.push({
        type: 'APPLICATION_HEALTH',
        target: baseUrl,
        status: 'DOWN',
        error: e.message,
        healthy: false
      });
    }

    // 2. Check recent test execution results
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    let testResults = { total: 0, passed: 0, failed: 0, passRate: 0 };

    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [];
        const allScenarios = features.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'));
        testResults.total = allScenarios.length;
        testResults.passed = allScenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'passed')).length;
        testResults.failed = allScenarios.filter(s => (s.steps || []).some(st => st.result?.status === 'failed')).length;
        testResults.passRate = testResults.total > 0 ? Number(((testResults.passed / testResults.total) * 100).toFixed(2)) : 0;

        checks.push({
          type: 'TEST_EXECUTION',
          status: testResults.failed === 0 ? 'HEALTHY' : testResults.failed <= 3 ? 'DEGRADED' : 'UNHEALTHY',
          total: testResults.total,
          passed: testResults.passed,
          failed: testResults.failed,
          passRate: testResults.passRate,
          healthy: testResults.failed === 0
        });
      } catch (e) {
        checks.push({
          type: 'TEST_EXECUTION',
          status: 'UNKNOWN',
          error: e.message,
          healthy: false
        });
      }
    }

    // 3. Check error rate from application monitoring
    const errorRate = input.errorRate || 0;
    checks.push({
      type: 'ERROR_RATE',
      status: errorRate < 0.01 ? 'HEALTHY' : errorRate < 0.05 ? 'DEGRADED' : 'UNHEALTHY',
      errorRate,
      healthy: errorRate < 0.01
    });

    // 4. Check for recent CI failures
    const jenkinsReportPath = path.join(process.cwd(), 'reports/ai/jenkins-analysis.md');
    if (fs.existsSync(jenkinsReportPath)) {
      const content = fs.readFileSync(jenkinsReportPath, 'utf8');
      const hasFailures = content.includes('FAILURE') && !content.includes('No failures');
      checks.push({
        type: 'CI_PIPELINE',
        status: hasFailures ? 'UNHEALTHY' : 'HEALTHY',
        lastReport: path.relative(process.cwd(), jenkinsReportPath),
        healthy: !hasFailures
      });
    }

    // 5. Check for pipeline issues
    const pipelineReportPath = path.join(process.cwd(), 'reports/ai/pipeline-healing.md');
    if (fs.existsSync(pipelineReportPath)) {
      const content = fs.readFileSync(pipelineReportPath, 'utf8');
      const hasPipelineIssues = content.includes('FAILURE') || content.includes('error');
      checks.push({
        type: 'PIPELINE_HEALTH',
        status: hasPipelineIssues ? 'UNHEALTHY' : 'HEALTHY',
        healthy: !hasPipelineIssues
      });
    }

    // Overall health
    const healthyChecks = checks.filter(c => c.healthy).length;
    const totalChecks = checks.length;
    const overallHealth = totalChecks > 0 ? (healthyChecks / totalChecks) >= 0.75 ? 'HEALTHY' :
      (healthyChecks / totalChecks) >= 0.5 ? 'DEGRADED' : 'UNHEALTHY' : 'UNKNOWN';

    // Generate report
    const outPath = path.join(reportDir, 'production-monitoring.md');
    const lines = [];

    lines.push('# Production Monitoring Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Overall Health: **${overallHealth}** (${healthyChecks}/${totalChecks} checks passing)`);
    lines.push('');
    lines.push('## Health Checks');
    lines.push('');
    lines.push('| Check | Target | Status | Details |');
    lines.push('|---|---|---|---|');

    for (const c of checks) {
      let details = '';
      if (c.responseTimeMs) details += `Response: ${c.responseTimeMs}ms, `;
      if (c.statusCode) details += `Status: ${c.statusCode}, `;
      if (c.passRate !== undefined) details += `Pass Rate: ${c.passRate}%, `;
      if (c.errorRate !== undefined) details += `Error Rate: ${(c.errorRate * 100).toFixed(2)}%, `;
      if (c.total) details += `Tests: ${c.passed}/${c.total}, `;
      if (c.error) details += `Error: ${c.error}, `;
      details = details.replace(/,\s*$/, '') || 'OK';

      const statusIcon = c.healthy ? '✅' : '❌';
      lines.push(`| ${statusIcon} ${c.type} | ${c.target || '-'} | ${c.status} | ${details} |`);
    }
    lines.push('');
    lines.push('## Alerts');
    lines.push('');

    const unhealty = checks.filter(c => !c.healthy);
    if (unhealty.length > 0) {
      for (const c of unhealty) {
        lines.push(`- ⚠️ **${c.type}** - ${c.status} - ${c.error || 'Investigation needed'}`);
      }
    } else {
      lines.push('- ✅ No active alerts. All systems healthy.');
    }
    lines.push('');
    lines.push('## Recommendations');
    lines.push('');

    if (unhealty.length === 0) {
      lines.push('- Continue monitoring. No action required.');
    } else {
      for (const c of unhealty) {
        if (c.type === 'APPLICATION_HEALTH') {
          lines.push('- Investigate application availability. Check deployment status.');
        }
        if (c.type === 'TEST_EXECUTION') {
          lines.push(`- Review ${c.failed} failing tests. Check failure analysis report.`);
        }
        if (c.type === 'ERROR_RATE') {
          lines.push('- Error rate is elevated. Monitor application logs for anomalies.');
        }
        if (c.type === 'CI_PIPELINE') {
          lines.push('- CI pipeline has issues. Check Jenkins console output.');
        }
      }
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      overallHealth,
      healthyChecks,
      totalChecks,
      checks
    };
  }
};
