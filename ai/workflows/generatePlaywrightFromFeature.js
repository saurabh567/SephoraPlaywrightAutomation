const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const pageObject = await agents.pageObjectGeneration.run(input);
  const steps = await agents.stepDefinitionGeneration.run({ ...input, pageObject });
  writeAiOutput('generated-page-object.js', pageObject);
  writeAiOutput('generated-steps.js', steps);
  return { pageObject, steps };
}

module.exports = { run };
