const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const EmbeddingService = require('./embeddingService');

class RetrievalService {
  constructor(options = {}) {
    this.client = options.client || new ChromaClient();
    this.embeddingService = options.embeddingService || new EmbeddingService();
  }

  async search(collectionName, query, topK = 5, where) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) throw new Error('Retrieval query cannot be empty.');
    const requestedTopK = Number(topK);
    if (!Number.isInteger(requestedTopK) || requestedTopK <= 0) {
      throw new Error('topK must be a positive integer.');
    }

    const embedding = await this.embeddingService.embedText(normalizedQuery);
    return this.client.query(collectionName, embedding, requestedTopK, where);
  }

  searchRequirements(query, topK = 5) {
    return this.search(config.collections.requirements, query, topK);
  }

  searchFeatureFiles(query, topK = 5) {
    return this.search(config.collections.featureFiles, query, topK);
  }

  searchPageObjects(query, topK = 5) {
    return this.search(config.collections.pageObjects, query, topK);
  }

  searchFailures(query, topK = 5) {
    return this.search(config.collections.failures, query, topK);
  }

  searchLocators(query, topK = 5) {
    return this.search(config.collections.locators, query, topK);
  }

  searchReports(query, topK = 5) {
    return this.search(config.collections.failures, query, topK, { type: 'test-report' });
  }

  searchJenkinsLogs(query, topK = 5) {
    return this.search(config.collections.jenkinsLogs, query, topK);
  }
}

module.exports = RetrievalService;
