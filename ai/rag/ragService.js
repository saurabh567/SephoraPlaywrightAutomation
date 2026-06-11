const RetrievalService = require('../vector-db/retrievalService');
const LlmService = require('./llmService');
const { buildRagPrompt } = require('./promptBuilder');

class RagService {
  constructor(options = {}) {
    this.retrieval = options.retrieval || new RetrievalService();
    this.llm = options.llm || new LlmService();
  }

  async generate({ task, input, retrieve, topK = 5, systemPrompt, instructions }) {
    if (typeof retrieve !== 'function') throw new Error('RAG retrieval callback is required.');
    const retrievedDocuments = await retrieve(this.retrieval, topK);
    const userPrompt = buildRagPrompt({
      task,
      input,
      retrievedDocuments,
      instructions
    });
    const generation = await this.llm.complete({
      systemPrompt,
      userPrompt
    });

    return {
      ...generation,
      retrievedDocuments,
      promptEvidence: {
        retrievedDocumentCount: retrievedDocuments.length,
        sources: retrievedDocuments.map((item) => item.metadata?.sourcePath || 'unknown'),
        contextIncludedInPrompt: retrievedDocuments.length > 0
          && retrievedDocuments.every((item) => userPrompt.includes(item.document))
      }
    };
  }
}

module.exports = RagService;
