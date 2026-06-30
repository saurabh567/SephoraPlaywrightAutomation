const { spawnSync } = require('child_process');

const patterns = [
  'sephora',
  'rare beauty',
  'huda',
  'beauty pass',
  'soft pinch',
  'makeup_face',
  'makeup face',
  'add to bag',
  'view bag',
  'shopping bag',
  'app10',
  'sephora.in'
];

const args = [
  '--no-ignore',
  '--hidden',
  '-n',
  '-i',
  patterns.join('|'),
  '.',
  '--glob',
  '!node_modules/**',
  '--glob',
  '!.git/**',
  '--glob',
  '!utils/validateMigrationReferences.js'
];

const result = spawnSync('rg', args, {
  stdio: 'inherit'
});

if (result.status === 0) {
  console.error('[Migration] Old application references were found. Review the matches above.');
  process.exit(1);
}

if (result.status === 1) {
  console.log('[Migration] No old application references found.');
  process.exit(0);
}

console.error('[Migration] Reference scan could not be completed.');
process.exit(result.status || 1);
