const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Root Cause Analysis Agent',
  role: 'Classify failures into application bug, locator issue, test data issue, environment issue, or framework issue.',
  promptFile: 'root-cause-analysis.md',
  outputType: 'Root cause analysis'
});
