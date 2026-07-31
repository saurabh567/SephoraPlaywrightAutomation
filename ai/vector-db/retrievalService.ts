import config from './vectorConfig';
import ChromaClient from './chromaClient';
import EmbeddingService from './embeddingService';

class RetrievalService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.client = options.client || new ChromaClient();
    this.embeddingService = options.embeddingService || new EmbeddingService();
  }

  async search(collectionName: any, query: any, topK = 5, where?: any) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) throw new Error('Retrieval query cannot be empty.');
    const requestedTopK = Number(topK);
    if (!Number.isInteger(requestedTopK) || requestedTopK <= 0) {
      throw new Error('topK must be a positive integer.');
    }

    const embedding = await this.embeddingService.embedText(normalizedQuery);
    return this.client.query(collectionName, embedding, requestedTopK, where);
  }

  searchRequirements(query: any, topK = 5) {
    return this.search(config.collections.requirements, query, topK);
  }

  searchFeatureFiles(query: any, topK = 5) {
    return this.search(config.collections.featureFiles, query, topK);
  }

  searchPageObjects(query: any, topK = 5) {
    return this.search(config.collections.pageObjects, query, topK);
  }

  searchFailures(query: any, topK = 5) {
    return this.search(config.collections.failures, query, topK);
  }

  searchLocators(query: any, topK = 5) {
    return this.search(config.collections.locators, query, topK);
  }

  searchReports(query: any, topK = 5) {
    return this.search(config.collections.failures, query, topK, { type: 'test-report' });
  }

  searchJenkinsLogs(query: any, topK = 5) {
    return this.search(config.collections.jenkinsLogs, query, topK);
  }
}

export default RetrievalService;
