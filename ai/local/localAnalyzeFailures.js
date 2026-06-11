const fs = require('fs');
const path = require('path');
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
          content: 'You are a senior QA automation engineer. Analyze failures in simple words.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  const data = await response.json();
  return data.message.content;
}

function collectFailureText() {
  const possiblePaths = [
    'reports',
    'logs',
    'allure-results'
  ];

  let text = '';

  for (const folder of possiblePaths) {
    if (!fs.existsSync(folder)) continue;

    const files = fs.readdirSync(folder, { recursive: true });

    for (const file of files) {
      const fullPath = path.join(folder, file);

      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;

      if (/\.(json|log|txt|md)$/i.test(fullPath)) {
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
    .map((item, index) => {
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