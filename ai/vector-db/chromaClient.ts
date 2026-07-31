import config from './vectorConfig';

class ChromaClient {
  [key: string]: any;
  constructor(options: any = {}) {
    this.chromaUrl = options.chromaUrl || config.chromaUrl;
    this.tenant = options.tenant || config.chromaTenant;
    this.database = options.database || config.chromaDatabase;
    this.timeoutMs = options.timeoutMs || config.requestTimeoutMs;
    this.authToken = options.authToken || process.env.CHROMA_AUTH_TOKEN || '';
  }

  get collectionsUrl() {
    return `${this.chromaUrl}/api/v2/tenants/${encodeURIComponent(this.tenant)}/databases/${encodeURIComponent(this.database)}/collections`;
  }

  async request(url: any, options: any = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {} as Record<string, any>),
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {} as Record<string, any>),
          ...options.headers
        },
        signal: controller.signal
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`ChromaDB request timed out after ${this.timeoutMs}ms: ${url}`);
      }
      throw new Error(`ChromaDB is not reachable at ${this.chromaUrl}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ChromaDB request failed: ${response.status} ${response.statusText} ${body}`.trim());
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async healthCheck() {
    const endpoints = ['/api/v2/heartbeat', '/api/v1/heartbeat'];
    let lastError;

    for (const endpoint of endpoints) {
      try {
        const heartbeat = await this.request(`${this.chromaUrl}${endpoint}`);
        return {
          status: 'connected',
          mode: 'chroma',
          url: this.chromaUrl,
          tenant: this.tenant,
          database: this.database,
          heartbeat
        };
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new Error(`ChromaDB health check failed at ${this.chromaUrl}: ${lastError?.message || 'unknown error'}`);
  }

  async listCollections() {
    const payload = await this.request(this.collectionsUrl);
    return Array.isArray(payload) ? payload : payload?.collections || [];
  }

  async ensureCollections(collectionNames: any) {
    const results: any[] = [];
    for (const collectionName of collectionNames) {
      results.push(await this.ensureCollection(collectionName));
    }
    return results;
  }

  async ensureCollection(collectionName: any) {
    const collections = await this.listCollections();
    const existing = collections.find((collection: any) => collection.name === collectionName);
    if (existing) return existing;

    return this.request(this.collectionsUrl, {
      method: 'POST',
      body: JSON.stringify({
        name: collectionName,
        metadata: { 'hnsw:space': 'cosine' }
      })
    });
  }

  async upsertDocuments(collectionName: any, records: any) {
    if (!records.length) return { collectionName, count: 0 };
    const collection = await this.ensureCollection(collectionName);
    await this.request(`${this.collectionsUrl}/${collection.id}/upsert`, {
      method: 'POST',
      body: JSON.stringify({
        ids: records.map((record: any) => record.id),
        documents: records.map((record: any) => record.document),
        metadatas: records.map((record: any) => record.metadata),
        embeddings: records.map((record: any) => record.embedding)
      })
    });
    return { collectionName, collectionId: collection.id, count: records.length, mode: 'chroma' };
  }

  async query(collectionName: any, queryEmbedding: any, topK = 5, where: any) {
    const collection = await this.ensureCollection(collectionName);
    const payload = await this.request(`${this.collectionsUrl}/${collection.id}/query`, {
      method: 'POST',
      body: JSON.stringify({
        query_embeddings: [queryEmbedding],
        n_results: topK,
        include: ['documents', 'metadatas', 'distances'],
        ...(where ? { where } : {} as Record<string, any>)
      })
    });
    return this.normalizeQueryResults(payload);
  }

  async count(collectionName: any) {
    const collection = await this.ensureCollection(collectionName);
    const payload = await this.request(`${this.collectionsUrl}/${collection.id}/count`);
    return typeof payload === 'number' ? payload : payload?.count || 0;
  }

  normalizeQueryResults(payload: any) {
    const ids = payload.ids?.[0] || [];
    const documents = payload.documents?.[0] || [];
    const metadatas = payload.metadatas?.[0] || [];
    const distances = payload.distances?.[0] || [];

    return documents.map((document: any, index: any) => ({
      id: ids[index],
      document,
      metadata: metadatas[index] || {},
      distance: typeof distances[index] === 'number' ? distances[index] : null,
      similarityScore: typeof distances[index] === 'number'
        ? Number(Math.max(-1, Math.min(1, 1 - distances[index])).toFixed(6))
        : null
    }));
  }
}

export default ChromaClient;
