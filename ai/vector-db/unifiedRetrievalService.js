const RetrievalService = require('./retrievalService');
const LocalVectorStore = require('../local/localVectorStore');
const EmbeddingService = require('./embeddingService');
const config = require('./vectorConfig');

class UnifiedRetrievalService {
  constructor(options = {}) {
    this.options = options;
    this._init();
    console.log('[UnifiedRetrievalService] initialized in mode:', this.mode);
  }

  _init() {
    try {
      this.retrieval = new RetrievalService(this.options);
      this.mode = 'chroma';
    } catch (err) {
      // chroma not available or failed construction
      this.retrieval = null;
      this.mode = 'local';
    }

    this.localStore = new LocalVectorStore(this.options.storePath);
    this.embeddingService = new EmbeddingService(this.options);
  }

  async _embedText(text) {
    return this.embeddingService.embedText(text);
  }

  async _localSearchCollection(collectionName, query, topK = 5) {
    const embedding = await this._embedText(query);
    const results = this.localStore.search(embedding, topK || 5);
    // Convert local store document shape to expected retrieval response
    return results.map((item) => ({
      document: item.document || item.text || item.content || '',
      score: item.score,
      metadata: item.metadata || { collection: collectionName, sourcePath: item.sourcePath || item.id }
    }));
  }

  async search(collectionName, query, topK = 5, where) {
    if (this.retrieval) {
      try {
        const res = await this.retrieval.search(collectionName, query, topK, where);
        console.log('[UnifiedRetrievalService] using Chroma for', collectionName, 'query="' + String(query).slice(0,120) + '" topK=', topK);
        return res;
      } catch (err) {
        // fallback to local
        console.warn('[UnifiedRetrievalService] Chroma search failed, falling back to local store:', err.message);
        this.retrieval = null;
        this.mode = 'local';
      }
    }

    console.log('[UnifiedRetrievalService] using local JSON vector store for', collectionName, 'query="' + String(query).slice(0,120) + '" topK=', topK);
    return this._localSearchCollection(collectionName, query, topK);
  }

  searchRequirements(query, topK = 5) { return this.search(config.collections.requirements, query, topK); }
  searchFeatureFiles(query, topK = 5) { return this.search(config.collections.featureFiles, query, topK); }
  searchPageObjects(query, topK = 5) { return this.search(config.collections.pageObjects, query, topK); }
  searchFailures(query, topK = 5) { return this.search(config.collections.failures, query, topK); }
  searchLocators(query, topK = 5) { return this.search(config.collections.locators, query, topK); }
  searchReports(query, topK = 5) { return this.search(config.collections.failures, query, topK, { type: 'test-report' }); }
  searchJenkinsLogs(query, topK = 5) { return this.search(config.collections.jenkinsLogs, query, topK); }
}

module.exports = UnifiedRetrievalService;
