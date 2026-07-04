const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Test Data Generation Agent',
  role: 'Generate valid, invalid, boundary, and reusable JSON test data.',
  promptFile: 'test-data-generation.md',
  outputType: 'JSON test data'
});


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Test Data Generation Agent (Legacy)",
  "version": "1.0.0",
  "description": "BaseAgent-based test data generation (legacy, superseded by TestDataPipelineAgent). Available via CLI: node ai/index.js --agent testDataGenerationAgent",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "data",
    "generation",
    "legacy"
  ],
  "executionStage": "preflight",
  "priority": 20,
  "conditions": [
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
