const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const failure = await agents.failureAnalysis.run(input);
  const rca = await agents.rootCauseAnalysis.run({ ...input, failure });
  const defect = [
    '# Defect Report',
    '',
    '## Failure Analysis',
    failure,
    '',
    '## Root Cause Analysis',
    rca
  ].join('\n');
  writeAiOutput('defect-report.md', defect);
  return defect;
}

module.exports = { run };
