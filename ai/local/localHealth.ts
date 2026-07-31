import LocalVectorStore from './localVectorStore';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function main() {
  console.log('[AI] Checking Ollama...');

  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}`);
  }

  const data = await response.json();
  const models = (data.models || []).map((model: any) => model.name);

  console.log('[AI] Available models:', models);

  const hasLlm = models.some((name: any) => name.includes(LLM_MODEL));
  const hasEmbedding = models.some((name: any) => name.includes(EMBEDDING_MODEL));

  if (!hasLlm) {
    throw new Error(`Missing LLM model. Run: ollama pull ${LLM_MODEL}`);
  }

  if (!hasEmbedding) {
    throw new Error(`Missing embedding model. Run: ollama pull ${EMBEDDING_MODEL}`);
  }

  const store = new LocalVectorStore();
  console.log('[VectorDB] Local JSON Vector Store is ready');
  console.log('[VectorDB] Documents stored:', store.count());

  console.log('✅ Local Vector DB + Ollama health check passed');
}

main().catch((error) => {
  console.error('❌ Health check failed:', error.message);
  process.exit(1);
});