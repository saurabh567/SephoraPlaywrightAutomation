const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const RetrievalService = require('./retrievalService');

async function main() {
  const client = new ChromaClient();
  await client.healthCheck();
  const counts = {};
  for (const collectionName of Object.values(config.collections)) {
    counts[collectionName] = await client.count(collectionName);
  }

  const requiredCollections = [
    config.collections.featureFiles,
    config.collections.pageObjects,
    config.collections.locators
  ];
  for (const collectionName of requiredCollections) {
    if (counts[collectionName] < 1) {
      throw new Error(`${collectionName} is empty. Run npm run vector:ingest first.`);
    }
  }

  const retrieval = new RetrievalService();
  const results = await retrieval.searchFeatureFiles('search for a product and display results', 3);
  if (!results.length) throw new Error('Feature-file similarity query returned no results.');
  if (results.some((result) => typeof result.similarityScore !== 'number')) {
    throw new Error('Retrieval results do not include numeric similarity scores.');
  }

  console.log(JSON.stringify({
    status: 'passed',
    counts,
    query: 'search for a product and display results',
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(`[VectorDB] Validation failed: ${error.stack || error.message}`);
  process.exit(1);
});
