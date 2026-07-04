const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'API Test Generation Agent',
  role: 'Generate API test scenarios and Playwright request-based API tests from API specs.',
  promptFile: 'api-test-generation.md',
  outputType: 'API test plan and code'
});


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "API Test Generation Agent (Legacy)",
  "version": "1.0.0",
  "description": "BaseAgent-based API test generation (legacy, superseded by APIAgent). Available via CLI: node ai/index.js --agent apiTestGenerationAgent",
  "dependencies": [],
  "platforms": [
    "API"
  ],
  "tags": [
    "api",
    "generation",
    "legacy"
  ],
  "executionStage": "execution",
  "priority": 25,
  "conditions": [
    {
      "type": "platform",
      "value": "api"
    },
    {
      "type": "onDemand"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "on_demand"
};
