import fs from 'fs-extra';
import path from 'path';
// Reads Cucumber JSON output and converts it into a compact execution summary.
// Supports both flat structure (reports/web/cucumber-report.json) and
// nested structure (reports/web/json/cucumber-report.json).

function getStepStatus(step: any) {
  return step.result?.status || 'unknown';
}

function summarizeScenario(feature: any, scenario: any) {
  const steps = scenario.steps || [];
  const failedStep = steps.find((step: any) => getStepStatus(step) === 'failed');
  const skippedSteps = steps.filter((step: any) => getStepStatus(step) === 'skipped').length;
  const status = failedStep ? 'failed' : skippedSteps === steps.length ? 'skipped' : 'passed';

  return {
    feature: feature.name,
    scenario: scenario.name,
    uri: feature.uri,
    line: scenario.line,
    tags: (scenario.tags || []).map((tag: any) => tag.name),
    status,
    failedStep: failedStep?.name || '',
    error: failedStep?.result?.error_message || ''
  };
}

/**
 * Find the cucumber report JSON file by checking multiple possible locations.
 * Priority:
 *   1. {reportDir}/json/cucumber-report.json (nested, used by TestExecutionAgent)
 *   2. {reportDir}/cucumber-report.json (flat, used by cucumber.js config)
 *   3. reports/json/cucumber-report.json (legacy canonical location)
 *   4. {reportDir}/../json/cucumber-report.json (parent directory)
 */
function findCucumberReportFile(reportDir: any) {
  // Normalize reportDir
  const resolvedDir = path.resolve(reportDir);

  // Possible locations in priority order
  const candidates = [
    path.join(resolvedDir, 'json', 'cucumber-report.json'),
    path.join(resolvedDir, 'cucumber-report.json'),
    path.join(process.cwd(), 'reports', 'json', 'cucumber-report.json'),
    path.join(path.dirname(resolvedDir), 'json', 'cucumber-report.json'),
  ];

  // Also search platform-specific directories
  const platforms = ['api', 'web', 'android', 'ios'];
  for (const platform of platforms) {
    candidates.push(
      path.join(process.cwd(), 'reports', platform, 'json', 'cucumber-report.json'),
      path.join(process.cwd(), 'reports', platform, 'cucumber-report.json'),
    );
  }

  // Deduplicate
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      if (fs.existsSync(normalized)) {
        const stat = fs.statSync(normalized);
        if (stat.isFile() && stat.size > 0) {
          return normalized;
        }
      }
    } catch (_: any) {
      // ignore
    }
  }

  return null;
}

function readCucumberSummary(reportDirInput = 'reports') {
  // Accept either a single directory or an array of directories to search
  const reportDirs = Array.isArray(reportDirInput) ? reportDirInput : [reportDirInput];

  // Try each candidate reportDir
  for (const dir of reportDirs) {
    const reportPath = findCucumberReportFile(dir);
    if (reportPath) {
      try {
        const features = fs.readJsonSync(reportPath);
        if (!Array.isArray(features)) continue;

        const scenarios = features.flatMap((feature) =>
          (feature.elements || [])
            .filter((element: any) => element.type === 'scenario')
            .map((scenario: any) => summarizeScenario(feature, scenario))
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
      } catch (e: any) {
        // If parse fails, continue to next candidate
        continue;
      }
    }
  }

  // Also check the default `reports/` directory using recursive search
  try {
    const defaultReportsDir = path.resolve(process.cwd(), 'reports');
    if (fs.existsSync(defaultReportsDir)) {
      const entries = fs.readdirSync(defaultReportsDir);
      for (const entry of entries) {
        const fullPath = path.join(defaultReportsDir, entry);
        let stat;
        try { stat = fs.statSync(fullPath); } catch (_: any) { continue; }
        if (!stat.isDirectory()) continue;

        // Check both flat and nested paths
        const flatPath = path.join(fullPath, 'cucumber-report.json');
        const nestedPath = path.join(fullPath, 'json', 'cucumber-report.json');

        for (const candidate of [flatPath, nestedPath]) {
          try {
            if (fs.existsSync(candidate)) {
              const fStat = fs.statSync(candidate);
              if (fStat.isFile() && fStat.size > 0) {
                const features = fs.readJsonSync(candidate);
                if (Array.isArray(features)) {
                  const scenarios = features.flatMap((feature) =>
                    (feature.elements || [])
                      .filter((element: any) => element.type === 'scenario')
                      .map((scenario: any) => summarizeScenario(feature, scenario))
                  );
                  const failures = scenarios.filter((s) => s.status === 'failed');
                  const passedScenarios = scenarios.filter((s) => s.status === 'passed').length;
                  const skippedScenarios = scenarios.filter((s) => s.status === 'skipped').length;
                  const totalScenarios = scenarios.length;

                  return {
                    reportPath: candidate,
                    exists: true,
                    features,
                    scenarios,
                    failures,
                    totalScenarios,
                    passedScenarios,
                    failedScenarios: failures.length,
                    skippedScenarios,
                    passRate: totalScenarios === 0 ? 0 : Number(((passedScenarios / totalScenarios) * 100).toFixed(2))
                  };
                }
              }
            }
          } catch (_: any) {
            continue;
          }
        }
      }
    }
  } catch (_: any) {
    // ignore
  }

  return {
    reportPath: reportDirs[0] ? path.join(reportDirs[0], 'json', 'cucumber-report.json') : 'reports/json/cucumber-report.json',
    exists: false,
    features: [] as any[],
    scenarios: [] as any[],
    failures: [] as any[]
  };
}

export { readCucumberSummary };
export default { readCucumberSummary: readCucumberSummary };
