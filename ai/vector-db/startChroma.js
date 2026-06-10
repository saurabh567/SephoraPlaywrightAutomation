const { spawnSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const config = require('./vectorConfig');

const chromaDataPath = path.join(config.rootDir, 'ai/memory/chroma-data');
fs.ensureDirSync(chromaDataPath);

console.log('[VectorDB] Starting ChromaDB locally using Docker.');
console.log(`[VectorDB] URL: ${config.chromaUrl}`);
console.log('[VectorDB] Press Ctrl+C to stop the server.');

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-p',
    '8000:8000',
    '-v',
    `${chromaDataPath}:/chroma/chroma`,
    'chromadb/chroma:latest'
  ],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error('[VectorDB] Docker could not start ChromaDB.');
  console.error('[VectorDB] Install/start Docker Desktop, then run: npm run vector:start');
  console.error('[VectorDB] Manual command: docker run --rm -p 8000:8000 chromadb/chroma:latest');
  process.exit(1);
}

process.exit(result.status || 0);
