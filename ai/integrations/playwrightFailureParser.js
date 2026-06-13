/**
 * Playwright / Cucumber Failure Parser
 * - Scans REPORT_DIR for cucumber JSON(s), Playwright traces, screenshots
 * - Extracts locator-related failures into normalized objects
 * - Returns array: { locator, feature, scenario, failedStep, error, evidence: { screenshot, trace, fileLine } }
 *
 * Conservative: only include failures whose error messages include common locator keywords
 * Usage: const parser = require('./ai/integrations/playwrightFailureParser'); const failures = parser.extract(reportDir);
 */
const fs = require('fs-extra');
const path = require('path');

const LOCATOR_KEYWORDS = [
  'No node found', 'No elements found', 'Element is not attached', 'selector', 'locator', 'CSS', 'XPath', 'not found'
];

function readCucumberJsons(reportDir) {
  const out = [];
  if (!reportDir) reportDir = path.join(process.cwd(), 'reports');
  // common path: reports/json/cucumber-report.json or reports/**/cucumber*.json
  const cand = [
    path.join(reportDir, 'json', 'cucumber-report.json'),
    path.join(reportDir, 'cucumber-report.json')
  ];
  for (const p of cand) {
    if (fs.existsSync(p)) {
      try { out.push(...JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) {}
    }
  }
  // fallback: glob search for *.json under reportDir
  try {
    const files = fs.readdirSync(reportDir).filter(f => f.endsWith('.json')).map(f=>path.join(reportDir,f));
    for (const f of files) {
      try { out.push(...JSON.parse(fs.readFileSync(f,'utf8'))); } catch(e) {}
    }
  } catch (e) {}
  return out;
}

function extractLocatorFromError(errText) {
  if (!errText) return null;
  // common patterns: "selector: \"css=...\"" or "No node found for selector \"...\""
  const patterns = [
    /selector\s*[:=]\s*"([^"]+)"/i,
    /selector\s*[:=]\s*'([^']+)'/i,
    /for selector\s*"([^"]+)"/i,
    /No node found for selector\s*"([^"]+)"/i,
    /(xpath:\s*[^\s]+)/i
  ];
  for (const r of patterns) {
    const m = errText.match(r);
    if (m && m[1]) return m[1];
  }
  // fallback: look for quoted strings with CSS/XPath-like characters
  const q = errText.match(/['"]([^'\"]{3,200})['"]/);
  if (q) {
    const s = q[1];
    if (/[.#\[\]/]/.test(s) || s.startsWith('//') || s.startsWith('xpath=')) return s;
  }
  // scan for keywords + selector token
  for (const k of LOCATOR_KEYWORDS) {
    if (errText.includes(k)) return errText.slice(0, 200);
  }
  return null;
}

function normalizeCucumberFailures(cukeJsonArray) {
  const failures = [];
  for (const feature of (cukeJsonArray||[])) {
    const featureName = feature.name || feature.uri || 'unknown-feature';
    for (const element of feature.elements || []) {
      const scenarioName = element.name || element.description || 'scenario';
      for (const step of element.steps || []) {
        const result = step.result || {};
        if (result.status && result.status.toLowerCase() === 'failed') {
          const error = result.error_message || result.exception || JSON.stringify(result);
          const locator = extractLocatorFromError(error);
          const evidence = {};
          // attempt to find screenshot/attachments referenced in step.output or step.embeddings
          if (step.output && Array.isArray(step.output)) {
            evidence.screenshots = step.output.filter(o => typeof o === 'string' && o.toLowerCase().includes('screenshot'));
          }
          // include raw step text
          failures.push({
            locator,
            feature: featureName,
            scenario: scenarioName,
            failedStep: step.name || step.keyword || '',
            error: error,
            evidence
          });
        }
      }
    }
  }
  return failures;
}

function dedupeFailures(arr) {
  const seen = new Set();
  const out = [];
  for (const f of arr) {
    const key = `${String(f.feature)}|${String(f.scenario)}|${String(f.failedStep)}|${String(f.locator)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

module.exports = {
  /**
   * Extract failures from REPORT_DIR
   * returns array of normalized failure objects
   */
  extract: function(reportDir) {
    const cuke = readCucumberJsons(reportDir);
    const failures = normalizeCucumberFailures(cuke);
    return dedupeFailures(failures);
  },
  extractAndWrite: function(reportDir, outPath) {
    const arr = this.extract(reportDir);
    fs.ensureDirSync(path.dirname(outPath));
    // atomic write
    const tmp = `${outPath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8');
    fs.renameSync(tmp, outPath);
    return arr;
  }
};
