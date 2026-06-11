const fs = require('fs-extra');
const path = require('path');
const failureAnalysisAgent = require('../agents/failureAnalysisAgent');
const locatorHealingAgent = require('../agents/locatorHealingAgent');
const TestCaseGenerationAgent = require('../agents/testCaseGenerationAgent');

async function main() {
  const validationFailure = {
    feature: 'AI validation',
    scenario: 'Validate agent retrieval integration',
    failedStep: 'search button should be visible',
    locator: "getByText('Search')",
    error: 'Timeout 30000ms exceeded while waiting for locator to be visible'
  };

  const failureAnalysis = await failureAnalysisAgent.analyzeWithRag({ failures: [validationFailure] });
  const locatorHealing = await locatorHealingAgent.suggestWithRag({ failures: [validationFailure] });
  const testGeneration = await new TestCaseGenerationAgent().generateFeatureWithRag(
    'User should be able to search Amazon for a product and see relevant search results.'
  );

  const results = { failureAnalysis, locatorHealing, testGeneration };
  for (const [name, result] of Object.entries(results)) {
    if (
      !result.retrievalEvidence?.contextIncludedInPrompt
      || result.retrievalEvidence.retrievedDocumentCount < 1
    ) {
      throw new Error(`${name} did not include retrieved context in its LLM prompt.`);
    }
  }

  const outputPath = path.join(process.cwd(), 'reports/ai/agent-validation.json');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeJsonSync(outputPath, results, { spaces: 2 });
  console.log(JSON.stringify({
    status: 'passed',
    outputPath: path.relative(process.cwd(), outputPath),
    agents: Object.keys(results)
  }, null, 2));
}

main().catch((error) => {
  console.error(`[AI] Agent validation failed: ${error.stack || error.message}`);
  process.exit(1);
});
