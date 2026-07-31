#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
import LocatorHealingEngine from '../ai/agents/locator-healing/LocatorHealingEngine';
import { extractAndWrite } from '../ai/integrations/playwrightFailureParser';
/**
 * CLI: runLocatorHealing.ts
 * Runs the Phase 5 LocatorHealingEngine against captured locator failures.
 *
 * Usage:
 *   node utils/runLocatorHealing.ts
 *   node utils/runLocatorHealing.ts --mode apply --threshold 0.85
 *   node utils/runLocatorHealing.ts --reportDir reports/web --out ai/input/failed-locators.json
 *
 * Flags:
 *   --mode        recommend | apply | dry-run   (default: recommend)
 *   --threshold   auto-apply confidence 0..1    (default: 0.80)
 *   --reportDir   cucumber report dir to extract failures from (optional)
 *   --out         failure JSON path (default: ai/input/failed-locators.json)
 *   --results     healing results JSON output (default: reports/ai/locator-healing-results.json)
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mode' && args[i + 1]) out.mode = args[++i];
    else if (a === '--threshold' && args[i + 1]) out.threshold = parseFloat(args[++i]);
    else if (a === '--reportDir' && args[i + 1]) out.reportDir = args[++i];
    else if (a === '--out' && args[i + 1]) out.out = args[++i];
    else if (a === '--results' && args[i + 1]) out.results = args[++i];
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

function readFailures(argv: any) {
  const outPath = argv.out || path.join(process.cwd(), 'ai', 'input', 'failed-locators.json');
  if (argv.reportDir) {
    try {
      const extracted = extractAndWrite(argv.reportDir, outPath);
      if (extracted && extracted.length) {
        console.log(`[runLocatorHealing] Extracted ${extracted.length} failure(s) from ${argv.reportDir}`);
        return extracted;
      }
    } catch (e: any) {
      console.warn(`[runLocatorHealing] Could not extract from reportDir: ${e.message}`);
    }
  }
  if (fs.existsSync(outPath)) {
    try {
      const data = fs.readJsonSync(outPath);
      if (Array.isArray(data) && data.length) {
        console.log(`[runLocatorHealing] Loaded ${data.length} failure(s) from ${outPath}`);
        return data;
      }
    } catch (e: any) {
      console.warn(`[runLocatorHealing] Could not read ${outPath}: ${e.message}`);
    }
  }
  return [];
}

async function main() {
  const argv = parseArgs();
  if (argv.help) {
    console.log([
      'Usage: node utils/runLocatorHealing.ts [options]',
      '  --mode recommend|apply|dry-run   healing mode (default: recommend)',
      '  --threshold 0..1                 auto-apply confidence threshold (default: 0.80)',
      '  --reportDir <dir>                extract failures from cucumber report dir',
      '  --out <path>                     failure JSON path (default: ai/input/failed-locators.json)',
      '  --results <path>                 results JSON output (default: reports/ai/locator-healing-results.json)'
    ].join('\n'));
    process.exit(0);
  }

  const failures = readFailures(argv);
  if (!failures.length) {
    console.log('[runLocatorHealing] No locator failures found. Nothing to heal.');
    process.exit(0);
  }

  const engine = new LocatorHealingEngine({
    mode: argv.mode || 'recommend',
    autoApplyThreshold: argv.threshold || 0.80
  });

  console.log(`[runLocatorHealing] Mode=${engine.mode} Threshold=${engine.autoApplyThreshold}`);
  const result = await engine.healFailures(failures);

  const resultsPath = argv.results || path.join(process.cwd(), 'reports', 'ai', 'locator-healing-results.json');
  fs.ensureDirSync(path.dirname(resultsPath));
  fs.writeJsonSync(resultsPath, result, { spaces: 2 });

  const a: any = result.analytics || {};
  console.log('[runLocatorHealing] Summary:');
  console.log(`  Total failures analyzed : ${a.totalFailures}`);
  console.log(`  Candidates generated    : ${a.totalCandidatesGenerated}`);
  console.log(`  Auto-applied            : ${a.totalApplied}`);
  console.log(`  Skipped / manual needed : ${a.totalSkipped}`);
  console.log(`  Average confidence      : ${a.averageConfidence}`);
  console.log(`  Report                  : reports/ai/locator-healing-report.md`);
  console.log(`  Results JSON            : ${resultsPath}`);

  process.exit(0);
}

if (require.main === module) main();
