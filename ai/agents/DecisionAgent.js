// DecisionAgent - Makes autonomous decisions about test execution strategies, healing actions, and release readiness
const fs = require('fs-extra');
const path = require('path');
const DecisionEngine = require("../core/DecisionEngine");

const BaseAgent = require('./baseAgent');

const agent = new BaseAgent({
  name: 'Decision Agent',
  role: 'Evaluate multiple inputs (test results, analysis reports, risk scores) and make autonomous decisions.',
  promptFile: 'test-case-generation.prompt.md',
  outputType: 'Decision rationale and recommended actions'
});

agent.run = async function run(input) {
  if (!input) input = {};
  console.log("[DecisionAgent] Evaluating inputs and making decisions");

  // Build decision object early — no TDZ risk since it's the first statement
  var decision = {
    timestamp: new Date().toISOString(),
    context: {},
    decisions: [],
    rationale: []
  };

  // Evaluate with DecisionEngine — wrapped in try/catch for resilience
  var engineDecisions;
  try {
    var engine = new DecisionEngine();
    engineDecisions = await engine.evaluate(input);
  } catch (engineErr) {
    console.warn("[DecisionAgent] DecisionEngine evaluate failed: " + engineErr.message);
    engineDecisions = {
      agents: { always: [], conditional: [], skip: [] },
      llm: { strategy: 'rag', model: 'default', temperature: 0.2 },
      healing: { primary: 'rag', mode: 'recommend' },
      retry: { maxRetries: 0, backoff: 'none' },
      pipeline: { stages: [] },
      context: { risk: { level: 'unknown', score: 0 }, priority: 'normal' },
      timestamp: new Date().toISOString()
    };
  }

  // Defensive access — engineDecisions is guaranteed non-null after try/catch above
  var engineCtx = engineDecisions && engineDecisions.context ? engineDecisions.context : {};
  decision.engine = engineDecisions;
  decision.context.riskLevel = (engineCtx.risk && engineCtx.risk.level) || 'unknown';
  decision.context.riskScore = (engineCtx.risk && engineCtx.risk.score) || 0;
  decision.context.priority = engineCtx.priority || 'normal';
  decision.context.llmStrategy = (engineDecisions && engineDecisions.llm && engineDecisions.llm.strategy) || 'rag';
  decision.context.healingStrategy = (engineDecisions && engineDecisions.healing && engineDecisions.healing.primary) || 'rag';
  decision.context.retryStrategy = JSON.stringify((engineDecisions && engineDecisions.retry) || {});

  // 1. Evaluate if execution plan should proceed
  var planPath = path.join(process.cwd(), 'reports/ai/execution-plan.json');
  if (fs.existsSync(planPath)) {
    try {
      var plan = fs.readJsonSync(planPath);
      decision.context.hasPlan = true;
      decision.context.planSteps = plan.plan ? plan.plan.length : 0;
      decision.decisions.push({
        area: 'execution_plan',
        decision: 'PROCEED',
        confidence: 0.9,
        reason: 'Execution plan exists with defined steps'
      });
    } catch (_) {
      decision.decisions.push({
        area: 'execution_plan',
        decision: 'GENERATE_PLAN',
        confidence: 0.7,
        reason: 'Execution plan file is corrupt, recommend generating one first'
      });
    }
  } else {
    decision.decisions.push({
      area: 'execution_plan',
      decision: 'GENERATE_PLAN',
      confidence: 0.7,
      reason: 'No execution plan found, recommend generating one first'
    });
  }

  // 2. Evaluate test results
  var reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
  if (fs.existsSync(reportPath)) {
    try {
      var report = fs.readJsonSync(reportPath);
      var features = Array.isArray(report) ? report : [];
      var allScenarios = [];
      for (var fi = 0; fi < features.length; fi++) {
        var f = features[fi];
        var elements = f.elements || [];
        for (var ei = 0; ei < elements.length; ei++) {
          if (elements[ei].type === 'scenario') allScenarios.push(elements[ei]);
        }
      }
      var passed = [];
      var failed = [];
      for (var si = 0; si < allScenarios.length; si++) {
        var s = allScenarios[si];
        var steps = s.steps || [];
        var hasFailed = false;
        for (var ti = 0; ti < steps.length; ti++) {
          if (steps[ti].result && steps[ti].result.status === 'failed') {
            hasFailed = true;
            break;
          }
        }
        if (hasFailed) failed.push(s);
        else passed.push(s);
      }
      var passRate = allScenarios.length > 0 ? (passed.length / allScenarios.length) * 100 : 0;

      decision.context.totalScenarios = allScenarios.length;
      decision.context.passed = passed.length;
      decision.context.failed = failed.length;
      decision.context.passRate = passRate;

      if (passRate >= 95) {
        decision.decisions.push({ area: 'test_quality', decision: 'HIGH_QUALITY', confidence: 0.95, reason: 'Pass rate ' + passRate.toFixed(1) + '%' });
      } else if (passRate >= 80) {
        decision.decisions.push({ area: 'test_quality', decision: 'ACCEPTABLE', confidence: 0.80, reason: 'Pass rate ' + passRate.toFixed(1) + '% - investigate failures' });
      } else {
        decision.decisions.push({ area: 'test_quality', decision: 'BLOCKING', confidence: 0.90, reason: 'Pass rate ' + passRate.toFixed(1) + '% - failures need resolution' });
      }
    } catch (e) {
      decision.decisions.push({ area: 'test_quality', decision: 'INCONCLUSIVE', confidence: 0.5, reason: 'Could not parse report: ' + e.message });
    }
  }

  // 3. Evaluate locator healing necessity
  var healingPath = path.join(process.cwd(), 'reports/ai/locator-healing-proposals.json');
  if (fs.existsSync(healingPath)) {
    try {
      var healing = fs.readJsonSync(healingPath);
      var proposals = healing.proposals || [];
      var lowRisk = [];
      var highRisk = [];
      for (var pi = 0; pi < proposals.length; pi++) {
        if (proposals[pi].risk === 'LOW') lowRisk.push(proposals[pi]);
        else highRisk.push(proposals[pi]);
      }

      decision.context.locatorProposals = proposals.length;
      decision.context.lowRiskProposals = lowRisk.length;

      if (lowRisk.length > 0) {
        decision.decisions.push({
          area: 'locator_healing',
          decision: 'APPLY_LOW_RISK',
          confidence: 0.85,
          reason: lowRisk.length + ' low-risk locator replacements available'
        });
      }
      if (highRisk.length > 0) {
        decision.decisions.push({
          area: 'locator_healing',
          decision: 'MANUAL_REVIEW_REQUIRED',
          confidence: 0.75,
          reason: highRisk.length + ' medium/high risk proposals need manual review'
        });
      }
    } catch (_) {
      // ignore parse errors
    }
  }

  // 4. Evaluate release readiness
  var currentPassRate = decision.context.passRate !== undefined ? decision.context.passRate : 0;
  decision.decisions.push({
    area: 'overall_readiness',
    decision: currentPassRate >= 80 ? 'READY_FOR_RELEASE' : 'HOLD_FOR_FIXES',
    confidence: 0.80,
    reason: currentPassRate >= 80
      ? 'Pass rate ' + currentPassRate.toFixed(1) + '% meets release threshold'
      : 'Pass rate ' + currentPassRate.toFixed(1) + '% below 80% threshold'
  });

  // Output
  var outPath = path.join(process.cwd(), 'reports/ai', 'decision-report.md');
  fs.ensureDirSync(path.dirname(outPath));

  var lines = [];
  lines.push('# Decision Agent Report');
  lines.push('');
  lines.push('Generated: ' + decision.timestamp);
  lines.push('');
  lines.push('## Context');
  lines.push('');
  for (var key in decision.context) {
    if (decision.context.hasOwnProperty(key)) {
      lines.push('- **' + key + '**: ' + decision.context[key]);
    }
  }
  lines.push('');
  lines.push('## Decisions');
  lines.push('');
  for (var di = 0; di < decision.decisions.length; di++) {
    var d = decision.decisions[di];
    lines.push('### ' + d.area);
    lines.push('- **Decision**: ' + d.decision);
    lines.push('- **Confidence**: ' + (d.confidence * 100).toFixed(0) + '%');
    lines.push('- **Reason**: ' + d.reason);
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


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Decision Agent",
  "version": "1.0.0",
  "description": "Evaluates test results and makes autonomous execution decisions",
  "dependencies": ["PlannerAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "decision",
    "orchestration"
  ],
  "executionStage": "multi-agent",
  "priority": 75,
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
