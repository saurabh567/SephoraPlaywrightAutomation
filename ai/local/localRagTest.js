const LocalVectorStore = require('./localVectorStore');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function createEmbedding(text) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.embeddings[0];
}

async function askLlm(prompt) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.message.content;
}

async function main() {
  const query = process.argv.slice(2).join(' ') || 'Explain this automation framework and possible failure reasons';

  const store = new LocalVectorStore();

  if (store.count() === 0) {
    throw new Error('Vector store is empty. Run: npm run vector:ingest');
  }

  console.log('[RAG] Creating query embedding...');
  const queryEmbedding = await createEmbedding(query);

  console.log('[RAG] Searching local Vector DB...');
  const results = store.search(queryEmbedding, 5);

  const retrievedContext = results
    .map((item, index) => {
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