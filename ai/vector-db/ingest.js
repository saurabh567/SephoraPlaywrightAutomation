const fs = require('fs-extra');
const path = require('path');
const IngestionService = require('./unifiedIngestionService');

async function main() {
  console.log('[VectorDB] Starting framework knowledge ingestion');
  const service = new IngestionService();
  const result = await service.ingestAll();

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
