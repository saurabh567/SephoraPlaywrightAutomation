import config from './vectorConfig';
import ChromaClient from './chromaClient';
import EmbeddingService from './embeddingService';

async function main() {
  const client = new ChromaClient();
  const embeddingService = new EmbeddingService();
  const chroma = await client.healthCheck();
  const collections = await client.ensureCollections((Object.values(config.collections) as any[]));
  const embeddings = await embeddingService.healthCheck();

  console.log(JSON.stringify({
    status: 'healthy',
    chroma,
    embeddings,
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(`[VectorDB] Health validation failed: ${error.stack || error.message}`);
  process.exit(1);
});
