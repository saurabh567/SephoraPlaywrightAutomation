import fs from 'fs-extra';
import path from 'path';
import RagService from '../rag/ragService';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'Playwright locator timeout while waiting for an element to be visible';
  const rag = new RagService();
  const result = await rag.generate({
    task: 'Provide a concise diagnostic assessment for this automation failure.',
    input: query,
    topK: 3,
    systemPrompt: 'You are a senior Playwright automation failure analyst. Use supplied evidence and cite source paths.',
    instructions: 'Return Markdown. Include Evidence, Likely Cause, and Recommended Action.',
    retrieve: (retrieval: any, topK: any) => retrieval.searchFailures(query, topK)
  });

  if (!result.promptEvidence.contextIncludedInPrompt) {
    throw new Error('Retrieved content was not included in the LLM prompt.');
  }
  if (!result.retrievedDocuments.length) {
    throw new Error('RAG validation retrieved no documents. Run npm run vector:ingest first.');
  }

  const outputPath = path.join(process.cwd(), 'reports/ai/rag-validation.json');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeJsonSync(outputPath, result, { spaces: 2 });
  console.log(JSON.stringify({
    status: 'passed',
    outputPath: path.relative(process.cwd(), outputPath),
    model: result.model,
    retrievalEvidence: result.promptEvidence,
    usage: result.usage
  }, null, 2));
}

main().catch((error) => {
  console.error(`[RAG] Validation failed: ${error.stack || error.message}`);
  process.exit(1);
});
