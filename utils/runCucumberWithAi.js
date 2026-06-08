// Runs Cucumber first, then runs post-execution AI agents while preserving the Cucumber exit code.
const { spawnSync } = require('child_process');

const cucumberArgs = ['cucumber-js', '--config', 'cucumber.js', ...process.argv.slice(2)];

const cucumberResult = spawnSync('npx', cucumberArgs, {
  stdio: 'inherit',
  env: process.env
});

if (process.env.AI_POST_TEST !== 'false') {
  const aiResult = spawnSync('node', ['ai/index.js', '--post-test'], {
    stdio: 'inherit',
    env: process.env
  });

  if (aiResult.status !== 0) {
    console.error('AI post-execution analysis failed, but preserving original Cucumber exit code.');
  }
}

process.exit(cucumberResult.status || 0);
