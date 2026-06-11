// Validates AI services, runs Cucumber, then runs retrieval-augmented post-execution agents.
const { spawnSync } = require('child_process');

const healthResult = spawnSync('node', ['ai/vector-db/health.js'], {
  stdio: 'inherit',
  env: process.env
});

if (healthResult.status !== 0) {
  console.error('AI startup validation failed. Cucumber execution was not started.');
  process.exit(healthResult.status || 1);
}

const cucumberArgs = ['cucumber-js', '--config', 'cucumber.js', ...process.argv.slice(2)];

const cucumberResult = spawnSync('npx', cucumberArgs, {
  stdio: 'inherit',
  env: process.env
});

let aiStatus = 0;
if (process.env.AI_POST_TEST !== 'false') {
  const aiResult = spawnSync('node', ['ai/workflows/runPostExecutionAgents.js'], {
    stdio: 'inherit',
    env: process.env
  });

  if (aiResult.status !== 0) {
    console.error('AI post-execution analysis failed.');
    aiStatus = aiResult.status || 1;
  }
}

process.exit(cucumberResult.status || aiStatus);
