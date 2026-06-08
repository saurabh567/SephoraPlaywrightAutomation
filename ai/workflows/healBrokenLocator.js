const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const failure = await agents.failureAnalysis.run(input);
  const locatorFix = await agents.locatorHealing.run({ ...input, failure });
  const healingPlan = await agents.selfHealingAutomation.run({ ...input, failure, locatorFix });
  writeAiOutput('locator-healing-plan.md', healingPlan);
  return healingPlan;
}

module.exports = { run };
