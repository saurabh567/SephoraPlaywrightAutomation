const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const testCases = await agents.testCaseGeneration.run(input);
  const feature = await agents.featureFileGeneration.run({ ...input, testCases });
  writeAiOutput('generated-feature.feature', feature);
  return feature;
}

module.exports = { run };
