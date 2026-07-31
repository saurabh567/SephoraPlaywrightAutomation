import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const pageObject = await new agents.pageObjectGeneration().run();
  const steps = await new agents.stepDefinitionGeneration().run();
  writeAiOutput('generated-page-object.js', pageObject);
  writeAiOutput('generated-steps.js', steps);
  return { pageObject, steps };
}

export { run };
export default { run: run };
