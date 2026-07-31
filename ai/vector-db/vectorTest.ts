import config from './vectorConfig';
import ChromaClient from './chromaClient';
import RetrievalService from './unifiedRetrievalService';
import LocalVectorStore from '../local/localVectorStore';

async function main() {
  let counts: Record<string, any> = {};
  let usingChroma = false;
  try {
    const client = new ChromaClient();
    await client.healthCheck();
    usingChroma = true;
    for (const collectionName of (Object.values(config.collections) as any[])) {
      counts[collectionName] = await client.count(collectionName);
    }
  } catch (err: any) {
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
