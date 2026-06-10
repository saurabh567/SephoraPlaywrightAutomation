const fs = require('fs-extra');
const path = require('path');
const config = require('./vectorConfig');

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

class ChromaClient {
  constructor(options = {}) {
    this.chromaUrl = options.chromaUrl || config.chromaUrl;
    this.localStorePath = options.localStorePath || config.localStorePath;
    this.useLocalFallback = options.useLocalFallback ?? config.useLocalFallback;
  }

  async healthCheck() {
    const endpoints = ['/api/v2/heartbeat', '/api/v1/heartbeat'];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.chromaUrl}${endpoint}`);
        if (response.ok) {
          return {
            status: 'connected',
            mode: 'chroma',
            url: this.chromaUrl,
            endpoint
          };
        }
      } catch (error) {
        // Try the next endpoint before falling back.
      }
    }

    return {
      status: this.useLocalFallback ? 'fallback' : 'unavailable',
      mode: this.useLocalFallback ? 'local-json' : 'chroma',
      url: this.chromaUrl,
      message: this.useLocalFallback
        ? 'ChromaDB is not reachable. Using ai/memory/local-vector-store.json for local demo retrieval.'
        : 'ChromaDB is not reachable.'
    };
  }

  async ensureCollections(collectionNames) {
    for (const collectionName of collectionNames) {
      await this.ensureCollection(collectionName);
    }
  }

  async ensureCollection(collectionName) {
    const health = await this.healthCheck();
    if (health.mode !== 'chroma') {
      this.ensureLocalCollection(collectionName);
      return { name: collectionName, mode: health.mode };
    }

    try {
      return await this.ensureChromaCollection(collectionName);
    } catch (error) {
      if (!this.useLocalFallback) throw error;
      console.warn(`[VectorDB] Chroma collection setup failed for ${collectionName}. Using local fallback.`);
      this.ensureLocalCollection(collectionName);
      return { name: collectionName, mode: 'local-json', warning: error.message };
    }
  }

  async addDocuments(collectionName, records) {
    if (!records.length) return { collectionName, count: 0 };

    const health = await this.healthCheck();
    if (health.mode === 'chroma') {
      try {
        const collection = await this.ensureChromaCollection(collectionName);
        await this.addToChroma(collection.id, records);
        return { collectionName, count: records.length, mode: 'chroma' };
      } catch (error) {
        if (!this.useLocalFallback) throw error;
        console.warn(`[VectorDB] Chroma add failed for ${collectionName}. Using local fallback.`);
      }
    }

    this.addToLocalStore(collectionName, records);
    return { collectionName, count: records.length, mode: 'local-json' };
  }

  async query(collectionName, queryEmbedding, topK = 5) {
    const health = await this.healthCheck();
    if (health.mode === 'chroma') {
      try {
        const collection = await this.ensureChromaCollection(collectionName);
        return await this.queryChroma(collection.id, queryEmbedding, topK);
      } catch (error) {
        if (!this.useLocalFallback) throw error;
        console.warn(`[VectorDB] Chroma query failed for ${collectionName}. Using local fallback.`);
      }
    }

    return this.queryLocalStore(collectionName, queryEmbedding, topK);
  }

  async ensureChromaCollection(collectionName) {
    const base = `${this.chromaUrl}/api/v2/tenants/default_tenant/databases/default_database/collections`;
    const listResponse = await fetch(base);
    if (!listResponse.ok) {
      throw new Error(`Unable to list Chroma collections: ${listResponse.status}`);
    }

    const existing = await listResponse.json();
    const collections = Array.isArray(existing) ? existing : existing.collections || [];
    const match = collections.find((collection) => collection.name === collectionName);
    if (match) return match;

    const createResponse = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: collectionName })
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`Unable to create Chroma collection ${collectionName}: ${createResponse.status} ${body}`);
    }

    return createResponse.json();
  }

  async addToChroma(collectionId, records) {
    const response = await fetch(
      `${this.chromaUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${collectionId}/add`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: records.map((record) => record.id),
          documents: records.map((record) => record.document),
          metadatas: records.map((record) => record.metadata),
          embeddings: records.map((record) => record.embedding)
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Unable to add records to Chroma: ${response.status} ${body}`);
    }
  }

  async queryChroma(collectionId, queryEmbedding, topK) {
    const response = await fetch(
      `${this.chromaUrl}/api/v2/tenants/default_tenant/databases/default_database/collections/${collectionId}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embeddings: [queryEmbedding],
          n_results: topK,
          include: ['documents', 'metadatas', 'distances']
        })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Unable to query Chroma: ${response.status} ${body}`);
    }

    const data = await response.json();
    return this.normalizeChromaResults(data);
  }

  normalizeChromaResults(data) {
    const documents = data.documents?.[0] || [];
    const metadatas = data.metadatas?.[0] || [];
    const distances = data.distances?.[0] || [];

    return documents.map((document, index) => ({
      document,
      metadata: metadatas[index] || {},
      score: typeof distances[index] === 'number' ? Number((1 - distances[index]).toFixed(4)) : null
    }));
  }

  ensureLocalCollection(collectionName) {
    const store = this.readLocalStore();
    store.collections[collectionName] = store.collections[collectionName] || [];
    this.writeLocalStore(store);
  }

  addToLocalStore(collectionName, records) {
    const store = this.readLocalStore();
    const existing = store.collections[collectionName] || [];
    const byId = new Map(existing.map((record) => [record.id, record]));

    for (const record of records) {
      byId.set(record.id, {
        id: record.id,
        document: record.document,
        metadata: record.metadata,
        embedding: record.embedding,
        updatedAt: new Date().toISOString()
      });
    }

    store.collections[collectionName] = Array.from(byId.values());
    this.writeLocalStore(store);
  }

  queryLocalStore(collectionName, queryEmbedding, topK) {
    const store = this.readLocalStore();
    const records = store.collections[collectionName] || [];

    return records
      .map((record) => ({
        document: record.document,
        metadata: record.metadata,
        score: Number(cosineSimilarity(queryEmbedding, record.embedding).toFixed(4))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  readLocalStore() {
    if (!fs.existsSync(this.localStorePath)) {
      return { createdAt: new Date().toISOString(), collections: {} };
    }
    return fs.readJsonSync(this.localStorePath);
  }

  writeLocalStore(store) {
    fs.ensureDirSync(path.dirname(this.localStorePath));
    fs.writeJsonSync(this.localStorePath, store, { spaces: 2 });
  }
}

module.exports = ChromaClient;
