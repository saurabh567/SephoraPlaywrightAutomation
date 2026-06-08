// Reads Cucumber JSON output and converts it into a compact execution summary.
const fs = require('fs-extra');
const path = require('path');

function getStepStatus(step) {
  return step.result?.status || 'unknown';
}

function summarizeScenario(feature, scenario) {
  const steps = scenario.steps || [];
  const failedStep = steps.find((step) => getStepStatus(step) === 'failed');
  const skippedSteps = steps.filter((step) => getStepStatus(step) === 'skipped').length;
  const status = failedStep ? 'failed' : skippedSteps === steps.length ? 'skipped' : 'passed';

  return {
    feature: feature.name,
    scenario: scenario.name,
    uri: feature.uri,
    line: scenario.line,
    tags: (scenario.tags || []).map((tag) => tag.name),
    status,
    failedStep: failedStep?.name || '',
    error: failedStep?.result?.error_message || ''
  };
}

function readCucumberSummary(reportDir = 'reports') {
  const reportPath = path.join(reportDir, 'json', 'cucumber-report.json');

  if (!fs.existsSync(reportPath)) {
    return {
      reportPath,
      exists: false,
      features: [],
      scenarios: [],
      failures: []
    };
  }

  const features = fs.readJsonSync(reportPath);
  const scenarios = features.flatMap((feature) =>
    (feature.elements || [])
      .filter((element) => element.type === 'scenario')
      .map((scenario) => summarizeScenario(feature, scenario))
  );
  const failures = scenarios.filter((scenario) => scenario.status === 'failed');
  const passedScenarios = scenarios.filter((scenario) => scenario.status === 'passed').length;
  const skippedScenarios = scenarios.filter((scenario) => scenario.status === 'skipped').length;
  const totalScenarios = scenarios.length;
  const failedScenarios = failures.length;

  return {
    reportPath,
    exists: true,
    features,
    scenarios,
    failures,
    totalScenarios,
    passedScenarios,
    failedScenarios,
    skippedScenarios,
    passRate: totalScenarios === 0 ? 0 : Number(((passedScenarios / totalScenarios) * 100).toFixed(2))
  };
}

module.exports = { readCucumberSummary };
