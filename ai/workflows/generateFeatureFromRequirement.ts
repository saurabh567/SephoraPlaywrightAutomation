import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const testCases = await new agents.testCaseGeneration().run();
  const feature = await new agents.featureFileGeneration().run();
  writeAiOutput('generated-feature.feature', feature);
  return feature;
}

export { run };
export default { run: run };
