/**
 * ai/agents/index.ts
 *
 * Central export for all AI agents.
 * Every agent is re-exported under its registered key so that
 * AgentRegistry, orchestrators, and CLI tools can resolve agents by name.
 */

// Generation agents
import testCaseGeneration from './testCaseGenerationAgent';
export { testCaseGeneration };
import featureFileGeneration from './featureFileGenerationAgent';
export { featureFileGeneration };
import stepDefinitionGeneration from './stepDefinitionGenerationAgent';
export { stepDefinitionGeneration };
import pageObjectGeneration from './pageObjectGenerationAgent';
export { pageObjectGeneration };
import apiTestGeneration from './apiTestGenerationAgent';
export { apiTestGeneration };
import mobileTestGeneration from './MobileTestGenerationAgent';
export { mobileTestGeneration };

// Analysis agents
import failureAnalysis from './failureAnalysisAgent';
export { failureAnalysis };
import playwrightCodeReview from './playwrightCodeReviewAgent';
export { playwrightCodeReview };
import reportSummarization from './reportSummarizationAgent';
export { reportSummarization };

// Anomaly detection agents
import anomalyDetection from './AnomalyDetectionAgent';
export { anomalyDetection };

// Healing agents
import locatorHealing from './locatorHealingAgent';
export { locatorHealing };
import selfHealingAutomation from './selfHealingAutomationAgent';
export { selfHealingAutomation };

// Pipeline agents
import selfHealingPipeline from './SelfHealingPipelineAgent';
export { selfHealingPipeline };

// Data agents
import testDataGeneration from './testDataGenerationAgent';
export { testDataGeneration };
import testDataPipeline from './TestDataPipelineAgent';
export { testDataPipeline };

// Documentation agents
import documentationGenerator from './DocumentationGeneratorAgent';
export { documentationGenerator };

// Secrets vault
import secretsVault from './SecretsVaultAgent';
export { secretsVault };

// CI/CD agents
import jenkinsBuildFailureAnalysis from './jenkinsBuildFailureAnalysisAgent';
export { jenkinsBuildFailureAnalysis };
import jenkins from './JenkinsAgent';
export { jenkins };

// Execution agents
import executionMemory from './executionMemoryAgent';
export { executionMemory };
import execution from './ExecutionAgent';
export { execution };
import testExecution from './TestExecutionAgent';
export { testExecution };

// Orchestration agents
import planner from './PlannerAgent';
export { planner };
import decision from './DecisionAgent';
export { decision };
import retry from './RetryAgent';
export { retry };
import healing from './HealingAgent';
export { healing };
import rca from './RCAAgent';
export { rca };
import unifiedOrchestrator from './UnifiedMCPOrchestratorAgent';
export { unifiedOrchestrator };

// Readiness agents
import ecosystemReadiness from './EcosystemReadinessAgent';
export { ecosystemReadiness };

// Reporting agents
import report from './ReportAgent';
export { report };
import pr from './PRAgent';
export { pr };
import prPreparation from './prPreparationAgent';
export { prPreparation };

// Dashboard agents
import aiDashboard from './AIDashboardAgent';
export { aiDashboard };

// Selection agents
import smartTestSelector from './SmartTestSelectorAgent';
export { smartTestSelector };

// Platform agents
import api from './APIAgent';
export { api };
import mobile from './MobileAgent';
export { mobile };
import mobileDeviceFarm from './MobileDeviceFarmAgent';
export { mobileDeviceFarm };

// Cross-cutting agents
import visual from './VisualAgent';
export { visual };
import impact from './ImpactAgent';
export { impact };
import release from './ReleaseGateAgent';
export { release };
import monitoring from './MonitoringAgent';
export { monitoring };

// Infrastructure
import mcpHealthCheck from './mcpHealthCheckAgent';
export { mcpHealthCheck };

export default {
  testCaseGeneration, featureFileGeneration, stepDefinitionGeneration, pageObjectGeneration,
  apiTestGeneration, mobileTestGeneration, failureAnalysis, playwrightCodeReview,
  reportSummarization, anomalyDetection, locatorHealing, selfHealingAutomation,
  selfHealingPipeline, testDataGeneration, testDataPipeline, documentationGenerator,
  secretsVault, jenkinsBuildFailureAnalysis, jenkins, executionMemory, execution,
  testExecution, planner, decision, retry, healing, rca, unifiedOrchestrator,
  ecosystemReadiness, report, pr, prPreparation, aiDashboard, smartTestSelector,
  api, mobile, mobileDeviceFarm, visual, impact, release, monitoring, mcpHealthCheck
};
