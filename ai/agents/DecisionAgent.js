// DecisionAgent - Makes autonomous decisions about test execution strategies, healing actions, and release readiness
const fs = require('fs-extra');
const path = require('path');
const BaseAgent = require('./baseAgent');

const agent = new BaseAgent({
  name: 'Decision Agent',
  role: 'Evaluate multiple inputs (test results, analysis reports, risk scores) and make autonomous decisions.',
  promptFile: 'test-case-generation.prompt.md',
  outputType: 'Decision rationale and recommended actions'
});

agent.run = async function run(input = {}) {
  console.log('[DecisionAgent] Evaluating inputs and making decisions');

  const decision = {
    timestamp: new Date().toISOString(),
    context: {},
    decisions: [],
    rationale: []
  };

  // 1. Evaluate if execution plan should proceed
  const planPath = path.join(process.cwd(), 'reports/ai/execution-plan.json');
  if (fs.existsSync(planPath)) {
    const plan = fs.readJsonSync(planPath);
    decision.context.hasPlan = true;
    decision.context.planSteps = plan.plan ? plan.plan.length : 0;
    decision.decisions.push({
      area: 'execution_plan',
      decision: 'PROCEED',
      confidence: 0.9,
      reason: 'Execution plan exists with defined steps'
    });
  } else {
    decision.decisions.push({
      area: 'execution_plan',
      decision: 'GENERATE_PLAN',
      confidence: 0.7,
      reason: 'No execution plan found, recommend generating one first'
    });
  }

  // 2. Evaluate test results
  const reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
  if (fs.existsSync(reportPath)) {
    try {
      const report = fs.readJsonSync(reportPath);
      const features = Array.isArray(report) ? report : [];
      const allScenarios = features.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'));
      const passed = allScenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'passed'));
      const failed = allScenarios.filter(s => (s.steps || []).some(st => st.result?.status === 'failed'));
      const passRate = allScenarios.length > 0 ? (passed.length / allScenarios.length) * 100 : 0;

      decision.context.totalScenarios = allScenarios.length;
      decision.context.passed = passed.length;
      decision.context.failed = failed.length;
      decision.context.passRate = passRate;

      if (passRate >= 95) {
        decision.decisions.push({ area: 'test_quality', decision: 'HIGH_QUALITY', confidence: 0.95, reason: `Pass rate ${passRate.toFixed(1)}%` });
      } else if (passRate >= 80) {
        decision.decisions.push({ area: 'test_quality', decision: 'ACCEPTABLE', confidence: 0.80, reason: `Pass rate ${passRate.toFixed(1)}% - investigate failures` });
      } else {
        decision.decisions.push({ area: 'test_quality', decision: 'BLOCKING', confidence: 0.90, reason: `Pass rate ${passRate.toFixed(1)}% - failures need resolution` });
      }
    } catch (e) {
      decision.decisions.push({ area: 'test_quality', decision: 'INCONCLUSIVE', confidence: 0.5, reason: `Could not parse report: ${e.message}` });
    }
  }

  // 3. Evaluate locator healing necessity
  const healingPath = path.join(process.cwd(), 'reports/ai/locator-healing-proposals.json');
  if (fs.existsSync(healingPath)) {
    try {
      const healing = fs.readJsonSync(healingPath);
      const proposals = healing.proposals || [];
      const lowRisk = proposals.filter(p => p.risk === 'LOW');
      const highRisk = proposals.filter(p => p.risk === 'HIGH' || p.risk === 'MEDIUM');

      decision.context.locatorProposals = proposals.length;
      decision.context.lowRiskProposals = lowRisk.length;

      if (lowRisk.length > 0) {
        decision.decisions.push({
          area: 'locator_healing',
          decision: 'APPLY_LOW_RISK',
          confidence: 0.85,
          reason: `${lowRisk.length} low-risk locator replacements available`
        });
      }
      if (highRisk.length > 0) {
        decision.decisions.push({
          area: 'locator_healing',
          decision: 'MANUAL_REVIEW_REQUIRED',
          confidence: 0.75,
          reason: `${highRisk.length} medium/high risk proposals need manual review`
        });
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  // 4. Evaluate release readiness
  decision.decisions.push({
    area: 'overall_readiness',
    decision: decision.context.passRate >= 80 ? 'READY_FOR_RELEASE' : 'HOLD_FOR_FIXES',
    confidence: 0.80,
    reason: decision.context.passRate >= 80
      ? `Pass rate ${(decision.context.passRate || 0).toFixed(1)}% meets release threshold`
      : `Pass rate ${(decision.context.passRate || 0).toFixed(1)}% below 80% threshold`
  });

  // Output
  const outPath = path.join(process.cwd(), 'reports/ai', 'decision-report.md');
  fs.ensureDirSync(path.dirname(outPath));

  const lines = [];
  lines.push('# Decision Agent Report');
  lines.push('');
  lines.push(`Generated: ${decision.timestamp}`);
  lines.push('');
  lines.push('## Context');
  lines.push('');
  for (const [key, val] of Object.entries(decision.context)) {
    lines.push(`- **${key}**: ${val}`);
  }
  lines.push('');
  lines.push('## Decisions');
  lines.push('');
  for (const d of decision.decisions) {
    lines.push(`### ${d.area}`);
    lines.push(`- **Decision**: ${d.decision}`);
    lines.push(`- **Confidence**: ${(d.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Reason**: ${d.reason}`);
    lines.push('');
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  return {
    ok: true,
    report: path.relative(process.cwd(), outPath),
    decisions: decision.decisions
  };
};

module.exports = agent;
