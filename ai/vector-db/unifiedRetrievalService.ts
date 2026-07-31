import RetrievalService from './retrievalService';
import LocalVectorStore from '../local/localVectorStore';
import EmbeddingService from './embeddingService';
import config from './vectorConfig';

class UnifiedRetrievalService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.options = options;
    this._init();
    console.log('[UnifiedRetrievalService] initialized in mode:', this.mode);
  }

  _init() {
    try {
      this.retrieval = new RetrievalService(this.options);
      this.mode = 'chroma';
    } catch (err: any) {
      // chroma not available or failed construction
      this.retrieval = null;
      this.mode = 'local';
    }

    this.localStore = new LocalVectorStore(this.options.storePath);
    this.embeddingService = new EmbeddingService(this.options);
  }

  async _embedText(text: any) {
    return this.embeddingService.embedText(text);
  }

  async _localSearchCollection(collectionName: any, query: any, topK = 5) {
    const embedding = await this._embedText(query);
    const results = this.localStore.search(embedding, topK || 5);
    // Convert local store document shape to expected retrieval response
    return results.map((item: any) => ({
      document: item.document || item.text || item.content || '',
      score: item.score,
      metadata: item.metadata || { collection: collectionName, sourcePath: item.sourcePath || item.id }
    }));
  }

  async search(collectionName: any, query: any, topK = 5, where?: any) {
    if (this.retrieval) {
      try {
        const res = await this.retrieval.search(collectionName, query, topK, where);
        console.log('[UnifiedRetrievalService] using Chroma for', collectionName, 'query="' + String(query).slice(0,120) + '" topK=', topK);
        return res;
      } catch (err: any) {
        // fallback to local
        console.warn('[UnifiedRetrievalService] Chroma search failed, falling back to local store:', err.message);
        this.retrieval = null;
        this.mode = 'local';
      }
    }

    console.log('[UnifiedRetrievalService] using local JSON vector store for', collectionName, 'query="' + String(query).slice(0,120) + '" topK=', topK);
    return this._localSearchCollection(collectionName, query, topK);
  }

  searchRequirements(query: any, topK = 5) { return this.search(config.collections.requirements, query, topK); }
  searchFeatureFiles(query: any, topK = 5) { return this.search(config.collections.featureFiles, query, topK); }
  searchPageObjects(query: any, topK = 5) { return this.search(config.collections.pageObjects, query, topK); }
  searchFailures(query: any, topK = 5) { return this.search(config.collections.failures, query, topK); }
  searchLocators(query: any, topK = 5) { return this.search(config.collections.locators, query, topK); }
  searchReports(query: any, topK = 5) { return this.search(config.collections.failures, query, topK, { type: 'test-report' }); }
  searchJenkinsLogs(query: any, topK = 5) { return this.search(config.collections.jenkinsLogs, query, topK); }
}

export default UnifiedRetrievalService;
