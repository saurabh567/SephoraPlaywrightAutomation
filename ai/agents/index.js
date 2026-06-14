module.exports = {
  // Generation agents
  testCaseGeneration: require('./testCaseGenerationAgent'),
  featureFileGeneration: require('./featureFileGenerationAgent'),
  stepDefinitionGeneration: require('./stepDefinitionGenerationAgent'),
  pageObjectGeneration: require('./pageObjectGenerationAgent'),
  apiTestGeneration: require('./apiTestGenerationAgent'),
  mobileTestGeneration: require('./MobileTestGenerationAgent'),

  // Analysis agents
  failureAnalysis: require('./failureAnalysisAgent'),
  rootCauseAnalysis: require('./rootCauseAnalysisAgent'),
  playwrightCodeReview: require('./playwrightCodeReviewAgent'),
  reportSummarization: require('./reportSummarizationAgent'),

  // Anomaly detection agents
  anomalyDetection: require('./AnomalyDetectionAgent'),

  // Healing agents
  locatorHealing: require('./locatorHealingAgent'),
  selfHealingAutomation: require('./selfHealingAutomationAgent'),

  // Pipeline agents
  selfHealingPipeline: require('./SelfHealingPipelineAgent'),

  // Data agents
  testDataGeneration: require('./testDataGenerationAgent'),
  testDataPipeline: require('./TestDataPipelineAgent'),

  // Documentation agents
  documentationGenerator: require('./DocumentationGeneratorAgent'),

  // Secrets vault
  secretsVault: require('./SecretsVaultAgent'),

  // CI/CD agents
  jenkinsBuildFailureAnalysis: require('./jenkinsBuildFailureAnalysisAgent'),
  jenkins: require('./JenkinsAgent'),

  // Execution agents
  executionMemory: require('./executionMemoryAgent'),
  execution: require('./ExecutionAgent'),
  testExecution: require('./TestExecutionAgent'),

  // Orchestration agents
  planner: require('./PlannerAgent'),
  decision: require('./DecisionAgent'),
  retry: require('./RetryAgent'),
  healing: require('./HealingAgent'),
  rca: require('./RCAAgent'),
  unifiedOrchestrator: require('./UnifiedMCPOrchestratorAgent'),

  // Readiness agents
  ecosystemReadiness: require('./EcosystemReadinessAgent'),

  // Reporting agents
  report: require('./ReportAgent'),
  pr: require('./PRAgent'),
  prPreparation: require('./prPreparationAgent'),

  // Dashboard agents
  aiDashboard: require('./AIDashboardAgent'),

  // Smart test selection
  smartTestSelector: require('./SmartTestSelectorAgent'),

  // Platform agents
  api: require('./APIAgent'),
  mobile: require('./MobileAgent'),

  // Device farm agents
  mobileDeviceFarm: require('./MobileDeviceFarmAgent'),

  // Quality agents
  visual: require('./VisualAgent'),
  impact: require('./ImpactAgent'),

  // Release agents
  release: require('./ReleaseGateAgent'),
  monitoring: require('./MonitoringAgent'),

  // Infrastructure
  mcpHealthCheck: require('./mcpHealthCheckAgent')
};
