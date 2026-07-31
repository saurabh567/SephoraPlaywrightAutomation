import agents from '../agents';
import { writeAiOutput } from '../tools/fileWriter';

async function run(input: any) {
  const failure = await agents.failureAnalysis.run(input);
  const locatorFix = await agents.locatorHealing.run({ ...input, failure });
  const healingPlan = await new agents.selfHealingAutomation().run();
  writeAiOutput('locator-healing-plan.md', healingPlan);
  return healingPlan;
}

export { run };
export default { run: run };
