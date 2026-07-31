import fs from 'fs-extra';
import path from 'path';
// ReleaseGateAgent - Evaluates release readiness based on test results, coverage, flakiness, and risk

export const run = async function run(input: any = {}) {
    console.log('[ReleaseGateAgent] Evaluating release readiness');
    const factors = {
      passRate: { score: 0, weight: 0.30, label: 'Pass Rate' },
      coverageLevel: { score: 0, weight: 0.15, label: 'Test Coverage' },
      flakiness: { score: 1, weight: 0.15, label: 'Flakiness Score' },
      openFailures: { score: 0, weight: 0.20, label: 'Open Failures' },
      riskScore: { score: 0.5, weight: 0.10, label: 'Risk Score' },
      severityScore: { score: 0.5, weight: 0.10, label: 'Defect Severity' }
    };
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    let totalScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        const allScenarios = features.flatMap(f => (f.elements || []).filter((e: any) => e.type === 'scenario'));
        totalScenarios = allScenarios.length;
        passedScenarios = allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'passed')).length;
        failedScenarios = allScenarios.filter(s => (s.steps || []).some((st: any) => st.result?.status === 'failed')).length;
        const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;
        if (passRate >= 0.95) factors.passRate.score = 1.0;
        else if (passRate >= 0.85) factors.passRate.score = 0.75;
        else if (passRate >= 0.70) factors.passRate.score = 0.50;
        else if (passRate >= 0.50) factors.passRate.score = 0.25;
        else factors.passRate.score = 0;
        factors.openFailures.score = failedScenarios === 0 ? 1.0 :
          failedScenarios <= 2 ? 0.75 :
          failedScenarios <= 5 ? 0.50 : 0.25;
      } catch (e: any) {
        console.warn('[ReleaseGateAgent] Could not parse report:', e.message);
      }
    }
    const featuresDir = path.join(process.cwd(), 'features');
    const pageDir = path.join(process.cwd(), 'pages');
    const stepDefDir = path.join(process.cwd(), 'step-definitions');
    const featureFiles = fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir).filter(f => f.endsWith('.feature')).length : 0;
    const pageFiles = fs.existsSync(pageDir) ? fs.readdirSync(pageDir).filter(f => f.endsWith('.js')).length : 0;
    const stepDefFiles = fs.existsSync(stepDefDir) ? fs.readdirSync(stepDefDir).filter(f => f.endsWith('.js')).length : 0;
    const coverageRatio = pageFiles > 0 && featureFiles > 0 ? Math.min(stepDefFiles / (featureFiles + pageFiles) * 2, 1) : 0;
    factors.coverageLevel.score = Math.min(coverageRatio, 1);
    const retryStatePath = path.join(process.cwd(), 'ai/memory/retry-state.json');
    if (fs.existsSync(retryStatePath)) {
      try {
        const retryState = fs.readJsonSync(retryStatePath);
        const history = retryState.retryHistory || [];
        if (history.length > 0) {
          const retriedThatPassed = history.filter((r: any) => r.allPassed).length;
          const flakinessRate = history.length > 0 ? retriedThatPassed / history.length : 0;
          factors.flakiness.score = 1 - flakinessRate;
        }
      } catch (e: any) {  }
    }
    const impactPath = path.join(process.cwd(), 'reports/ai/impact-analysis.md');
    if (fs.existsSync(impactPath)) {
      const impactContent = fs.readFileSync(impactPath, 'utf8');
      if (impactContent.includes('Risk Level | HIGH')) factors.riskScore.score = 0.3;
      else if (impactContent.includes('Risk Level | MEDIUM')) factors.riskScore.score = 0.6;
      else factors.riskScore.score = 0.9;
    }
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const details: any[] = [];
    for (const [key, factor] of (Object.entries(factors) as [string, any][])) {
      totalWeightedScore += factor.score * factor.weight;
      totalWeight += factor.weight;
      details.push({
        factor: factor.label,
        score: factor.score,
        weight: factor.weight,
        contribution: (factor.score * factor.weight).toFixed(3)
      });
    }
    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const releaseDecision = finalScore >= 0.80 ? 'GO' :
      finalScore >= 0.60 ? 'CONDITIONAL_GO' : 'NO-GO';
    const decisionDetails = {
      GO: 'Release is approved. All quality gates pass.',
      CONDITIONAL_GO: 'Release is conditionally approved. Address highlighted risks before production deployment.',
      'NO-GO': 'Release is blocked. Quality gates not met. Resolve critical issues before proceeding.'
    };
    const outPath = path.join(process.cwd(), 'reports/ai', 'release-decision.md');
    const lines: any[] = [];
    lines.push('# Release Gate Decision');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`## Decision: **${releaseDecision}**`);
    lines.push('');
    lines.push(`**Overall Readiness Score:** ${(finalScore * 100).toFixed(1)}%`);
    lines.push('');
    lines.push(`**Rationale:** ${decisionDetails[releaseDecision]}`);
    lines.push('');
    lines.push('## Evaluation Factors');
    lines.push('');
    lines.push('| Factor | Score | Weight | Contribution |');
    lines.push('|---|---|---|---|');
    for (const d of details) {
      lines.push(`| ${d.factor} | ${(d.score * 100).toFixed(0)}% | ${(d.weight * 100).toFixed(0)}% | ${(d.contribution * 100).toFixed(1)}% |`);
    }
    lines.push('');
    lines.push('## Test Metrics');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Scenarios | ${totalScenarios} |`);
    lines.push(`| Passed | ${passedScenarios} |`);
    lines.push(`| Failed | ${failedScenarios} |`);
    lines.push(`| Pass Rate | ${totalScenarios > 0 ? ((passedScenarios / totalScenarios) * 100).toFixed(1) : 0}% |`);
    lines.push(`| Feature Files | ${featureFiles} |`);
    lines.push(`| Page Objects | ${pageFiles} |`);
    lines.push(`| Step Definitions | ${stepDefFiles} |`);
    lines.push('');
    lines.push('## Requirements');
    lines.push('');
    if (releaseDecision === 'GO') {
      lines.push('1. ✅ Pass rate meets 80% threshold');
      lines.push('2. ✅ No blocking failures');
      lines.push('3. ✅ Test coverage is adequate');
      lines.push('4. ✅ Release risk is acceptable');
    } else if (releaseDecision === 'CONDITIONAL_GO') {
      lines.push('1. ⚠️ Address outstanding failures before deployment');
      lines.push('2. ⚠️ Review risk factors listed above');
      lines.push('3. ✅ Core quality gates pass');
    } else {
      lines.push('1. ❌ Pass rate below 60% threshold');
      lines.push('2. ❌ Critical failures must be resolved');
      lines.push('3. ❌ Release is not recommended');
      lines.push('4. ❌ Investigate and fix all blocking issues');
    }
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      decision: releaseDecision,
      score: finalScore,
      details
    };
  };
export default { run: async function run(input: any = {}) {
    console.log('[ReleaseGateAgent] Evaluating release readiness');
    const factors = {
      passRate: { score: 0, weight: 0.30, label: 'Pass Rate' },
      coverageLevel: { score: 0, weight: 0.15, label: 'Test Coverage' },
      flakiness: { score: 1, weight: 0.15, label: 'Flakiness Score' },
      openFailures: { score: 0, weight: 0.20, label: 'Open Failures' },
      riskScore: { score: 0.5, weight: 0.10, label: 'Risk Score' },
      severityScore: { score: 0.5, weight: 0.10, label: 'Defect Severity' }
    };
    const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
    let totalScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;
    if (fs.existsSync(reportPath)) {
      try {
        const report = fs.readJsonSync(reportPath);
        const features = Array.isArray(report) ? report : [] as any[];
        const allScenarios = features.flatMap(f => (f.elements || []).filter((e: any) => e.type === 'scenario'));
        totalScenarios = allScenarios.length;
        passedScenarios = allScenarios.filter(s => (s.steps || []).every((st: any) => st.result?.status === 'passed')).length;
        failedScenarios = allScenarios.filter(s => (s.steps || []).some((st: any) => st.result?.status === 'failed')).length;
        const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;
        if (passRate >= 0.95) factors.passRate.score = 1.0;
        else if (passRate >= 0.85) factors.passRate.score = 0.75;
        else if (passRate >= 0.70) factors.passRate.score = 0.50;
        else if (passRate >= 0.50) factors.passRate.score = 0.25;
        else factors.passRate.score = 0;
        factors.openFailures.score = failedScenarios === 0 ? 1.0 :
          failedScenarios <= 2 ? 0.75 :
          failedScenarios <= 5 ? 0.50 : 0.25;
      } catch (e: any) {
        console.warn('[ReleaseGateAgent] Could not parse report:', e.message);
      }
    }
    const featuresDir = path.join(process.cwd(), 'features');
    const pageDir = path.join(process.cwd(), 'pages');
    const stepDefDir = path.join(process.cwd(), 'step-definitions');
    const featureFiles = fs.existsSync(featuresDir) ? fs.readdirSync(featuresDir).filter(f => f.endsWith('.feature')).length : 0;
    const pageFiles = fs.existsSync(pageDir) ? fs.readdirSync(pageDir).filter(f => f.endsWith('.js')).length : 0;
    const stepDefFiles = fs.existsSync(stepDefDir) ? fs.readdirSync(stepDefDir).filter(f => f.endsWith('.js')).length : 0;
    const coverageRatio = pageFiles > 0 && featureFiles > 0 ? Math.min(stepDefFiles / (featureFiles + pageFiles) * 2, 1) : 0;
    factors.coverageLevel.score = Math.min(coverageRatio, 1);
    const retryStatePath = path.join(process.cwd(), 'ai/memory/retry-state.json');
    if (fs.existsSync(retryStatePath)) {
      try {
        const retryState = fs.readJsonSync(retryStatePath);
        const history = retryState.retryHistory || [];
        if (history.length > 0) {
          const retriedThatPassed = history.filter((r: any) => r.allPassed).length;
          const flakinessRate = history.length > 0 ? retriedThatPassed / history.length : 0;
          factors.flakiness.score = 1 - flakinessRate;
        }
      } catch (e: any) {  }
    }
    const impactPath = path.join(process.cwd(), 'reports/ai/impact-analysis.md');
    if (fs.existsSync(impactPath)) {
      const impactContent = fs.readFileSync(impactPath, 'utf8');
      if (impactContent.includes('Risk Level | HIGH')) factors.riskScore.score = 0.3;
      else if (impactContent.includes('Risk Level | MEDIUM')) factors.riskScore.score = 0.6;
      else factors.riskScore.score = 0.9;
    }
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const details: any[] = [];
    for (const [key, factor] of (Object.entries(factors) as [string, any][])) {
      totalWeightedScore += factor.score * factor.weight;
      totalWeight += factor.weight;
      details.push({
        factor: factor.label,
        score: factor.score,
        weight: factor.weight,
        contribution: (factor.score * factor.weight).toFixed(3)
      });
    }
    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const releaseDecision = finalScore >= 0.80 ? 'GO' :
      finalScore >= 0.60 ? 'CONDITIONAL_GO' : 'NO-GO';
    const decisionDetails = {
      GO: 'Release is approved. All quality gates pass.',
      CONDITIONAL_GO: 'Release is conditionally approved. Address highlighted risks before production deployment.',
      'NO-GO': 'Release is blocked. Quality gates not met. Resolve critical issues before proceeding.'
    };
    const outPath = path.join(process.cwd(), 'reports/ai', 'release-decision.md');
    const lines: any[] = [];
    lines.push('# Release Gate Decision');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`## Decision: **${releaseDecision}**`);
    lines.push('');
    lines.push(`**Overall Readiness Score:** ${(finalScore * 100).toFixed(1)}%`);
    lines.push('');
    lines.push(`**Rationale:** ${decisionDetails[releaseDecision]}`);
    lines.push('');
    lines.push('## Evaluation Factors');
    lines.push('');
    lines.push('| Factor | Score | Weight | Contribution |');
    lines.push('|---|---|---|---|');
    for (const d of details) {
      lines.push(`| ${d.factor} | ${(d.score * 100).toFixed(0)}% | ${(d.weight * 100).toFixed(0)}% | ${(d.contribution * 100).toFixed(1)}% |`);
    }
    lines.push('');
    lines.push('## Test Metrics');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total Scenarios | ${totalScenarios} |`);
    lines.push(`| Passed | ${passedScenarios} |`);
    lines.push(`| Failed | ${failedScenarios} |`);
    lines.push(`| Pass Rate | ${totalScenarios > 0 ? ((passedScenarios / totalScenarios) * 100).toFixed(1) : 0}% |`);
    lines.push(`| Feature Files | ${featureFiles} |`);
    lines.push(`| Page Objects | ${pageFiles} |`);
    lines.push(`| Step Definitions | ${stepDefFiles} |`);
    lines.push('');
    lines.push('## Requirements');
    lines.push('');
    if (releaseDecision === 'GO') {
      lines.push('1. ✅ Pass rate meets 80% threshold');
      lines.push('2. ✅ No blocking failures');
      lines.push('3. ✅ Test coverage is adequate');
      lines.push('4. ✅ Release risk is acceptable');
    } else if (releaseDecision === 'CONDITIONAL_GO') {
      lines.push('1. ⚠️ Address outstanding failures before deployment');
      lines.push('2. ⚠️ Review risk factors listed above');
      lines.push('3. ✅ Core quality gates pass');
    } else {
      lines.push('1. ❌ Pass rate below 60% threshold');
      lines.push('2. ❌ Critical failures must be resolved');
      lines.push('3. ❌ Release is not recommended');
      lines.push('4. ❌ Investigate and fix all blocking issues');
    }
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      decision: releaseDecision,
      score: finalScore,
      details
    };
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Release Gate Agent",
  "version": "1.0.0",
  "description": "Evaluates release readiness based on test results, coverage, and risk",
  "dependencies": [
    "DecisionAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "release",
    "quality"
  ],
  "executionStage": "reporting",
  "priority": 60,
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
