const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const RetrievalService = require('./unifiedRetrievalService');
const LocalVectorStore = require('../local/localVectorStore');

async function main() {
  let counts = {};
  let usingChroma = false;
  try {
    const client = new ChromaClient();
    await client.healthCheck();
    usingChroma = true;
    for (const collectionName of Object.values(config.collections)) {
      counts[collectionName] = await client.count(collectionName);
    }
  } catch (err) {
    const local = new LocalVectorStore();
    counts = { localDocuments: local.count() };
  }

  const retrieval = new RetrievalService();
  const results = await retrieval.searchFeatureFiles('search for a product and display results', 3);
  if (!results.length) throw new Error('Feature-file similarity query returned no results. Run npm run vector:ingest first.');

  console.log(JSON.stringify({
    status: 'passed',
    usingChroma,
    counts,
    query: 'search for a product and display results',
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(`[VectorDB] Validation failed: ${error.stack || error.message}`);
  process.exit(1);
});
