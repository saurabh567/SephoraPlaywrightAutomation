const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LocalVectorStore = require('./localVectorStore');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

const foldersToIngest = [
  'features',
  'step-definitions',
  'pages',
  'framework',
  'mobile',
  'reports',
  'logs'
];

const allowedExtensions = ['.feature', '.js', '.json', '.txt', '.log', '.md'];

function hashId(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function walkDirectory(dir) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...walkDirectory(fullPath));
    } else if (allowedExtensions.includes(path.extname(fullPath))) {
      results.push(fullPath);
    }
  }

  return results;
}

function chunkText(text, size = 3000) {
  const chunks = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

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

async function main() {
  const store = new LocalVectorStore();
  const records = [];

  console.log('[VectorDB] Starting local ingestion...');

  for (const folder of foldersToIngest) {
    const folderPath = path.resolve(process.cwd(), folder);
    const files = walkDirectory(folderPath);

    for (const filePath of files) {
      const relativePath = path.relative(process.cwd(), filePath);
      const content = fs.readFileSync(filePath, 'utf8');

      if (!content.trim()) continue;

      const chunks = chunkText(content);

      for (let index = 0; index < chunks.length; index++) {
        const document = chunks[index];

        console.log(`[VectorDB] Embedding: ${relativePath} chunk ${index + 1}/${chunks.length}`);

        const embedding = await createEmbedding(document);

        records.push({
          id: hashId(`${relativePath}-${index}-${document}`),
          document,
          embedding,
          metadata: {
            sourcePath: relativePath,
            chunkIndex: index,
            type: path.extname(filePath).replace('.', '') || 'text',
            ingestedAt: new Date().toISOString()
          }
        });
      }
    }
  }

  const result = store.upsert(records);

  console.log('✅ Ingestion completed');
  console.log(result);
}

main().catch((error) => {
  console.error('❌ Ingestion failed:', error.message);
  process.exit(1);
});