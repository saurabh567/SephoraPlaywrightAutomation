const agents = require('../agents');
const { writeAiOutput } = require('../tools/fileWriter');

async function run(input) {
  const summary = await agents.reportSummarization.run(input);
  writeAiOutput('execution-summary.md', summary);
  return summary;
}

module.exports = { run };
