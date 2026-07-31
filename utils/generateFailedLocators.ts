#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
/**
 * CLI: generateFailedLocators.js
 * Usage:
 *   node utils/generateFailedLocators.js --reportDir reports/web --out ai/input/failed-locators.json
 * If --out omitted, defaults to ai/input/failed-locators.json
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, any> = {};
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a === '--reportDir' && args[i+1]) { out.reportDir = args[++i]; }
    else if (a === '--out' && args[i+1]) { out.out = args[++i]; }
  }
  return out;
}

async function main() {
  const argv = parseArgs();
  const reportDir = argv.reportDir || process.env.REPORT_DIR || path.join(process.cwd(), 'reports');
  const outPath = argv.out || path.join(process.cwd(), 'ai', 'input', 'failed-locators.json');
  const parser = require('../ai/integrations/playwrightFailureParser');
  try {
    const failures = parser.extractAndWrite(reportDir, outPath);
    console.log(`Wrote ${Array.isArray(failures)?failures.length:0} failure(s) to ${outPath}`);
    process.exit(0);
  } catch (e: any) {
    console.error('Failed to generate failed-locators.json:', e && (e.stack||e.message||e));
    process.exit(2);
  }
}

if (require.main === module) main();
