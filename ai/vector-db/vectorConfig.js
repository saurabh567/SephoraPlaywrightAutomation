require('dotenv').config();
const rootDir = process.cwd();

const collections = Object.freeze({
  requirements: 'requirements_collection',
  featureFiles: 'feature_files_collection',
  pageObjects: 'page_objects_collection',
  locators: 'locators_collection',
  failures: 'failures_collection',
  jenkinsLogs: 'jenkins_logs_collection'
});

module.exports = {
  rootDir,
  chromaUrl: (process.env.CHROMA_URL || 'http://localhost:8000').replace(/\/$/, ''),
  chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
  chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
  llmModel: process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b',
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 16),
  requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000),
  chunkSize: Number(process.env.VECTOR_CHUNK_SIZE || 6000),
  chunkOverlap: Number(process.env.VECTOR_CHUNK_OVERLAP || 500),
  collections
};
