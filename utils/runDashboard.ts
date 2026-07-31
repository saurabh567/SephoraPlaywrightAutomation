#!/usr/bin/env node
import { main } from './generateDashboard';
/**
 * runDashboard.js
 * 
 * Standalone dashboard generator that can be called from any script/hook.
 * Collects all results and generates the AI Executive Dashboard.
 * 
 * Usage:
 *   node utils/runDashboard.js
 *   npm run dashboard:generate
 */


console.log('══════════════════════════════════════════════');
console.log('  AI Executive Dashboard Generator');
console.log('══════════════════════════════════════════════\n');

try {
  const result = main();
  console.log('\n══════════════════════════════════════════════');
  console.log('  ✅ Dashboard Generated Successfully');
  console.log('══════════════════════════════════════════════');
  console.log(`  📄 HTML:    ${result.htmlPath}`);
  console.log(`  📊 Data:    ${result.dataPath}`);
  console.log(`  📝 Summary: ${result.summaryPath}`);
  console.log('══════════════════════════════════════════════\n');
  process.exit(0);
} catch (error: any) {
  console.error('\n❌ Dashboard generation failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
