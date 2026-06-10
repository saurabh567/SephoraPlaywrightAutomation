const config = require('./vectorConfig');
const ChromaClient = require('./chromaClient');
const EmbeddingService = require('./embeddingService');

class RetrievalService {
  constructor() {
    this.client = new ChromaClient();
    this.embeddingService = new EmbeddingService();
  }

  async search(collectionName, query, topK = 5) {
    const embedding = await this.embeddingService.embedText(query);
    return this.client.query(collectionName, embedding, topK);
  }

  searchRequirements(query, topK = 5) {
    return this.search(config.collections.requirements, query, topK);
  }

  searchFeatureFiles(query, topK = 5) {
    return this.search(config.collections.featureFiles, query, topK);
  }

  searchFailures(query, topK = 5) {
    return this.search(config.collections.failures, query, topK);
  }

  searchLocators(query, topK = 5) {
    return this.search(config.collections.locators, query, topK);
  }

  searchReports(query, topK = 5) {
    return this.search(config.collections.reports, query, topK);
  }
}

module.exports = RetrievalService;
