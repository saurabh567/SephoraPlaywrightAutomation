const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const analysis = await agents.jenkinsBuildFailureAnalysis.run(input);
  const rca = await agents.rootCauseAnalysis.run({ ...input, analysis });
  const output = `${analysis}\n\n---\n\n${rca}`;
  writeAiOutput('jenkins-build-analysis.md', output);
  return output;
}

module.exports = { run };
