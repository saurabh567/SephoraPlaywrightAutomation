const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Test Data Generation Agent',
  role: 'Generate valid, invalid, boundary, and reusable JSON test data.',
  promptFile: 'test-data-generation.md',
  outputType: 'JSON test data'
});
