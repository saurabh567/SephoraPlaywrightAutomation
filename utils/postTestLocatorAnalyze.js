#!/usr/bin/env node
/**
 * Post-test orchestration: generate failed-locators.json and run locatorHealingAgent analyze (dry-run)
 * Usage: node utils/postTestLocatorAnalyze.js --reportDir reports/web
 * Controlled by env: LOCATOR_DRY_RUN (default true)
 */
const path = require('path');
const { spawnSync } = require('child_process');
const agent = require('../ai/agents/locatorHealingAgent');

const argv = process.argv.slice(2);
const reportDirIndex = argv.indexOf('--reportDir');
const reportDir = reportDirIndex !== -1 && argv[reportDirIndex+1] ? argv[reportDirIndex+1] : process.env.REPORT_DIR || path.join(process.cwd(), 'reports');

(async () => {
  try {
    const outPath = path.join(process.cwd(), 'ai', 'input', 'failed-locators.json');
    console.log('Generating failed-locators.json from', reportDir);
    spawnSync('node', ['utils/generateFailedLocators.js', '--reportDir', reportDir, '--out', outPath], { stdio: 'inherit' });
    console.log('Running locator analyze (dry-run)...');
    const res = await agent.run({ mode: 'analyze', reportDir });
    console.log('Locator analyze result:', JSON.stringify(res, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('postTestLocatorAnalyze failed:', e && (e.stack||e.message||e));
    process.exit(2);
  }
})();
