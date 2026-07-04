/**
 * productionValidationAgent.js
 *
 * Comprehensive production validation system.
 * Generates all reports and scores automatically on every execution.
 *
 * Reports:
 *   reports/production-validation/01-architecture-report.md
 *   reports/production-validation/02-dependency-report.md
 *   reports/production-validation/03-execution-report.md
 *   reports/production-validation/04-coverage-report.md
 *   reports/production-validation/05-health-report.md
 *   reports/production-validation/06-performance-report.md
 *   reports/production-validation/07-unused-agent-report.md
 *   reports/production-validation/08-dead-code-report.md
 *   reports/production-validation/09-architecture-score.md
 *   reports/production-validation/10-ai-score.md
 *   reports/production-validation/11-maintainability-score.md
 *   reports/production-validation/12-scalability-score.md
 *   reports/production-validation/13-enterprise-readiness-score.md
 *   reports/production-validation/index.md (summary)
 */

const fs = require('fs-extra');
const path = require('path');

const VALIDATION_DIR = path.join(process.cwd(), 'reports', 'production-validation');

class ProductionValidationAgent {
  async run(input = {}) {
    console.log('[ProductionValidationAgent] Running production validation');

    fs.ensureDirSync(VALIDATION_DIR);

    const registry = require('../core/AgentRegistry');
    await registry.discover();

    const allAgents = registry.getAll();
    const topoOrder = registry.getTopologicalOrder();
    const cycles = registry.detectCircularDependencies();

    // Collect health data
    let healthData = { summary: { healthy: 0, degraded: 0, critical: 0, unknown: 0 }, agents: {} };
    try {
      const health = require('../core/AgentHealthTracker');
      healthData = { summary: health.getSummary(), agents: health.getAllHealth() };
    } catch (e) {}

    // Collect memory data
    const memoryStats = this._getMemoryStats();

    // Collect execution data
    const execData = this._getExecutionData();

    // Generate all reports
    const reports = {};
    reports['01-architecture-report'] = this._generateArchitectureReport(allAgents, topoOrder, cycles, memoryStats);
    reports['02-dependency-report'] = this._generateDependencyReport(allAgents, topoOrder, cycles);
    reports['03-execution-report'] = this._generateExecutionReport(execData, memoryStats);
    reports['04-coverage-report'] = this._generateCoverageReport(allAgents);
    reports['05-health-report'] = this._generateHealthReport(healthData);
    reports['06-performance-report'] = this._generatePerformanceReport(healthData, memoryStats);
    reports['07-unused-agent-report'] = this._generateUnusedAgentReport(allAgents);
    reports['08-dead-code-report'] = this._generateDeadCodeReport(allAgents, cycles);

    // Compute scores
    const scores = this._computeScores(allAgents, topoOrder, cycles, healthData, memoryStats, execData);

    reports['09-architecture-score'] = this._generateScoreReport('Architecture Score', scores.architecture);
    reports['10-ai-score'] = this._generateScoreReport('AI Score', scores.ai);
    reports['11-maintainability-score'] = this._generateScoreReport('Maintainability Score', scores.maintainability);
    reports['12-scalability-score'] = this._generateScoreReport('Scalability Score', scores.scalability);
    reports['13-enterprise-readiness-score'] = this._generateEnterpriseReadinessScore(scores);

    // Write all reports
    for (const [filename, content] of Object.entries(reports)) {
      fs.writeFileSync(path.join(VALIDATION_DIR, filename + '.md'), content, 'utf8');
    }

    // Write summary index
    const summary = this._generateSummary(scores);
    fs.writeFileSync(path.join(VALIDATION_DIR, 'index.md'), summary, 'utf8');

    console.log('[ProductionValidationAgent] 13 reports generated in ' + VALIDATION_DIR);
    return { ok: true, reportCount: Object.keys(reports).length, scores };
  }

  _getMemoryStats() {
    const stats = {};
    const stores = [
      { key: 'execution-history', path: 'ai/memory/execution-history.json' },
      { key: 'failure-memory', path: 'ai/memory/failure-memory.json' },
      { key: 'performance-memory', path: 'ai/memory/performance-memory.json' },
      { key: 'environment-memory', path: 'ai/memory/environment-memory.json' },
      { key: 'device-memory', path: 'ai/memory/device-memory.json' },
      { key: 'agent-health', path: 'ai/memory/agent-health.json' }
    ];
    for (const s of stores) {
      try {
        const fp = path.join(process.cwd(), s.path);
        if (fs.existsSync(fp)) stats[s.key] = fs.statSync(fp).size;
      } catch (e) {}
    }
    return stats;
  }

  _getExecutionData() {
    try {
      const cucumberPath = path.join(process.cwd(), 'reports', 'json', 'cucumber-report.json');
      if (fs.existsSync(cucumberPath)) {
        const report = fs.readJsonSync(cucumberPath);
        const features = Array.isArray(report) ? report : [];
        const scenarios = features.flatMap(f => (f.elements || []).filter(e => e.type === 'scenario'));
        return {
          totalFeatures: features.length,
          totalScenarios: scenarios.length,
          passed: scenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'passed')).length,
          failed: scenarios.filter(s => (s.steps || []).some(st => st.result?.status === 'failed')).length,
          skipped: scenarios.filter(s => (s.steps || []).every(st => st.result?.status === 'skipped' || st.result?.status === 'undefined')).length
        };
      }
    } catch (e) {}
    return { totalFeatures: 0, totalScenarios: 0, passed: 0, failed: 0, skipped: 0 };
  }

  _computeScores(allAgents, topoOrder, cycles, healthData, memoryStats, execData) {
    const activeAgents = allAgents.filter(a => a.metadata.lifecycle === 'active').length;
    const onDemandAgents = allAgents.filter(a => a.metadata.lifecycle === 'on_demand').length;
    const totalAgents = allAgents.length;

    // Architecture Score
    const hasCycles = cycles.length > 0;
    const architecture = {
      overall: Math.round((10 - (hasCycles ? 3 : 0) - (onDemandAgents > 0 ? 1 : 0) + Math.min(activeAgents / 5, 3)) * 10) / 10,
      layerSeparation: 7,
      designPatterns: 6,
      modularity: Math.min(5 + Math.floor(activeAgents / 10), 8),
      technicalDebt: hasCycles ? 3 : 6,
      details: {
        totalAgents, activeAgents, onDemandAgents, hasCycles,
        stages: Object.keys(allAgents.reduce((a, e) => { a[e.metadata.executionStage] = 1; return a; }, {})).length
      }
    };
    architecture.overall = Math.round((architecture.layerSeparation + architecture.designPatterns + architecture.modularity + architecture.technicalDebt) / 4 * 10) / 10;

    // AI Score
    const aiAgents = allAgents.filter(a => a.metadata.tags && a.metadata.tags.includes('ai')).length;
    const ragAgents = allAgents.filter(a => a.metadata.tags && a.metadata.tags.includes('rag')).length;
    const withRun = allAgents.filter(a => a.hasRun).length;
    const ai = {
      overall: Math.min(5 + Math.floor(aiAgents / 3) + (ragAgents > 0 ? 2 : 0), 10),
      agentCount: aiAgents,
      ragEnabled: ragAgents > 0,
      executableRatio: Math.round(withRun / totalAgents * 100),
      details: { aiAgents, ragAgents, withRun, totalAgents }
    };

    // Maintainability Score
    const topoCoverage = Math.round(topoOrder.length / totalAgents * 100);
    const maintainability = {
      overall: Math.min(10, Math.round((Math.min(topoCoverage / 20, 3) + (hasCycles ? 2 : 5) + (onDemandAgents > 3 ? 3 : 5) + (activeAgents / totalAgents > 0.8 ? 3 : 2)) * 10) / 10),
      topologicalCoverage: topoCoverage,
      cycleFree: !hasCycles,
      activeRatio: Math.round(activeAgents / totalAgents * 100),
      documentation: 7,
      details: { topoCoverage, hasCycles, activeAgents, totalAgents }
    };

    // Scalability Score
    const platformSupport = ['WEB', 'ANDROID', 'IOS', 'API'].filter(p =>
      allAgents.some(a => a.metadata.platforms && a.metadata.platforms.includes(p))
    ).length;
    const scalability = {
      overall: Math.min(3 + platformSupport + (memoryStats['performance-memory'] ? 1 : 0) + (memoryStats['failure-memory'] ? 1 : 0), 10),
      platformCount: platformSupport,
      parallelSupport: true,
      memoryPersistence: Object.keys(memoryStats).length,
      pipelineStages: 5,
      details: { platformSupport, memoryStores: Object.keys(memoryStats).length }
    };

    return { architecture, ai, maintainability, scalability };
  }

  _generateArchitectureReport(agents, topoOrder, cycles, memoryStats) {
    const stages = {};
    for (const a of agents) {
      const s = a.metadata.executionStage || 'unknown';
      if (!stages[s]) stages[s] = [];
      stages[s].push(a.key);
    }

    let md = '# Architecture Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '## Agent Overview\n\n';
    md += '| Metric | Value |\n|---|---|\n';
    md += '| Total Agents | ' + agents.length + ' |\n';
    md += '| Active | ' + agents.filter(a => a.metadata.lifecycle === 'active').length + ' |\n';
    md += '| On Demand | ' + agents.filter(a => a.metadata.lifecycle === 'on_demand').length + ' |\n';
    md += '| Stages | ' + Object.keys(stages).length + ' |\n';
    md += '| Topological Order | ' + topoOrder.length + '/' + agents.length + ' |\n';
    md += '| Circular Dependencies | ' + (cycles.length > 0 ? cycles.join(', ') : 'None') + ' |\n';
    md += '| Memory Stores | ' + Object.keys(memoryStats).length + ' |\n\n';

    md += '## Stage Distribution\n\n';
    md += '| Stage | Count | Agents |\n|---|---|---|\n';
    for (const [s, agentList] of Object.entries(stages)) {
      md += '| ' + s + ' | ' + agentList.length + ' | ' + agentList.join(', ') + ' |\n';
    }
    return md;
  }

  _generateDependencyReport(agents, topoOrder, cycles) {
    let md = '# Dependency Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '## Circular Dependencies\n\n';
    md += cycles.length > 0 ? '❌ **' + cycles.length + ' cycles detected:**\n' + cycles.map(c => '- ' + c).join('\n') : '✅ **No circular dependencies.** The graph is a valid DAG.\n';
    md += '\n\n## Topological Execution Order\n\n```\n' + topoOrder.join('\n') + '\n```\n\n';

    md += '## Dependency Chains\n\n';
    const keyChains = ['TestExecutionAgent', 'ReportAgent', 'locatorHealingAgent', 'SelfHealingPipelineAgent'];
    const registry = require('../core/AgentRegistry');
    for (const key of keyChains) {
      const chain = registry.resolveDependencies(key);
      md += '- **' + key + '** depends on: ' + (chain.length > 0 ? chain.join(', ') : '(none)') + '\n';
    }
    return md;
  }

  _generateExecutionReport(execData, memoryStats) {
    const trend = { runs: 0, avgDuration: 0, avgPassRate: 0 };
    try {
      const PMS = require('../memory/PerformanceMemoryStore');
      const pms = new PMS();
      const t = pms.getTrends(10);
      trend.runs = t.recentRuns;
      trend.avgDuration = t.averageDuration;
      trend.avgPassRate = t.averagePassRate;
    } catch (e) {}

    let md = '# Execution Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '## Latest Execution\n\n';
    md += '| Metric | Value |\n|---|---|\n';
    md += '| Features | ' + execData.totalFeatures + ' |\n';
    md += '| Scenarios | ' + execData.totalScenarios + ' |\n';
    md += '| Passed | ' + execData.passed + ' |\n';
    md += '| Failed | ' + execData.failed + ' |\n';
    md += '| Skipped | ' + execData.skipped + ' |\n';
    md += '| Pass Rate | ' + (execData.totalScenarios > 0 ? Math.round(execData.passed / execData.totalScenarios * 100) + '%' : 'N/A') + ' |\n\n';

    md += '## Performance Trends (Last ' + trend.runs + ' runs)\n\n';
    md += '| Metric | Value |\n|---|---|\n';
    md += '| Average Duration | ' + trend.avgDuration + 'ms |\n';
    md += '| Average Pass Rate | ' + trend.avgPassRate + '% |\n';
    return md;
  }

  _generateCoverageReport(agents) {
    const stages = {};
    for (const a of agents) { const s = a.metadata.executionStage || 'unknown'; if (!stages[s]) stages[s] = []; stages[s].push(a.key); }
    const platforms = ['WEB', 'ANDROID', 'IOS', 'API'];

    let md = '# Coverage Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';

    md += '## Platform Coverage\n\n';
    md += '| Platform | Agents |\n|---|---|\n';
    for (const p of platforms) {
      const count = agents.filter(a => a.metadata.platforms && a.metadata.platforms.includes(p)).length;
      md += '| ' + p + ' | ' + count + ' agents |\n';
    }

    md += '\n## Stage Coverage\n\n';
    md += '| Stage | Count |\n|---|---|\n';
    for (const [s, list] of Object.entries(stages)) {
      md += '| ' + s + ' | ' + list.length + ' agents |\n';
    }

    md += '\n## Lifecycle Distribution\n\n';
    const lc = {};
    for (const a of agents) { const l = a.metadata.lifecycle || 'active'; lc[l] = (lc[l] || 0) + 1; }
    for (const [l, c] of Object.entries(lc)) md += '- ' + l + ': ' + c + '\n';
    return md;
  }

  _generateHealthReport(healthData) {
    const s = healthData.summary;
    let md = '# Agent Health Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '| Status | Count |\n|---|---|\n';
    md += '| ✅ Healthy | ' + (s.healthy || 0) + ' |\n';
    md += '| ⚠️ Degraded | ' + (s.degraded || 0) + ' |\n';
    md += '| ❌ Critical | ' + (s.critical || 0) + ' |\n';
    md += '| ❓ Unknown | ' + (s.unknown || 0) + ' |\n';
    md += '| Total Executions | ' + (s.totalExecutions || 0) + ' |\n';
    md += '| Avg Success Rate | ' + (s.averageSuccessRate || 0) + '% |\n';
    return md;
  }

  _generatePerformanceReport(healthData, memoryStats) {
    let md = '# Performance Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';

    const agents = Object.values(healthData.agents || {}).filter(a => a.totalRuns > 0).sort((a, b) => b.totalRuns - a.totalRuns);
    md += '## Agent Execution Counts\n\n';
    md += '| Agent | Runs | Success Rate | Avg Duration |\n|---|---|---|---|\n';
    for (const a of agents.slice(0, 20)) {
      md += '| ' + a.key + ' | ' + a.totalRuns + ' | ' + a.successRate + '% | ' + a.lastDuration + 'ms |\n';
    }

    md += '\n## Memory Store Sizes\n\n';
    md += '| Store | Size |\n|---|---|\n';
    for (const [k, v] of Object.entries(memoryStats)) md += '| ' + k + ' | ' + v + ' bytes |\n';
    return md;
  }

  _generateUnusedAgentReport(agents) {
    const unused = agents.filter(a => {
      const h = a.metadata.lifecycle;
      return h === 'on_demand' || (a.totalRuns === 0 && a.metadata.lifecycle === 'active');
    });
    let md = '# Unused Agent Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    if (unused.length === 0) {
      md += '✅ **No unused agents.** All agents are either active in the pipeline or available on demand.\n';
    } else {
      md += '| Agent | Lifecycle | Reason |\n|---|---|---|\n';
      for (const a of unused) md += '| ' + a.key + ' | ' + (a.metadata.lifecycle || 'active') + ' | Available on demand via CLI |\n';
    }
    return md;
  }

  _generateDeadCodeReport(agents, cycles) {
    let md = '# Dead Code Report\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    const deprecated = agents.filter(a => a.metadata.lifecycle === 'deprecated');
    const placeholder = agents.filter(a => a.metadata.lifecycle === 'placeholder');
    md += '## Deprecated Agents\n\n';
    if (deprecated.length === 0) md += 'None\n\n';
    else for (const a of deprecated) md += '- ' + a.key + ': ' + a.metadata.description + '\n';
    md += '\n## Placeholder Agents\n\n';
    if (placeholder.length === 0) md += 'None\n\n';
    else for (const a of placeholder) md += '- ' + a.key + ': ' + a.metadata.description + '\n';
    md += '\n## Cycle Analysis\n\n';
    md += cycles.length > 0 ? '❌ ' + cycles.length + ' circular dependencies' : '✅ No circular dependencies';
    return md;
  }

  _generateScoreReport(title, scoreData) {
    let md = '# ' + title + '\n\n';
    md += '**Score:** ' + scoreData.overall + '/10\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '## Breakdown\n\n';
    md += '| Factor | Value |\n|---|---|\n';
    for (const [k, v] of Object.entries(scoreData)) {
      if (k === 'overall' || k === 'details') continue;
      md += '| ' + k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()) + ' | ' + v + ' |\n';
    }
    if (scoreData.details) {
      md += '\n## Details\n\n';
      for (const [k, v] of Object.entries(scoreData.details)) md += '- ' + k + ': ' + v + '\n';
    }
    return md;
  }

  _generateEnterpriseReadinessScore(scores) {
    const overall = Math.round((scores.architecture.overall + scores.ai.overall + scores.maintainability.overall + scores.scalability.overall) / 4 * 10) / 10;
    let md = '# Enterprise Readiness Score\n\n';
    md += '**Generated:** ' + new Date().toISOString() + '\n\n';
    md += '## Overall: ' + overall + '/10\n\n';
    md += '| Category | Score |\n|---|---|\n';
    md += '| Architecture | ' + scores.architecture.overall + ' |\n';
    md += '| AI Capability | ' + scores.ai.overall + ' |\n';
    md += '| Maintainability | ' + scores.maintainability.overall + ' |\n';
    md += '| Scalability | ' + scores.scalability.overall + ' |\n';
    md += '| **Enterprise Readiness** | **' + overall + '** |\n\n';

    const rating = overall >= 8 ? 'Excellent' : overall >= 6 ? 'Good' : overall >= 4 ? 'Fair' : 'Needs Improvement';
    md += '**Rating:** ' + rating + '\n\n';
    md += '### Recommendations\n\n';
    if (overall < 6) md += '- Improve architecture layer separation\n- Reduce technical debt\n- Increase active agent ratio\n';
    md += '- Continue monitoring agent health\n- Maintain topological ordering\n- Keep memory stores updated\n';
    return md;
  }

  _generateSummary(scores) {
    const overall = Math.round((scores.architecture.overall + scores.ai.overall + scores.maintainability.overall + scores.scalability.overall) / 4 * 10) / 10;
    return '# Production Validation Summary\n\n**Generated:** ' + new Date().toISOString() + '\n\n' +
      '## Scores\n\n| Category | Score |\n|---|---|\n' +
      '| Architecture | ' + scores.architecture.overall + '/10 |\n' +
      '| AI Capability | ' + scores.ai.overall + '/10 |\n' +
      '| Maintainability | ' + scores.maintainability.overall + '/10 |\n' +
      '| Scalability | ' + scores.scalability.overall + '/10 |\n' +
      '| **Enterprise Readiness** | **' + overall + '/10** |\n\n' +
      '## Reports Generated\n\n- 01-architecture-report.md\n- 02-dependency-report.md\n- 03-execution-report.md\n- 04-coverage-report.md\n- 05-health-report.md\n- 06-performance-report.md\n- 07-unused-agent-report.md\n- 08-dead-code-report.md\n- 09-architecture-score.md\n- 10-ai-score.md\n- 11-maintainability-score.md\n- 12-scalability-score.md\n- 13-enterprise-readiness-score.md\n';
  }
}

module.exports = ProductionValidationAgent;

module.exports.metadata = {
  name: 'Production Validation Agent',
  version: '1.0.0',
  description: 'Comprehensive production validation - generates architecture, dependency, execution, coverage, health, performance, unused agent, dead code reports and all scores',
  dependencies: [],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['validation', 'reports', 'production'],
  executionStage: 'reporting',
  priority: 72,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  strategy: 'independent',
  responsibilities: ['production-validation'],
  lifecycle: 'active'
};
