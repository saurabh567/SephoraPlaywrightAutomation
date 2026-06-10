const failureAnalysisAgent = require('../agents/failureAnalysisAgent');

async function main() {
  if (typeof failureAnalysisAgent.analyzeWithVectorDb !== 'function') {
    throw new Error('FailureAnalysisAgent does not expose analyzeWithVectorDb.');
  }

  const result = await failureAnalysisAgent.analyzeWithVectorDb();
  console.log(`[AI] Failure analysis written to ${result.outputPath}`);
}

main().catch((error) => {
  console.error(`[AI] Failure analysis failed: ${error.message}`);
  process.exit(1);
});
