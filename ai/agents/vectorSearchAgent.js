/**
 * vectorSearchAgent.js
 *
 * AI Pipeline: Vector Search stage.
 * Searches the ChromaDB vector store for historical evidence related to
 * current test failures, enabling RAG-based analysis.
 *
 * Wraps the existing retrieval services (unifiedRetrievalService, search.js)
 * as a proper pipeline agent.
 */

const fs = require('fs-extra');
const path = require('path');

class VectorSearchAgent {
  async run(input = {}) {
    console.log('[VectorSearchAgent] Searching vector store for relevant evidence');

    const results = {
      searches: [],
      totalDocuments: 0,
      collections: {}
    };

    const query = input.query || input.failureQuery || '';
    const topK = input.topK || 5;

    try {
      const RetrievalService = require('../vector-db/unifiedRetrievalService');
      const retrieval = new RetrievalService();

      // 1. Search failures collection
      try {
        const failures = await retrieval.searchFailures(query || 'test failure', topK);
        if (failures && failures.length > 0) {
          results.searches.push({ collection: 'failures', count: failures.length });
          results.collections.failures = failures.length;
          results.totalDocuments += failures.length;
        }
      } catch (e) {
        console.warn('[VectorSearchAgent] Failures search:', e.message);
      }

      // 2. Search locators collection
      try {
        const locators = await retrieval.searchLocators(query || 'locator', topK);
        if (locators && locators.length > 0) {
          results.searches.push({ collection: 'locators', count: locators.length });
          results.collections.locators = locators.length;
          results.totalDocuments += locators.length;
        }
      } catch (e) {
        console.warn('[VectorSearchAgent] Locators search:', e.message);
      }

      // 3. Search page objects collection
      try {
        const pageObjects = await retrieval.searchPageObjects(query || 'page', Math.max(3, Math.ceil(topK / 2)));
        if (pageObjects && pageObjects.length > 0) {
          results.searches.push({ collection: 'pageObjects', count: pageObjects.length });
          results.collections.pageObjects = pageObjects.length;
          results.totalDocuments += pageObjects.length;
        }
      } catch (e) {
        console.warn('[VectorSearchAgent] PageObjects search:', e.message);
      }

      // 4. Search requirements collection
      try {
        const requirements = await retrieval.searchRequirements(query || 'requirement', Math.max(2, Math.ceil(topK / 2)));
        if (requirements && requirements.length > 0) {
          results.searches.push({ collection: 'requirements', count: requirements.length });
          results.collections.requirements = requirements.length;
          results.totalDocuments += requirements.length;
        }
      } catch (e) {
        console.warn('[VectorSearchAgent] Requirements search:', e.message);
      }

    } catch (err) {
      console.warn('[VectorSearchAgent] Search failed:', err.message);
    }

    console.log(`[VectorSearchAgent] Found ${results.totalDocuments} documents across ${results.searches.length} collections`);

    // Write search results
    const outPath = path.join(process.cwd(), 'reports', 'ai', 'vector-search-results.json');
    fs.ensureDirSync(path.dirname(outPath));
    fs.writeJsonSync(outPath, results, { spaces: 2 });

    return {
      ok: results.totalDocuments > 0,
      searches: results.searches,
      totalDocuments: results.totalDocuments,
      collections: results.collections,
      outputPath: path.relative(process.cwd(), outPath)
    };
  }
}

module.exports = VectorSearchAgent;

// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  name: 'Vector Search Agent',
  version: '1.0.0',
  description: 'Searches ChromaDB vector store for historical failure evidence',
  dependencies: [],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['search', 'rag', 'vector'],
  executionStage: 'analysis',
  priority: 75,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['vector-search'],
  lifecycle: 'active'
};
