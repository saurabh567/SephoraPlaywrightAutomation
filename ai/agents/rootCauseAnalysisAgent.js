const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Root Cause Analysis Agent',
  role: 'Classify failures into application bug, locator issue, test data issue, environment issue, or framework issue.',
  promptFile: 'root-cause-analysis.md',
  outputType: 'Root cause analysis'
});


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Root Cause Analysis (Legacy)",
  "version": "1.0.0",
  "description": "LLM-based root cause classification (legacy, superseded by RCAAgent). Available via CLI: node ai/index.js --agent rootCauseAnalysisAgent",
  "dependencies": ["failureAnalysisAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "analysis",
    "rca",
    "legacy"
  ],
  "executionStage": "analysis",
  "priority": 30,
  "conditions": [
    {
      "type": "hasFailures"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "on_demand"
};
