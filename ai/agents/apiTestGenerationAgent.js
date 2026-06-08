const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'API Test Generation Agent',
  role: 'Generate API test scenarios and Playwright request-based API tests from API specs.',
  promptFile: 'api-test-generation.md',
  outputType: 'API test plan and code'
});
