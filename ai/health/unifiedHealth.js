const LocalVectorStore = require('../local/localVectorStore');

const ChromaClientPath = '../vector-db/chromaClient';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function checkOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}`);
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name);
    const hasLlm = models.some((name) => name.includes(LLM_MODEL));
    const hasEmbedding = models.some((name) => name.includes(EMBEDDING_MODEL));
    const missing = [];
    if (!hasLlm) missing.push(`LLM model (${LLM_MODEL})`);
    if (!hasEmbedding) missing.push(`Embedding model (${EMBEDDING_MODEL})`);
    if (missing.length) throw new Error(`Missing models: ${missing.join(', ')}`);

    return { ok: true, models };
  } catch (err) {
    throw new Error(`Ollama check failed: ${err.message}`);
  }
}

async function checkChroma() {
  try {
    // try to require chroma client, but this may fail if chromadb isn't present
    const ChromaClient = require(ChromaClientPath);
    const client = new ChromaClient();
    const chromaStatus = await client.healthCheck();
    return { available: true, provider: 'chroma', detail: chromaStatus };
  } catch (err) {
    return { available: false, provider: 'chroma', error: err.message };
  }
}

async function run() {
  // 1) Check Ollama
  const ollama = await checkOllamaModels();

  // 2) Check Chroma availability, but do not fail if not present
  const chroma = await checkChroma();

  // 3) Ensure local JSON vector store exists and report count
  const store = new LocalVectorStore();
  const docCount = store.count();

  const summary = {
    ollama,
    chroma,
    localVectorStore: { path: store.storePath, documents: docCount }
  };

  console.log('[AI] Unified health summary:', JSON.stringify(summary, null, 2));

  return { status: 'healthy', summary };
}

// Export as callable function and runnable script
module.exports = { run };

if (require.main === module) {
  run().catch((err) => {
    console.error('[UnifiedHealth] Health check failed:', err.message);
    process.exit(1);
  });
}
