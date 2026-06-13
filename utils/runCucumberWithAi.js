// Validates AI services, runs Cucumber, then runs retrieval-augmented post-execution agents.
const { spawnSync } = require('child_process');

// Delegate test execution to the TestExecutionAgent to make AI mandatory for npm test
const agentArgs = ['--agent', 'TestExecutionAgent', ...process.argv.slice(2)];

const agentResult = spawnSync('node', ['ai/index.js', ...agentArgs], {
  stdio: 'inherit',
  env: process.env
});

if (agentResult.status !== 0) {
  console.error('TestExecutionAgent failed. Aborting with status', agentResult.status);
}

process.exit(agentResult.status || 0);

// --- appended opt-in post-test hook (Phase 3) ---
// If LOCATOR_HEALING=1 then run post-test locator analysis (dry-run by default)
if (process.env.LOCATOR_HEALING === '1') {
  try {
    const spawnSync = require('child_process').spawnSync;
    const reportDir = process.env.REPORT_DIR || require('path').join(process.cwd(), 'reports');
    console.log('LOCATOR_HEALING enabled: running post-test locator analysis (dry-run).');
    const args = ['utils/postTestLocatorAnalyze.js', '--reportDir', reportDir];
    const res = spawnSync('node', args, { stdio: 'inherit' });
    if (res.status !== 0) {
      console.warn('postTestLocatorAnalyze exited non-zero:', res.status);
    } else {
      console.log('postTestLocatorAnalyze completed.');
    }
  } catch (e) {
    console.warn('Failed to run postTestLocatorAnalyze:', e && (e.message||e));
  }
}

