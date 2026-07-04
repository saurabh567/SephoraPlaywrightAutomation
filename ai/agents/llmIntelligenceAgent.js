/**
 * llmIntelligenceAgent.js
 *
 * Multi-LLM Intelligence Layer agent.
 * Routes tasks to the optimal LLM provider based on task type, capability, and cost.
 * Integrates LLMProviderManager into the agent pipeline.
 */

const llmManager = require('../llm/LLMProviderManager');
const fs = require('fs-extra');
const path = require('path');

class LLMIntelligenceAgent {
  async run(input = {}) {
    console.log('[LLMIntelligenceAgent] Multi-LLM intelligence layer active');

    const taskType = input.taskType || 'report-summarization';
    const availableProviders = llmManager.getAvailableProviders();
    const stats = llmManager.getStats();
    const costReport = llmManager.getCostReport();

    const report = [
      '# LLM Intelligence Report',
      '',
      '**Generated:** ' + new Date().toISOString(),
      '',
      '## Available Providers',
      '',
      '| Provider | Model | Status |',
      '|---|---|---|',
      ...Object.entries(stats).map(([name, s]) =>
        '| ' + name + ' | ' + s.model + ' | ' + (availableProviders.includes(name) ? '✅ Configured' : '⏭ No API Key') + ' |'
      ),
      '',
      '## Task Routing',
      '',
      '| Task Type | Preferred | Fallback | Priority |',
      '|---|---|---|---|',
      ...Object.entries(require('../llm/taskRouting').TASK_ROUTES).map(([task, r]) =>
        '| ' + task + ' | ' + r.preferredProvider + ' | ' + (r.fallbackProvider || 'none') + ' | ' + r.priority + ' |'
      ),
      '',
      '## Cost Tracking',
      '',
      '| Metric | Value |',
      '|---|---|',
      '| Total Sessions | ' + costReport.sessions.length + ' |',
      '| Total Cost | $' + costReport.totalCost.toFixed(6) + ' |',
      '| Total Tokens | ' + costReport.totalTokens + ' |',
      '',
      '## Prompt Version',
      '',
      'Current version: ' + llmManager.getPromptVersion()
    ].join('\n');

    const reportPath = path.join(process.cwd(), 'reports', 'ai', 'llm-intelligence-report.md');
    fs.ensureDirSync(path.dirname(reportPath));
    fs.writeFileSync(reportPath, report, 'utf8');

    console.log('[LLMIntelligenceAgent] Report written to ' + path.relative(process.cwd(), reportPath));

    return {
      ok: true,
      availableProviders,
      stats,
      totalCost: costReport.totalCost,
      totalTokens: costReport.totalTokens,
      promptVersion: llmManager.getPromptVersion(),
      reportPath: path.relative(process.cwd(), reportPath)
    };
  }
}

module.exports = LLMIntelligenceAgent;

module.exports.metadata = {
  name: 'LLM Intelligence Agent',
  version: '1.0.0',
  description: 'Multi-LLM intelligence layer - routes tasks to optimal provider based on capability/cost with fallback, retry, rate-limit handling, and prompt versioning',
  dependencies: [],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['llm', 'intelligence', 'multi-provider'],
  executionStage: 'reporting',
  priority: 74,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['llm-intelligence'],
  lifecycle: 'active'
};
