module.exports = {
  testCaseGeneration: require('./testCaseGenerationAgent'),
  featureFileGeneration: require('./featureFileGenerationAgent'),
  stepDefinitionGeneration: require('./stepDefinitionGenerationAgent'),
  pageObjectGeneration: require('./pageObjectGenerationAgent'),
  locatorHealing: require('./locatorHealingAgent'),
  testDataGeneration: require('./testDataGenerationAgent'),
  failureAnalysis: require('./failureAnalysisAgent'),
  rootCauseAnalysis: require('./rootCauseAnalysisAgent'),
  reportSummarization: require('./reportSummarizationAgent'),
  jenkinsBuildFailureAnalysis: require('./jenkinsBuildFailureAnalysisAgent'),
  apiTestGeneration: require('./apiTestGenerationAgent'),
  playwrightCodeReview: require('./playwrightCodeReviewAgent'),
  selfHealingAutomation: require('./selfHealingAutomationAgent'),
  executionMemory: require('./executionMemoryAgent'),
  mcpHealthCheck: require('./mcpHealthCheckAgent')
};
