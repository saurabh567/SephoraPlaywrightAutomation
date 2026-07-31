import fs from 'fs-extra';
import path from 'path';
import TestCaseGenerationAgent from '../agents/testCaseGenerationAgent';

async function main() {
  const agent = new TestCaseGenerationAgent();
  const requirementPath = path.join(process.cwd(), 'ai/input/requirement.txt');
  const requirement = fs.existsSync(requirementPath)
    ? fs.readFileSync(requirementPath, 'utf8')
    : 'User should be able to search products on Amazon India.';

  if (typeof agent.generateFeatureWithVectorDb !== 'function') {
    throw new Error('TestCaseGenerationAgent does not expose generateFeatureWithVectorDb.');
  }

  const result = await agent.generateFeatureWithVectorDb(requirement);
  console.log(`[AI] Generated feature written to ${result.outputPath}`);
}

main().catch((error) => {
  console.error(`[AI] Test generation failed: ${error.message}`);
  process.exit(1);
});
