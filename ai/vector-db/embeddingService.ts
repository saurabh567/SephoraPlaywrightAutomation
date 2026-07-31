import config from './vectorConfig';
import OllamaClient from '../local/ollamaClient';

class EmbeddingService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.model = options.model || config.embeddingModel;
    this.expectedDimensions = Number(options.dimensions || config.embeddingDimensions);
    this.batchSize = Number(options.batchSize || config.embeddingBatchSize);
    this.ollama = options.ollama || new OllamaClient({
      baseUrl: options.baseUrl || config.ollamaBaseUrl,
      timeoutMs: options.timeoutMs || config.requestTimeoutMs
    });
  }

  validateConfiguration() {
    if (!this.model) throw new Error('OLLAMA_EMBEDDING_MODEL is required.');
    if (!Number.isInteger(this.expectedDimensions) || this.expectedDimensions <= 0) {
      throw new Error('EMBEDDING_DIMENSIONS must be a positive integer.');
    }
  }

  validateEmbedding(embedding: any, index = 0) {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error(`Ollama returned an empty embedding at index ${index}.`);
    }
    if (embedding.length !== this.expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch for ${this.model}: expected ${this.expectedDimensions}, received ${embedding.length}.`
      );
    }
    if (embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Ollama returned non-numeric embedding values at index ${index}.`);
    }
  }

  async requestEmbeddings(inputs: any) {
    this.validateConfiguration();
    const normalized = inputs.map((input: any) => String(input || '').trim());
    if (normalized.some((input: any) => !input)) throw new Error('Cannot embed empty text.');

    // Use the OllamaClient's requestEmbeddings which handles endpoint fallback
    const embeddings = await this.ollama.requestEmbeddings(this.model, normalized, { truncate: true });

    if (!Array.isArray(embeddings) || embeddings.length !== normalized.length) {
      throw new Error(`Ollama returned ${embeddings.length} vectors for ${normalized.length} inputs.`);
    }
    embeddings.forEach((embedding, index) => this.validateEmbedding(embedding, index));
    return embeddings;
  }

  async embedText(text: any) {
    const [embedding] = await this.requestEmbeddings([text]);
    return embedding;
  }

  async embedMany(texts: any) {
    const inputs = Array.from(texts || []);
    const embeddings: any[] = [];
    for (let index = 0; index < inputs.length; index += this.batchSize) {
      embeddings.push(...await this.requestEmbeddings(inputs.slice(index, index + this.batchSize)));
    }
    return embeddings;
  }

  async healthCheck() {
    await this.ollama.ensureModel(this.model);
    const embedding = await this.embedText('AI automation embedding health check');
    return {
      status: 'connected',
      provider: 'ollama',
      url: this.ollama.baseUrl,
      model: this.model,
      dimensions: embedding.length
    };
  }
}

export default EmbeddingService;
