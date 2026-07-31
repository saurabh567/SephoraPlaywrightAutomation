import fs from 'fs-extra';
import path from 'path';
import IngestionService from './unifiedIngestionService';

async function main() {
  console.log('[VectorDB] Starting framework knowledge ingestion');
  // Ensure Ollama and Chroma are running (auto-start if available). Ollama is required for embeddings.
  try {
    const ollamaManager = require('../health/ollamaManager');
    const ores = await ollamaManager.ensureRunning();
    console.log('[VectorDB] Ollama ensureRunning:', ores && (ores.ok || ores.started || ores.alreadyRunning) ? 'ok' : JSON.stringify(ores));
  } catch (e: any) {
    console.warn('[VectorDB] Ollama ensureRunning failed (embeddings may fail):', e.message);
  }
  try {
    const chromaManager = require('./chromaServerManager');
    await chromaManager.ensureRunning();
  } catch (e: any) {
    console.warn('[VectorDB] Chroma ensureRunning failed, will fallback to local store:', e.message);
  }
  const service = new IngestionService();
  const result: any = await service.ingestAll();

  const outputPath = path.join(process.cwd(), 'ai/output/vector-ingestion-summary.json');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeJsonSync(outputPath, result, { spaces: 2 });

  const total = (result && (result.totalDocuments || (result.result && (result.result.totalDocuments || result.result.insertedOrUpdated)))) || 0;
  console.log(`[VectorDB] Ingested ${total} documents`);
  console.log(`[VectorDB] Summary: ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(`[VectorDB] Ingestion failed: ${error.message}`);
  process.exit(1);
});
