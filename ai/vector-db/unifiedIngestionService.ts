import IngestionService from './ingestionService';
import EmbeddingService from './embeddingService';
import LocalVectorStore from '../local/localVectorStore';

class UnifiedIngestionService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.options = options;
    this.embeddingService = options.embeddingService || new EmbeddingService();
    try {
      this.ingestion = new IngestionService(options);
      this.mode = 'chroma';
    } catch (err: any) {
      this.ingestion = null;
      this.mode = 'local';
    }
    this.localStore = new LocalVectorStore(options.storePath);
    console.log('[UnifiedIngestionService] initialized in mode:', this.mode);
  }

  async ingestDocumentsToLocal(documents: any) {
    console.log('[UnifiedIngestionService] creating embeddings for', documents.length, 'documents');
    // produce embeddings and upsert into local JSON store
    const embeddings = await this.embeddingService.embedMany(documents.map((d: any) => d.document));
    const records = documents.map((doc: any, idx: any) => ({
      id: doc.id,
      document: doc.document,
      embedding: embeddings[idx],
      metadata: doc.metadata || {}
    }));
    const res = this.localStore.upsert(records);
    console.log('[UnifiedIngestionService] upserted', res.insertedOrUpdated, 'documents to', res.storePath);
    return res;
  }

  async ingestAll() {
    if (this.ingestion) {
      try {
        const res = await this.ingestion.ingestAll();
        console.log('[UnifiedIngestionService] ingested into Chroma:', (res && res.totalDocuments) || undefined);
        return { mode: 'chroma', result: res };
      } catch (err: any) {
        console.warn('[UnifiedIngestionService] Chroma ingest failed, falling back to local:', err.message);
        this.mode = 'local';
      }
    }

    // Fallback: collect documents using IngestionService's collection helpers if available
    const collector = this.ingestion || new (require('./ingestionService'))();
    const documents = collector.collectFrameworkDocuments();
    console.log('[UnifiedIngestionService] ingesting to local store, documents:', documents.length);
    const res = await this.ingestDocumentsToLocal(documents);
    return { mode: 'local', result: res };
  }

  async ingestRuntimeArtifacts() {
    if (this.ingestion) {
      try {
        const res = await this.ingestion.ingestRuntimeArtifacts();
        return { mode: 'chroma', result: res };
      } catch (err: any) {
        console.warn('[UnifiedIngestionService] Chroma runtime ingest failed, falling back to local:', err.message);
        this.mode = 'local';
      }
    }

    const collector = this.ingestion || new (require('./ingestionService'))();
    const documents = collector.collectFrameworkDocuments({ includeSources: false, includeRuntime: true });
    const res = await this.ingestDocumentsToLocal(documents);
    return { mode: 'local', result: res };
  }

  async ingestJenkinsLog(filePath: any) {
    if (this.ingestion) {
      try {
        const res = await this.ingestion.ingestJenkinsLog(filePath);
        return { mode: 'chroma', result: res };
      } catch (err: any) {
        console.warn('[UnifiedIngestionService] Chroma jenkins ingest failed, falling back to local:', err.message);
        this.mode = 'local';
      }
    }

    const collector = this.ingestion || new (require('./ingestionService'))();
    const documents = collector.buildFileRecords(require('./vectorConfig').collections.jenkinsLogs, filePath, 'jenkins-log');
    const res = await this.ingestDocumentsToLocal(documents);
    return { mode: 'local', result: res };
  }
}

export default UnifiedIngestionService;
