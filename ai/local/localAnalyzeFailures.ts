import fs from 'fs';
import path from 'path';
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
          content: 'You are a senior QA automation engineer. Analyze failures in simple words.'
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

function collectFailureText() {
  const possiblePaths = [
    'reports',
    'logs',
  ];

  let text = '';

  for (const folder of possiblePaths) {
    if (!fs.existsSync(folder)) continue;

    const files = fs.readdirSync(folder, { recursive: true });

    for (const file of files) {
      const fullPath = path.join(folder, String(file));

      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;

      if (/\.(json|log|txt|md)$/i.test(String(fullPath))) {
        text += `\n\nFILE: ${fullPath}\n`;
        text += fs.readFileSync(fullPath, 'utf8').slice(0, 5000);
      }
    }
  }

  return text || 'No report or log files found. Analyze framework based on available vector context.';
}

async function main() {
  const store = new LocalVectorStore();

  if (store.count() === 0) {
    throw new Error('Vector store is empty. Run: npm run vector:ingest');
  }

  const failureText = collectFailureText();
  const embedding = await createEmbedding(failureText.slice(0, 3000));
  const results = store.search(embedding, 5);

  const retrievedContext = results
    .map((item: any, index: any) => {
      return `Source ${index + 1}: ${item.metadata.sourcePath}\n${item.document}`;
    })
    .join('\n\n---\n\n');

  const prompt = `
Failure Logs / Reports:
${failureText.slice(0, 8000)}

Retrieved Similar Framework Context:
${retrievedContext}

Please generate:
1. Execution summary
2. Possible root cause
3. Suggested fix
4. Whether it looks like locator issue, wait issue, test data issue, environment issue, or application issue
5. Short interview explanation
`;

  const answer = await askLlm(prompt);

  const outputDir = path.resolve(process.cwd(), 'reports/ai');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'failure-analysis.md');

  fs.writeFileSync(outputPath, answer, 'utf8');

  console.log(`✅ AI failure analysis generated: ${outputPath}`);
}

main().catch((error) => {
  console.error('❌ AI failure analysis failed:', error.message);
  process.exit(1);
});
