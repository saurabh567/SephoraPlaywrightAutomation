import UnifiedRetrievalService from '../vector-db/unifiedRetrievalService';
import LlmService from './llmService';
import { buildRagPrompt } from './promptBuilder';

class RagService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.retrieval = options.retrieval || new UnifiedRetrievalService();
    this.llm = options.llm || new LlmService();
  }

  async generate({ task, input, retrieve, topK = 5, systemPrompt, instructions }: any) {
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
        sources: retrievedDocuments.map((item: any) => item.metadata?.sourcePath || 'unknown'),
        contextIncludedInPrompt: retrievedDocuments.length > 0
          && retrievedDocuments.every((item: any) => userPrompt.includes(item.document))
      }
    };
  }
}

export default RagService;
