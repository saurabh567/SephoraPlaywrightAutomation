import fs from 'fs-extra';
import path from 'path';
// ImpactAgent - Analyzes git changes to determine test impact, smart selection, and selective execution

export const run = async function run(input: any = {}) {
    console.log('[ImpactAgent] Analyzing test impact');
    let changedFiles: any[] = [];
    let gitDiffOutput = '';
    try {
      const { execSync } = require('child_process');
      const output = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached 2>/dev/null || git status --porcelain 2>/dev/null', { encoding: 'utf8' });
      changedFiles = output.trim().split('\n').filter(Boolean).map(function(line: any) { return line.replace(/^[MARC??]+\s+/, '').trim(); });
      gitDiffOutput = execSync('git diff --stat HEAD~1 2>/dev/null || git diff --stat 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e: any) {
      console.warn('[ImpactAgent] Could not get git diff:', e.message);
    }
    if (changedFiles.length === 0) {
      const reportPath = path.join(process.cwd(), 'reports/ai', 'impact-analysis.md');
      fs.ensureDirSync(path.dirname(reportPath));
      fs.writeFileSync(reportPath, '# Test Impact Analysis\n\nNo changes detected.\n', 'utf8');
      return { ok: true, skipped: true, reason: 'No changes detected' };
    }
    var categories: Record<string, any> = {
      pageObjects: [] as any[],
      stepDefinitions: [] as any[],
      features: [] as any[],
      config: [] as any[],
      hooks: [] as any[],
      ai: [] as any[],
      other: [] as any[]
    };
    for (var i = 0; i < changedFiles.length; i++) {
      var f = changedFiles[i];
      if (f.startsWith('pages/')) { categories.pageObjects.push(f); }
      else if (f.startsWith('step-definitions/')) { categories.stepDefinitions.push(f); }
      else if (f.startsWith('features/')) { categories.features.push(f); }
      else if (f.startsWith('config/') || f === 'playwright.config.js' || f === 'cucumber.js') { categories.config.push(f); }
      else if (f.startsWith('hooks/')) { categories.hooks.push(f); }
      else if (f.startsWith('ai/')) { categories.ai.push(f); }
      else { categories.other.push(f); }
    }
    var impactedAreas: any[] = [];
    var recommendedTags: any[] = [];
    for (var j = 0; j < changedFiles.length; j++) {
      var f2 = changedFiles[j];
      if (f2.startsWith('pages/')) {
        impactedAreas.push('page:' + path.basename(f2, '.js'));
        var pageName = path.basename(f2, '.js').replace(/[Pp]age/, '').toLowerCase();
        recommendedTags.push('@' + pageName);
      }
      if (f2.startsWith('features/')) {
        var featureName = path.basename(f2, '.feature').toLowerCase();
        impactedAreas.push('feature:' + featureName);
        recommendedTags.push('@' + featureName);
      }
      if (f2.startsWith('step-definitions/')) {
        impactedAreas.push('step-definitions');
      }
      if (f2.startsWith('config/') || f2 === 'playwright.config.js' || f2 === 'cucumber.js') {
        impactedAreas.push('configuration');
        recommendedTags.push('@smoke');
        recommendedTags.push('@regression');
      }
      if (f2.startsWith('hooks/')) {
        impactedAreas.push('hooks');
        recommendedTags.push('@smoke');
        recommendedTags.push('@regression');
      }
      if (f2.startsWith('ai/agents/')) {
        impactedAreas.push('ai-agent:' + path.basename(f2, '.js'));
      }
    }
    var riskLevel = 'LOW';
    if (categories.config.length > 0 || categories.hooks.length > 0) {
      riskLevel = 'HIGH';
    } else if (categories.pageObjects.length > 0 && categories.features.length > 0) {
      riskLevel = 'MEDIUM';
    }
    var uniqueTagMap: Record<string, any> = {};
    for (var k = 0; k < recommendedTags.length; k++) {
      uniqueTagMap[recommendedTags[k]] = true;
    }
    var uniqueTags = Object.keys(uniqueTagMap);
    var uniqueImpacted: any[] = [];
    var impactedMap: Record<string, any> = {};
    for (var m = 0; m < impactedAreas.length; m++) {
      if (!impactedMap[impactedAreas[m]]) {
        impactedMap[impactedAreas[m]] = true;
        uniqueImpacted.push(impactedAreas[m]);
      }
    }
    var selectiveCommand = uniqueTags.length > 0
      ? 'npx cucumber-js --tags "' + uniqueTags.join(' or ') + '"'
      : 'npx cucumber-js (full suite)';
    var mediumTags: any[] = [];
    for (var n = 0; n < uniqueTags.length; n++) {
      if (uniqueTags[n] !== '@regression') {
        mediumTags.push(uniqueTags[n]);
      }
    }
    var mediumFallback = mediumTags.length > 0 ? mediumTags.join(' or ') : '@smoke';
    var reportPath = path.join(process.cwd(), 'reports/ai', 'impact-analysis.md');
    fs.ensureDirSync(path.dirname(reportPath));
    var lines: any[] = [];
    lines.push('# Test Impact Analysis');
    lines.push('');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('Changes Detected: ' + changedFiles.length + ' file(s)');
    lines.push('');
    lines.push('```');
    lines.push(gitDiffOutput.slice(0, 1000));
    lines.push('```');
    lines.push('');
    lines.push('## Changed Files by Category');
    lines.push('');
    for (var catKey in categories) {
      var catFiles = (categories as Record<string, any>)[catKey];
      if (catFiles.length > 0) {
        lines.push('### ' + catKey.charAt(0).toUpperCase() + catKey.slice(1) + ' (' + catFiles.length + ')');
        for (var p = 0; p < catFiles.length; p++) {
          lines.push('- `' + catFiles[p] + '`');
        }
        lines.push('');
      }
    }
    lines.push('## Impact Analysis');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push('| Risk Level | ' + riskLevel + ' |');
    lines.push('| Impacted Areas | ' + uniqueImpacted.length + ' |');
    lines.push('| Recommended Tests | ' + (uniqueTags.length > 0 ? uniqueTags.join(', ') : 'Full suite') + ' |');
    lines.push('');
    lines.push('## Recommended Selective Execution');
    lines.push('');
    lines.push('```bash');
    lines.push(selectiveCommand);
    lines.push('```');
    lines.push('');
    lines.push('## Recommendation');
    lines.push('');
    if (riskLevel === 'HIGH') {
      lines.push('Run full regression suite. Configuration, hooks, or fundamental changes detected.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "@regression"');
      lines.push('```');
    } else if (riskLevel === 'MEDIUM') {
      lines.push('Run targeted tests plus smoke suite.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "' + mediumFallback + '"');
      lines.push('```');
    } else {
      var lowTags = uniqueTags.length > 0 ? uniqueTags.join(' or ') : '@smoke';
      lines.push('Run targeted tests only.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "' + lowTags + '"');
      lines.push('```');
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      changedFiles: changedFiles.length,
      riskLevel: riskLevel,
      impactedAreas: uniqueImpacted,
      recommendedExecution: selectiveCommand
    };
  };
export default { run: async function run(input: any = {}) {
    console.log('[ImpactAgent] Analyzing test impact');
    let changedFiles: any[] = [];
    let gitDiffOutput = '';
    try {
      const { execSync } = require('child_process');
      const output = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached 2>/dev/null || git status --porcelain 2>/dev/null', { encoding: 'utf8' });
      changedFiles = output.trim().split('\n').filter(Boolean).map(function(line: any) { return line.replace(/^[MARC??]+\s+/, '').trim(); });
      gitDiffOutput = execSync('git diff --stat HEAD~1 2>/dev/null || git diff --stat 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (e: any) {
      console.warn('[ImpactAgent] Could not get git diff:', e.message);
    }
    if (changedFiles.length === 0) {
      const reportPath = path.join(process.cwd(), 'reports/ai', 'impact-analysis.md');
      fs.ensureDirSync(path.dirname(reportPath));
      fs.writeFileSync(reportPath, '# Test Impact Analysis\n\nNo changes detected.\n', 'utf8');
      return { ok: true, skipped: true, reason: 'No changes detected' };
    }
    var categories = {
      pageObjects: [] as any[],
      stepDefinitions: [] as any[],
      features: [] as any[],
      config: [] as any[],
      hooks: [] as any[],
      ai: [] as any[],
      other: [] as any[]
    };
    for (var i = 0; i < changedFiles.length; i++) {
      var f = changedFiles[i];
      if (f.startsWith('pages/')) { categories.pageObjects.push(f); }
      else if (f.startsWith('step-definitions/')) { categories.stepDefinitions.push(f); }
      else if (f.startsWith('features/')) { categories.features.push(f); }
      else if (f.startsWith('config/') || f === 'playwright.config.js' || f === 'cucumber.js') { categories.config.push(f); }
      else if (f.startsWith('hooks/')) { categories.hooks.push(f); }
      else if (f.startsWith('ai/')) { categories.ai.push(f); }
      else { categories.other.push(f); }
    }
    var impactedAreas: any[] = [];
    var recommendedTags: any[] = [];
    for (var j = 0; j < changedFiles.length; j++) {
      var f2 = changedFiles[j];
      if (f2.startsWith('pages/')) {
        impactedAreas.push('page:' + path.basename(f2, '.js'));
        var pageName = path.basename(f2, '.js').replace(/[Pp]age/, '').toLowerCase();
        recommendedTags.push('@' + pageName);
      }
      if (f2.startsWith('features/')) {
        var featureName = path.basename(f2, '.feature').toLowerCase();
        impactedAreas.push('feature:' + featureName);
        recommendedTags.push('@' + featureName);
      }
      if (f2.startsWith('step-definitions/')) {
        impactedAreas.push('step-definitions');
      }
      if (f2.startsWith('config/') || f2 === 'playwright.config.js' || f2 === 'cucumber.js') {
        impactedAreas.push('configuration');
        recommendedTags.push('@smoke');
        recommendedTags.push('@regression');
      }
      if (f2.startsWith('hooks/')) {
        impactedAreas.push('hooks');
        recommendedTags.push('@smoke');
        recommendedTags.push('@regression');
      }
      if (f2.startsWith('ai/agents/')) {
        impactedAreas.push('ai-agent:' + path.basename(f2, '.js'));
      }
    }
    var riskLevel = 'LOW';
    if (categories.config.length > 0 || categories.hooks.length > 0) {
      riskLevel = 'HIGH';
    } else if (categories.pageObjects.length > 0 && categories.features.length > 0) {
      riskLevel = 'MEDIUM';
    }
    var uniqueTagMap: Record<string, any> = {};
    for (var k = 0; k < recommendedTags.length; k++) {
      uniqueTagMap[recommendedTags[k]] = true;
    }
    var uniqueTags = Object.keys(uniqueTagMap);
    var uniqueImpacted: any[] = [];
    var impactedMap: Record<string, any> = {};
    for (var m = 0; m < impactedAreas.length; m++) {
      if (!impactedMap[impactedAreas[m]]) {
        impactedMap[impactedAreas[m]] = true;
        uniqueImpacted.push(impactedAreas[m]);
      }
    }
    var selectiveCommand = uniqueTags.length > 0
      ? 'npx cucumber-js --tags "' + uniqueTags.join(' or ') + '"'
      : 'npx cucumber-js (full suite)';
    var mediumTags: any[] = [];
    for (var n = 0; n < uniqueTags.length; n++) {
      if (uniqueTags[n] !== '@regression') {
        mediumTags.push(uniqueTags[n]);
      }
    }
    var mediumFallback = mediumTags.length > 0 ? mediumTags.join(' or ') : '@smoke';
    var reportPath = path.join(process.cwd(), 'reports/ai', 'impact-analysis.md');
    fs.ensureDirSync(path.dirname(reportPath));
    var lines: any[] = [];
    lines.push('# Test Impact Analysis');
    lines.push('');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('Changes Detected: ' + changedFiles.length + ' file(s)');
    lines.push('');
    lines.push('```');
    lines.push(gitDiffOutput.slice(0, 1000));
    lines.push('```');
    lines.push('');
    lines.push('## Changed Files by Category');
    lines.push('');
    for (var catKey in categories) {
      var catFiles = (categories as Record<string, any>)[catKey];
      if (catFiles.length > 0) {
        lines.push('### ' + catKey.charAt(0).toUpperCase() + catKey.slice(1) + ' (' + catFiles.length + ')');
        for (var p = 0; p < catFiles.length; p++) {
          lines.push('- `' + catFiles[p] + '`');
        }
        lines.push('');
      }
    }
    lines.push('## Impact Analysis');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push('| Risk Level | ' + riskLevel + ' |');
    lines.push('| Impacted Areas | ' + uniqueImpacted.length + ' |');
    lines.push('| Recommended Tests | ' + (uniqueTags.length > 0 ? uniqueTags.join(', ') : 'Full suite') + ' |');
    lines.push('');
    lines.push('## Recommended Selective Execution');
    lines.push('');
    lines.push('```bash');
    lines.push(selectiveCommand);
    lines.push('```');
    lines.push('');
    lines.push('## Recommendation');
    lines.push('');
    if (riskLevel === 'HIGH') {
      lines.push('Run full regression suite. Configuration, hooks, or fundamental changes detected.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "@regression"');
      lines.push('```');
    } else if (riskLevel === 'MEDIUM') {
      lines.push('Run targeted tests plus smoke suite.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "' + mediumFallback + '"');
      lines.push('```');
    } else {
      var lowTags = uniqueTags.length > 0 ? uniqueTags.join(' or ') : '@smoke';
      lines.push('Run targeted tests only.');
      lines.push('```bash');
      lines.push('npx cucumber-js --tags "' + lowTags + '"');
      lines.push('```');
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      changedFiles: changedFiles.length,
      riskLevel: riskLevel,
      impactedAreas: uniqueImpacted,
      recommendedExecution: selectiveCommand
    };
  } };


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Impact Analysis Agent",
  "version": "1.0.0",
  "description": "Git-based test impact analysis and smart test selection",
  "dependencies": ["ExecutionAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "analysis",
    "impact"
  ],
  "executionStage": "multi-agent",
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
