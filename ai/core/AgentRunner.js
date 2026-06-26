// Central runner for executing one agent, all generation agents, or post-test AI analysis.
const fs = require('fs-extra');
const path = require('path');

const agents = {
  TestExecutionAgent: require('../agents/TestExecutionAgent'),
  TestCaseGenerationAgent: require('../agents/testCaseGenerationAgent'),
  FeatureFileGenerationAgent: require('../agents/featureFileGenerationAgent'),
  StepDefinitionGenerationAgent: require('../agents/stepDefinitionGenerationAgent'),
  PageObjectGenerationAgent: require('../agents/pageObjectGenerationAgent'),
  JenkinsBuildFailureAnalysisAgent: require('../agents/jenkinsBuildFailureAnalysisAgent'),
  PlaywrightCodeReviewAgent: require('../agents/playwrightCodeReviewAgent'),
  SelfHealingAutomationAgent: require('../agents/selfHealingAutomationAgent'),
  ApiAnalysisAgent: require('../agents/apiAnalysisAgent')
};

class AgentRunner {
  constructor() {
    this.agentMap = agents;
  }

  createAgent(agentName) {
    const AgentClass = this.agentMap[agentName];
    if (!AgentClass) {
      throw new Error(`Unknown agent: ${agentName}. Available agents: ${Object.keys(this.agentMap).join(', ')}`);
    }
    return new AgentClass();
  }

  async runAgent(agentName) {
    return this.createAgent(agentName).run();
  }

  async runAll() {
    const order = [
      'TestCaseGenerationAgent',
      'FeatureFileGenerationAgent',
      'StepDefinitionGenerationAgent',
      'PageObjectGenerationAgent',
      'JenkinsBuildFailureAnalysisAgent',
      'PlaywrightCodeReviewAgent',
      'SelfHealingAutomationAgent'
    ];

    const results = [];
    for (const agentName of order) {
      results.push(await this.runAgent(agentName));
    }
    this.writeMemory('ai-all-run', results);
    return results;
  }

  async runPostTestAnalysis() {
    const workflow = require('../workflows/runPostExecutionAgents');
    const result = await workflow.run();
    this.writeMemory('post-test-rag-analysis', [result]);
    return result;
  }

  writePostTestSummary(results) {
    const outputPath = path.join(process.cwd(), 'ai/output/ai-post-test-summary.md');
    const content = [
      '# AI Post Test Summary',
      '',
      `Executed At: ${new Date().toISOString()}`,
      '',
      '| Agent | Output | Status |',
      '|---|---|---|',
      ...results.map((result) => `| ${result.agent} | ${result.outputPath || ''} | ${result.error ? 'failed' : 'completed'} |`)
    ].join('\n');

    fs.ensureDirSync(path.dirname(outputPath));
    fs.writeFileSync(outputPath, content);
  }

  writeMemory(runType, results) {
    const memoryPath = path.join(process.cwd(), 'ai/memory/agent-run-history.json');
    fs.ensureDirSync(path.dirname(memoryPath));
    const history = fs.existsSync(memoryPath) ? fs.readJsonSync(memoryPath) : [];
    history.push({
      runType,
      executedAt: new Date().toISOString(),
      results
    });
    fs.writeJsonSync(memoryPath, history, { spaces: 2 });
  }
}

module.exports = AgentRunner;
