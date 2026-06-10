require('dotenv').config();
const path = require('path');

const rootDir = process.cwd();

const collections = {
  requirements: 'requirements_collection',
  featureFiles: 'feature_files_collection',
  failures: 'failures_collection',
  locators: 'locators_collection',
  reports: 'reports_collection'
};

module.exports = {
  rootDir,
  dbType: process.env.VECTOR_DB_TYPE || 'chroma',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  mockMode: String(process.env.MOCK_MODE || 'true').toLowerCase() === 'true',
  useLocalFallback: String(process.env.VECTOR_LOCAL_FALLBACK || 'true').toLowerCase() === 'true',
  localStorePath: path.join(rootDir, 'ai/memory/local-vector-store.json'),
  collections
};
