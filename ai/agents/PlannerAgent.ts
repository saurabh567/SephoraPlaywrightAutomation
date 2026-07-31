import fs from 'fs-extra';
import path from 'path';
import BaseAgent from './baseAgent';
// PlannerAgent - Plans workflows, task allocation, and agent orchestration sequences

const agent = new BaseAgent({
  name: 'Planner Agent',
  role: 'Analyze input requirements and generate a step-by-step execution plan for multi-agent workflows.',
  promptFile: 'test-case-generation.prompt.md',
  outputType: 'Execution plan with task allocations'
});

agent.run = async function run(input: any = {}) {
  console.log('[PlannerAgent] Generating execution plan');

  const requirement = input.requirement || (await (async () => {
    const reqPath = path.join(process.cwd(), 'ai/input/requirement.txt');
    if (fs.existsSync(reqPath)) return fs.readFileSync(reqPath, 'utf8');
    return 'No input requirement provided';
  })());

  const framework = await (async () => {
    try {
      const scanner = require('../tools/frameworkScanner');
      return scanner.scanFramework().summary;
    } catch (e: any) {
      return { framework: 'Playwright + Cucumber' };
    }
  })();

  const availableAgents = [
    'TestCaseGenerationAgent', 'FeatureFileGenerationAgent', 'StepDefinitionGenerationAgent',
    'PageObjectGenerationAgent', 'ApiTestGenerationAgent', 'MobileTestGenerationAgent',
    'TestExecutionAgent', 'FailureAnalysisAgent', 'RootCauseAnalysisAgent',
    'LocatorHealingAgent', 'PlaywrightCodeReviewAgent', 'ImpactAnalysisAgent',
    'ReleaseGateAgent', 'MonitoringAgent', 'ReportSummarizationAgent'
  ];

  const plan = {
    generatedAt: new Date().toISOString(),
    requirement: requirement.slice(0, 500),
    framework: framework,
    plan: [
      { step: 1, agent: 'TestCaseGenerationAgent', task: 'Generate test scenarios from requirements', dependsOn: [] as any[] },
      { step: 2, agent: 'FeatureFileGenerationAgent', task: 'Generate Gherkin feature files', dependsOn: [1] },
      { step: 3, agent: 'StepDefinitionGenerationAgent', task: 'Generate step definitions for new features', dependsOn: [2] },
      { step: 4, agent: 'PageObjectGenerationAgent', task: 'Generate page objects for new pages', dependsOn: [2] },
      { step: 5, agent: 'TestExecutionAgent', task: 'Execute tests across configured platforms', dependsOn: [3, 4] },
      { step: 6, agent: 'FailureAnalysisAgent', task: 'Analyze any test failures', dependsOn: [5] },
      { step: 7, agent: 'RootCauseAnalysisAgent', task: 'Determine root causes of failures', dependsOn: [6] },
      { step: 8, agent: 'LocatorHealingAgent', task: 'Suggest locator fixes for locator failures', dependsOn: [6] },
      { step: 9, agent: 'ImpactAnalysisAgent', task: 'Analyze impact of changes on test suite', dependsOn: [5] },
      { step: 10, agent: 'PlaywrightCodeReviewAgent', task: 'Review automation code quality', dependsOn: [] as any[] },
      { step: 11, agent: 'ReportSummarizationAgent', task: 'Generate execution summary report', dependsOn: [5, 6, 7, 8, 9] },
      { step: 12, agent: 'ReleaseGateAgent', task: 'Evaluate release readiness', dependsOn: [11] },
      { step: 13, agent: 'MonitoringAgent', task: 'Update monitoring with execution results', dependsOn: [11] }
    ],
    parallelizableGroups: [
      { group: 1, steps: [1, 10] },
      { group: 2, steps: [2] },
      { group: 3, steps: [3, 4] },
      { group: 4, steps: [5] },
      { group: 5, steps: [6, 9] },
      { group: 6, steps: [7, 8] },
      { group: 7, steps: [11] },
      { group: 8, steps: [12, 13] }
    ],
    estimatedDuration: '~15-20 minutes'
  };

  const outPath = path.join(process.cwd(), 'reports', 'ai', 'execution-plan.json');
  fs.ensureDirSync(path.dirname(outPath));
  fs.writeJsonSync(outPath, plan, { spaces: 2 });

  console.log('[PlannerAgent] Plan generated with', plan.plan.length, 'steps');

  return {
    ok: true,
    report: path.relative(process.cwd(), outPath),
    plan: plan
  };
};

export default agent;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Planner Agent",
  "version": "1.0.0",
  "description": "Generates step-by-step execution plans for multi-agent workflows",
  "dependencies": [] as any[],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "planning",
    "orchestration"
  ],
  "executionStage": "preflight",
  "priority": 70,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
