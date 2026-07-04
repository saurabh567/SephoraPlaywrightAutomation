// HealingAgent - Orchestrates locator healing, auto-apply, and rollback decisions after failure analysis
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  run: async function run(input = {}) {
    console.log('[HealingAgent] Starting healing orchestration');

    const failures = input.failures || (() => {
      try {
        const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
        if (!fs.existsSync(reportPath)) return [];
        const report = fs.readJsonSync(reportPath);
        const scenarios = Array.isArray(report)
          ? report.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'))
          : [];
        return scenarios
          .filter(s => (s.steps || []).some(st => st.result?.status === 'failed'))
          .map(s => {
            const failedStep = (s.steps || []).find(st => st.result?.status === 'failed');
            return {
              locator: s.name || 'unknown',
              feature: 'unknown',
              scenario: s.name,
              error: failedStep?.result?.error_message || 'Unknown error',
              step: failedStep?.name || ''
            };
          });
      } catch (e) {
        return [];
      }
    })();

    if (!failures.length) {
      const outPath = path.join(process.cwd(), 'reports/ai', 'healing-report.md');
      fs.ensureDirSync(path.dirname(outPath));
      fs.writeFileSync(outPath, '# Healing Report\n\nNo failures detected. No healing needed.', 'utf8');
      return { ok: true, skipped: true, reason: 'No failures found' };
    }

    console.log(`[HealingAgent] Analyzing ${failures.length} failures for healing`);

    // Try to use the LocatorHealingEngine
    let healingResults;
    try {
      const LocatorHealingEngine = require('./locator-healing/LocatorHealingEngine');
      const engine = new LocatorHealingEngine({ mode: input.mode || 'recommend' });
      healingResults = await engine.healFailures(failures);
    } catch (e) {
      console.warn('[HealingAgent] LocatorHealingEngine not available, using fallback');
      healingResults = {
        analytics: { totalFailures: failures.length, totalApplied: 0, totalSkipped: failures.length },
        results: failures.map(f => ({
          failure: f,
          candidatesGenerated: 0,
          bestCandidate: null,
          applied: false,
          error: 'Healing engine not available'
        }))
      };
    }

    // Write summary report
    const outPath = path.join(process.cwd(), 'reports/ai', 'healing-report.md');
    fs.ensureDirSync(path.dirname(outPath));

    const lines = [];
    lines.push('# Healing Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Failures | ${healingResults.analytics.totalFailures} |`);
    lines.push(`| Candidates Generated | ${healingResults.analytics.totalCandidatesGenerated || 0} |`);
    lines.push(`| Auto-Applied | ${healingResults.analytics.totalApplied} |`);
    lines.push(`| Skipped | ${healingResults.analytics.totalSkipped} |`);
    lines.push(`| Avg Confidence | ${healingResults.analytics.averageConfidence || 0} |`);
    lines.push('');
    lines.push('## Healing Details');
    lines.push('');

    for (const r of healingResults.results) {
      lines.push(`### ${r.failure?.locator || 'unknown'}`);
      lines.push(`- **Error**: ${r.failure?.error || 'Unknown'}`);
      if (r.bestCandidate) {
        lines.push(`- **Best Candidate**: \`${r.bestCandidate.locator}\``);
        lines.push(`- **Confidence**: ${r.bestCandidate.confidenceScore} (${r.bestCandidate.confidenceLabel})`);
        lines.push(`- **Applied**: ${r.applied ? 'Yes' : 'No'}`);
      } else {
        lines.push(`- **Status**: No suitable candidate found`);
      }
      lines.push('');
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      analytics: healingResults.analytics,
      results: healingResults.results
    };
  }
};


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Healing Orchestrator",
  "version": "1.0.0",
  "description": "Orchestrates locator healing via LocatorHealingEngine",
  "dependencies": ["failureAnalysisAgent","locatorHealingAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "healing",
    "orchestration"
  ],
  "executionStage": "multi-agent",
  "priority": 60,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 1,
    "backoff": "linear"
  },
  "strategy": "engine-strategy",
  "responsibilities": ["locator-healing"],
  "owner": "locatorHealingAgent",
  "lifecycle": "active"
};
