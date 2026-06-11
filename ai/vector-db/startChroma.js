const { spawnSync } = require('child_process');
const path = require('path');
const ChromaClient = require('./chromaClient');

function runDockerCompose() {
  const composePath = path.join(process.cwd(), 'docker-compose.chroma.yml');
  const result = spawnSync('docker', ['compose', '-f', composePath, 'up', '-d'], {
    stdio: 'inherit'
  });
  if (result.error) {
    throw new Error(`Unable to execute Docker Compose: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Docker Compose exited with status ${result.status}.`);
  }
}

async function waitForChroma() {
  const client = new ChromaClient();
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      return await client.healthCheck();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`ChromaDB did not become healthy: ${lastError?.message || 'unknown error'}`);
}

async function main() {
  runDockerCompose();
  const health = await waitForChroma();
  console.log(JSON.stringify(health, null, 2));
}

main().catch((error) => {
  console.error(`[VectorDB] ChromaDB startup failed: ${error.message}`);
  process.exit(1);
});
