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
