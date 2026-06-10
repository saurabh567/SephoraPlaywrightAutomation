const locatorHealingAgent = require('../agents/locatorHealingAgent');

async function main() {
  if (typeof locatorHealingAgent.suggestWithVectorDb !== 'function') {
    throw new Error('LocatorHealingAgent does not expose suggestWithVectorDb.');
  }

  const result = await locatorHealingAgent.suggestWithVectorDb();
  console.log(`[AI] Locator suggestions written to ${result.outputPath}`);
}

main().catch((error) => {
  console.error(`[AI] Locator healing failed: ${error.message}`);
  process.exit(1);
});
