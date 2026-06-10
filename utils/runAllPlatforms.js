const { spawnSync } = require('child_process');

const platforms = [
  { name: 'WEB', script: 'test:web' },
  { name: 'ANDROID', script: 'test:android' },
  { name: 'IOS', script: 'test:ios' }
];

const failedPlatforms = [];

for (const platform of platforms) {
  console.log(`[Framework] Starting ${platform.name} execution`);

  const result = spawnSync('npm', ['run', platform.script], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    failedPlatforms.push(platform.name);
  }
}

if (failedPlatforms.length > 0) {
  console.error(`[Framework] Failed platform(s): ${failedPlatforms.join(', ')}`);
  process.exit(1);
}

console.log('[Framework] All platform executions completed successfully');
