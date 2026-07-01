const fs = require('fs');
const path = require('path');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class LocalVectorStore {
  constructor(storePath = 'ai/local/vector-store.json') {
    this.storePath = path.resolve(process.cwd(), storePath);
    this.ensureStore();
  }

  ensureStore() {
    const dir = path.dirname(this.storePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(
        this.storePath,
        JSON.stringify({ documents: [] }, null, 2),
        'utf8'
      );
    }
  }

  readStore() {
    this.ensureStore();
    return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
  }

  writeStore(store) {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf8');
  }

  upsert(records) {
    const store = this.readStore();

    for (const record of records) {
      const existingIndex = store.documents.findIndex((doc) => doc.id === record.id);

      if (existingIndex >= 0) {
        store.documents[existingIndex] = record;
      } else {
        store.documents.push(record);
      }
    }

    this.writeStore(store);

    return {
      insertedOrUpdated: records.length,
      totalDocuments: store.documents.length,
      storePath: this.storePath
    };
  }

  search(queryEmbedding, topK = 5) {
    const store = this.readStore();

    return store.documents
      .map((doc) => ({
        ...doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  count() {
    return this.readStore().documents.length;
  }
}

module.exports = LocalVectorStore;
