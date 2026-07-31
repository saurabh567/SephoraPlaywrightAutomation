import LocalVectorStore from './localVectorStore';
import OllamaClient from './ollamaClient';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function createEmbedding(text: any) {
  const client = new OllamaClient({ baseUrl: OLLAMA_BASE_URL });
  const embeddings = await client.requestEmbeddings(EMBEDDING_MODEL, text);
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    throw new Error('Embedding creation returned empty result');
  }
  return embeddings[0];
}

async function askLlm(prompt: any) {
  const client = new OllamaClient({ baseUrl: OLLAMA_BASE_URL });
  const response = await client.request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: LLM_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'You are an AI QA Automation Assistant. Answer based only on the provided framework context.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  return response.message.content;
}

async function main() {
  const query = process.argv.slice(2).join(' ') || 'Explain this automation framework and possible failure reasons';

  // Ensure Ollama and Chroma are available (start if framework can). Local RAG may still work without them but embeddings require Ollama.
  try {
    const ollamaManager = require('../health/ollamaManager');
    const ores = await ollamaManager.ensureRunning();
    console.log('[RAG] ollama ensureRunning:', ores && (ores.ok || ores.started || ores.alreadyRunning) ? 'ok' : JSON.stringify(ores));
  } catch (e: any) {
    console.warn('[RAG] ollama ensureRunning failed (continuing):', e.message);
  }
  try {
    const chromaManager = require('../vector-db/chromaServerManager');
    const ensure = await chromaManager.ensureRunning();
    console.log('[RAG] chroma ensureRunning:', ensure && ensure.ok ? 'ok' : JSON.stringify(ensure));
  } catch (e: any) {
    console.warn('[RAG] chroma ensureRunning failed (continuing with local store):', e.message);
  }

  const store = new LocalVectorStore();

  if (store.count() === 0) {
    throw new Error('Vector store is empty. Run: npm run vector:ingest');
  }

  console.log('[RAG] Creating query embedding...');
  const queryEmbedding = await createEmbedding(query);

  console.log('[RAG] Searching local Vector DB...');
  const results = store.search(queryEmbedding, 5);

  const retrievedContext = results
    .map((item: any, index: any) => {
      return [
        `Source ${index + 1}: ${item.metadata.sourcePath}`,
        `Similarity Score: ${item.score}`,
        item.document
      ].join('\n');
    })
    .join('\n\n---\n\n');

  const prompt = `
User Question:
${query}

Retrieved Framework Context:
${retrievedContext}

Now answer in simple automation testing terms.
`;

  console.log('[RAG] Sending retrieved context to local LLM...');
  const answer = await askLlm(prompt);

  console.log('\n========== RAG ANSWER ==========\n');
  console.log(answer);
  console.log('\n========== SOURCES ==========\n');

  for (const item of results) {
    console.log(`${item.metadata.sourcePath} | score: ${item.score}`);
  }
}

main().catch((error) => {
  console.error('❌ RAG test failed:', error.message);
  process.exit(1);
});
