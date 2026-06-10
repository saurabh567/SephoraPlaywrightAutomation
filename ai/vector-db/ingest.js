const fs = require('fs-extra');
const path = require('path');
const IngestionService = require('./ingestionService');

async function main() {
  console.log('[VectorDB] Starting framework knowledge ingestion');
  const service = new IngestionService();
  const result = await service.ingestAll();

  const outputPath = path.join(process.cwd(), 'ai/output/vector-ingestion-summary.json');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeJsonSync(outputPath, result, { spaces: 2 });

  console.log(`[VectorDB] Ingested ${result.totalDocuments} documents`);
  console.log(`[VectorDB] Summary: ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(`[VectorDB] Ingestion failed: ${error.message}`);
  process.exit(1);
});
