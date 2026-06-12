const LocalVectorStore = require('../local/localVectorStore');
const chromaManager = require('../vector-db/chromaServerManager');
const ollamaManager = require('./ollamaManager');
const ChromaClientPath = '../vector-db/chromaClient';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function checkOllamaModels() {
  try {
    const ensure = await ollamaManager.ensureRunning();
    if (!ensure || (!ensure.started && !ensure.alreadyRunning)) {
      return { ok: false, error: ensure && ensure.error ? ensure.error : 'ollama_unavailable' };
    }
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return { ok: false, error: `Ollama tags API returned ${response.status}` };
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name);
    const hasLlm = models.some((name) => name.includes(LLM_MODEL));
    const hasEmbedding = models.some((name) => name.includes(EMBEDDING_MODEL));
    const missing = [];
    if (!hasLlm) missing.push(LLM_MODEL);
    if (!hasEmbedding) missing.push(EMBEDDING_MODEL);
    return { ok: true, models, missing };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkChroma() {
  // Attempt to ensure Chroma is running (auto-start if needed). Do not hard-fail if this fails.
  try {
    const ensure = await chromaManager.ensureRunning();
    if (!ensure.ok) {
      // fallback: still try to probe via chroma client to report meaningful error
      const ChromaClient = require(ChromaClientPath);
      const client = new ChromaClient();
      try {
        const chromaStatus = await client.healthCheck(); // may throw
        return { available: true, provider: 'chroma', detail: chromaStatus, managedByFramework: false };
      } catch (innerErr) {
        return { available: false, provider: 'chroma', error: innerErr.message, ensureAttempt: ensure };
      }
    } else {
      // If ensure ran and returned ok, probe via client for details
      try {
        const ChromaClient = require(ChromaClientPath);
        const client = new ChromaClient();
        const chromaStatus = await client.healthCheck();
        return { available: true, provider: 'chroma', detail: chromaStatus, ensureAttempt: ensure };
      } catch (innerErr) {
        return { available: false, provider: 'chroma', error: innerErr.message, ensureAttempt: ensure };
      }
    }
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
