// UnifiedMCPOrchestratorAgent - Phase 12
// Ties together all Phase 1-11 agents into a single orchestration framework.
// Manages cross-agent workflows, dependency resolution, knowledge base indexing,
// and CI/CD integration status reporting.
const fs = require('fs-extra');
const path = require('path');

const ORCHESTRATOR_STATE_PATH = path.join(process.cwd(), 'ai/memory/orchestrator-state.json');
const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), 'ai/knowledge-base');
const REPORTS_AI_DIR = path.join(process.cwd(), 'reports', 'ai');
const AI_AGENTS_DIR = path.join(process.cwd(), 'ai', 'agents');

function ensureDirs() {
  fs.ensureDirSync(path.dirname(ORCHESTRATOR_STATE_PATH));
  fs.ensureDirSync(KNOWLEDGE_BASE_DIR);
  fs.ensureDirSync(REPORTS_AI_DIR);
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(ORCHESTRATOR_STATE_PATH)) {
    fs.writeJsonSync(ORCHESTRATOR_STATE_PATH, { runs: [], currentRun: null }, { spaces: 2 });
  }
  return fs.readJsonSync(ORCHESTRATOR_STATE_PATH);
}

function saveState(state) {
  fs.writeJsonSync(ORCHESTRATOR_STATE_PATH, state, { spaces: 2 });
}

function timestamp() {
  return new Date().toISOString();
}

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readJsonSync(filePath);
  } catch { /* ignore */ }
  return null;
}

function fileSizeKB(filePath) {
  try {
    if (fs.existsSync(filePath)) return (fs.statSync(filePath).size / 1024).toFixed(1) + ' KB';
  } catch { /* ignore */ }
  return '0 KB';
}

// ---------- Phase Definitions ----------
var PHASE_DEFINITIONS = [
  { phase: 1, name: 'Foundation & Base Agents', agents: ['baseAgent.js'], keyArtifacts: ['ai/core/BaseAgent.js', 'ai/core/AgentRunner.js', 'ai/agents/index.js'] },
  { phase: 2, name: 'Test Generation Pipeline', agents: ['testCaseGenerationAgent.js', 'featureFileGenerationAgent.js', 'stepDefinitionGenerationAgent.js', 'pageObjectGenerationAgent.js', 'apiTestGenerationAgent.js'], keyArtifacts: ['ai/prompts/*.prompt.md', 'features/*.feature', 'step-definitions/*.js'] },
  { phase: 3, name: 'AI Analysis & RCA', agents: ['failureAnalysisAgent.js', 'rootCauseAnalysisAgent.js', 'playwrightCodeReviewAgent.js', 'reportSummarizationAgent.js'], keyArtifacts: ['reports/ai/failure-analysis.md', 'reports/ai/root-cause.md'] },
  { phase: 4, name: 'Locator Self-Healing', agents: ['locatorHealingAgent.js', 'selfHealingAutomationAgent.js'], keyArtifacts: ['ai/agents/locator-healing/', 'reports/ai/locator-healing-report.md'] },
  { phase: 5, name: 'Advanced Self-Healing', agents: ['LocatorApplyManager.js', 'locatorHealingApplier.js'], keyArtifacts: ['ai/memory/locator-history/'] },
  { phase: 6, name: 'Multi-Agent Execution', agents: ['ExecutionAgent.js', 'TestExecutionAgent.js', 'PlannerAgent.js', 'DecisionAgent.js', 'RetryAgent.js', 'HealingAgent.js', 'RCAAgent.js'], keyArtifacts: ['ai/orchestrator/orchestrator.js', 'ai/orchestrator/multiAgentOrchestrator.js'] },
  { phase: 7, name: 'Mobile Test Generation', agents: ['MobileTestGenerationAgent.js'], keyArtifacts: ['ai/generated-features/mobile/'] },
  { phase: 8, name: 'Device Farm', agents: ['MobileDeviceFarmAgent.js'], keyArtifacts: ['reports/mobile/device-farm/', 'ai/memory/device-farm-state.json'] },
  { phase: 9, name: 'Self-Healing Pipeline', agents: ['SelfHealingPipelineAgent.js'], keyArtifacts: ['reports/pipeline/', 'ai/memory/pipeline-state.json'] },
  { phase: 10, name: 'AI Dashboard', agents: ['AIDashboardAgent.js'], keyArtifacts: ['reports/ai/dashboard/'] },
  { phase: 11, name: 'Test Data Pipeline', agents: ['TestDataPipelineAgent.js'], keyArtifacts: ['test-data/generated/'] },
  { phase: 12, name: 'Unified MCP Orchestrator', agents: ['UnifiedMCPOrchestratorAgent.js'], keyArtifacts: ['ai/memory/orchestrator-state.json', 'ai/knowledge-base/'] },
];

// ---------- Orchestrator Agent ----------
var UnifiedMCPOrchestratorAgent = {
  name: 'UnifiedMCPOrchestratorAgent',
  version: '1.0.0',

  // Scan all phases and report their status
  scanAllPhases: function() {
    var results = [];
    PHASE_DEFINITIONS.forEach(function(p) {
      var phase = { phase: p.phase, name: p.name, agentsPresent: [], agentsMissing: [], artifactsPresent: [], artifactsMissing: [], status: 'unknown' };
      p.agents.forEach(function(agentFile) {
        var fp = path.join(AI_AGENTS_DIR, agentFile);
        if (fs.existsSync(fp)) {
          phase.agentsPresent.push(agentFile);
        } else {
          phase.agentsMissing.push(agentFile);
        }
      });
      p.keyArtifacts.forEach(function(artifactGlob) {
        var fp = path.join(process.cwd(), artifactGlob);
        if (fp.indexOf('*') !== -1) {
          var dir = path.dirname(fp);
          var pattern = path.basename(fp);
          if (fs.existsSync(dir)) {
            var matches = fs.readdirSync(dir).filter(function(f) { return f.indexOf(pattern.replace('*', '')) !== -1; });
            if (matches.length > 0) {
              phase.artifactsPresent.push(artifactGlob + ' (' + matches.length + ' match(es))');
            } else {
              phase.artifactsMissing.push(artifactGlob);
            }
          } else {
            phase.artifactsMissing.push(artifactGlob);
          }
        } else {
          if (fs.existsSync(fp)) {
            phase.artifactsPresent.push(artifactGlob);
          } else {
            phase.artifactsMissing.push(artifactGlob);
          }
        }
      });
      phase.status = phase.agentsMissing.length === 0 && phase.artifactsMissing.length === 0 ? 'complete' : (phase.agentsMissing.length === 0 ? 'partial' : 'incomplete');
      results.push(phase);
    });
    return results;
  },

  // Index all generated artifacts into the knowledge base
  indexKnowledgeBase: function() {
    ensureDirs();
    var index = {
      indexedAt: timestamp(),
      categories: {}
    };

    // Feature files
    var featureDir = path.join(process.cwd(), 'features');
    if (fs.existsSync(featureDir)) {
      var features = fs.readdirSync(featureDir).filter(function(f) { return f.endsWith('.feature'); });
      if (features.length > 0) {
        index.categories.features = features.map(function(f) {
          var fp = path.join(featureDir, f);
          return { name: f, size: fileSizeKB(fp), modified: fs.statSync(fp).mtime.toISOString() };
        });
      }
    }

    // Mobile generated features
    var mobileGenDir = path.join(process.cwd(), 'ai/generated-features/mobile');
    if (fs.existsSync(mobileGenDir)) {
      index.categories.mobileGenerated = [];
      var subDirs = ['tests/android', 'tests/ios', 'page-objects/native', 'page-objects/hybrid', 'locators/android', 'locators/ios', 'flows/android', 'flows/ios'];
      subDirs.forEach(function(sub) {
        var sd = path.join(mobileGenDir, sub);
        if (fs.existsSync(sd)) {
          var files = fs.readdirSync(sd);
          files.forEach(function(f) {
            var fp = path.join(sd, f);
            index.categories.mobileGenerated.push({ path: sub + '/' + f, size: fileSizeKB(fp) });
          });
        }
      });
    }

    // Test data datasets
    var testDataDir = path.join(process.cwd(), 'test-data/generated');
    if (fs.existsSync(testDataDir)) {
      var datasets = fs.readdirSync(testDataDir);
      if (datasets.length > 0) {
        index.categories.testData = datasets.map(function(d) {
          var dp = path.join(testDataDir, d);
          var totalSize = 0;
          if (fs.statSync(dp).isDirectory()) {
            var files = fs.readdirSync(dp);
            files.forEach(function(f) {
              var fp = path.join(dp, f);
              if (fs.statSync(fp).isFile()) totalSize += fs.statSync(fp).size;
            });
          }
          return { name: d, files: files.length, totalSizeKB: (totalSize / 1024).toFixed(1) + ' KB' };
        });
      }
    }

    // AI reports
    if (fs.existsSync(REPORTS_AI_DIR)) {
      var aiReports = fs.readdirSync(REPORTS_AI_DIR).filter(function(f) { return f.endsWith('.md') || f.endsWith('.html') || f.endsWith('.json'); });
      if (aiReports.length > 0) {
        index.categories.aiReports = aiReports.map(function(f) {
          var fp = path.join(REPORTS_AI_DIR, f);
          return { name: f, size: fileSizeKB(fp) };
        });
      }
    }

    // Pipeline reports
    var pipelineDir = path.join(process.cwd(), 'reports/pipeline');
    if (fs.existsSync(pipelineDir)) {
      var pipelineReports = fs.readdirSync(pipelineDir).filter(function(f) { return f.endsWith('.md') || f.endsWith('.json'); });
      if (pipelineReports.length > 0) {
        index.categories.pipelineReports = pipelineReports.map(function(f) {
          var fp = path.join(pipelineDir, f);
          return { name: f, size: fileSizeKB(fp) };
        });
      }
    }

    // Write index
    var indexPath = path.join(KNOWLEDGE_BASE_DIR, 'knowledge-index.json');
    fs.writeJsonSync(indexPath, index, { spaces: 2 });

    // Generate readable summary
    var summaryPath = path.join(KNOWLEDGE_BASE_DIR, 'KNOWLEDGE_BASE_SUMMARY.md');
    var lines = [];
    lines.push('# AI Knowledge Base Index');
    lines.push('');
    lines.push('Indexed At: ' + index.indexedAt);
    lines.push('Agent: ' + this.name + ' v' + this.version);
    lines.push('');
    lines.push('## Categories');
    lines.push('');

    var totalFiles = 0;
    Object.keys(index.categories).forEach(function(cat) {
      var items = index.categories[cat];
      lines.push('### ' + cat + ' (' + items.length + ' files)');
      lines.push('');
      items.forEach(function(item) {
        if (item.path) lines.push('- ' + item.path + ' (' + item.size + ')');
        else if (item.name) lines.push('- ' + item.name + ' (' + item.size + ')');
        else lines.push('- ' + JSON.stringify(item));
      });
      lines.push('');
      totalFiles += items.length;
    });

    lines.push('---');
    lines.push('Total Files Indexed: ' + totalFiles);
    lines.push('Categories: ' + Object.keys(index.categories).length);
    fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      indexedAt: index.indexedAt,
      categories: Object.keys(index.categories).length,
      totalFiles: totalFiles,
      indexFile: path.relative(process.cwd(), indexPath),
      summaryFile: path.relative(process.cwd(), summaryPath),
    };
  },

  // Generate complete CI/CD integration report
  generateCICDReport: function() {
    var phases = this.scanAllPhases();

    var reportPath = path.join(REPORTS_AI_DIR, 'ci-cd-integration-report.md');
    var lines = [];
    lines.push('# CI/CD Integration Report');
    lines.push('');
    lines.push('Generated: ' + timestamp());
    lines.push('Agent: ' + this.name + ' v' + this.version);
    lines.push('');
    lines.push('## Phase Status Overview');
    lines.push('');
    lines.push('| Phase | Name | Status | Agents | Artifacts |');
    lines.push('|---|---|---|---|---|');

    var completeCount = 0;
    phases.forEach(function(p) {
      var icon = p.status === 'complete' ? '&#x2705;' : (p.status === 'partial' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
      var agentsStr = p.agentsPresent.length + '/' + (p.agentsPresent.length + p.agentsMissing.length) + ' present';
      var artifactsStr = p.artifactsPresent.length + '/' + (p.artifactsPresent.length + p.artifactsMissing.length) + ' found';
      lines.push('| ' + icon + ' Phase ' + p.phase + ' | ' + p.name + ' | ' + p.status + ' | ' + agentsStr + ' | ' + artifactsStr + ' |');
      if (p.status === 'complete') completeCount++;
    });

    lines.push('');
    var overallStatus = completeCount === phases.length ? 'PASSED' : (completeCount >= phases.length - 1 ? 'PARTIAL' : 'INCOMPLETE');
    var overallIcon = overallStatus === 'PASSED' ? '&#x2705;' : (overallStatus === 'PARTIAL' ? '&#x26A0;&#xFE0F;' : '&#x274C;');
    lines.push('**Overall: ' + overallIcon + ' ' + completeCount + '/' + phases.length + ' phases complete (' + overallStatus + ')**');
    lines.push('');

    // Missing details
    var missingDetails = phases.filter(function(p) { return p.status !== 'complete'; });
    if (missingDetails.length > 0) {
      lines.push('## Gaps & Missing Artifacts');
      lines.push('');
      missingDetails.forEach(function(p) {
        lines.push('### Phase ' + p.phase + ': ' + p.name);
        if (p.agentsMissing.length > 0) lines.push('- Missing agents: ' + p.agentsMissing.join(', '));
        if (p.artifactsMissing.length > 0) lines.push('- Missing artifacts: ' + p.artifactsMissing.join(', '));
        lines.push('');
      });
    }

    // CI/CD pipeline integration status
    lines.push('## CI/CD Pipeline Integration');
    lines.push('');
    lines.push('| Integration | Status | Details |');
    lines.push('|---|---|---|');

    var hasJenkins = fs.existsSync(path.join(process.cwd(), 'Jenkinsfile'));
    lines.push('| ' + (hasJenkins ? '&#x2705;' : '&#x274C;') + ' Jenkins | ' + (hasJenkins ? 'Configured' : 'Not found') + ' | Jenkinsfile ' + (hasJenkins ? 'present' : 'missing') + ' |');

    var hasGitHub = fs.existsSync(path.join(process.cwd(), '.github'));
    lines.push('| ' + (hasGitHub ? '&#x2705;' : '&#x274C;') + ' GitHub Actions | ' + (hasGitHub ? 'Configured' : 'Not found') + ' | .github directory ' + (hasGitHub ? 'present' : 'missing') + ' |');

    var hasDocker = fs.existsSync(path.join(process.cwd(), 'Dockerfile')) || fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'));
    lines.push('| ' + (hasDocker ? '&#x2705;' : '&#x274C;') + ' Docker | ' + (hasDocker ? 'Configured' : 'Not found') + ' | Container config ' + (hasDocker ? 'present' : 'missing') + ' |');

    var hasDotEnv = fs.existsSync(path.join(process.cwd(), '.env'));
    lines.push('| ' + (hasDotEnv ? '&#x2705;' : '&#x274C;') + ' Environment Config | ' + (hasDotEnv ? 'Configured' : 'Not found') + ' | .env file ' + (hasDotEnv ? 'present' : 'missing') + ' |');


    var hasAppium = fs.existsSync(path.join(process.cwd(), 'mobile'));
    lines.push('| ' + (hasAppium ? '&#x2705;' : '&#x274C;') + ' Appium Mobile | ' + (hasAppium ? 'Configured' : 'Not found') + ' | mobile/ directory ' + (hasAppium ? 'present' : 'missing') + ' |');

    var hasVectorDb = fs.existsSync(path.join(process.cwd(), 'ai/vector-db'));
    lines.push('| ' + (hasVectorDb ? '&#x2705;' : '&#x274C;') + ' Vector DB (RAG) | ' + (hasVectorDb ? 'Configured' : 'Not found') + ' | ChromaDB + local vector store ' + (hasVectorDb ? 'present' : 'missing') + ' |');

    lines.push('');
    lines.push('## Recommendations');
    lines.push('');
    if (completeCount < phases.length) {
      var incomplete = phases.filter(function(p) { return p.status !== 'complete'; });
      incomplete.forEach(function(p) {
        lines.push('- Complete Phase ' + p.phase + ' (' + p.name + ') artifacts.');
      });
    } else {
      lines.push('- All phases complete. Consider adding end-to-end pipeline automation.');
    }
    lines.push('- Run the AIDashboardAgent to refresh the unified dashboard.');
    lines.push('- Run the SelfHealingPipelineAgent for cross-platform execution.');
    lines.push('');
    lines.push('---');
    lines.push('*Report generated by ' + this.name + ' v' + this.version + '*');

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    return {
      ok: true,
      reportPath: path.relative(process.cwd(), reportPath),
      phaseSummary: phases.map(function(p) { return { phase: p.phase, name: p.name, status: p.status }; }),
      overallStatus: overallStatus,
      completePhases: completeCount,
      totalPhases: phases.length,
    };
  },

  // Main run method
  run: function(input) {
    console.log('[UnifiedMCPOrchestratorAgent] Starting unified MCP orchestration');

    var state = loadState();
    var run = {
      id: 'orch-' + Date.now(),
      startedAt: timestamp(),
      status: 'running',
    };
    state.currentRun = run;
    saveState(state);

    // 1. Scan all phases
    console.log('[UnifiedMCPOrchestratorAgent] Scanning all 12 phases...');
    var phaseScan = this.scanAllPhases();
    var completePhases = phaseScan.filter(function(p) { return p.status === 'complete'; }).length;

    // 2. Index knowledge base
    console.log('[UnifiedMCPOrchestratorAgent] Indexing knowledge base...');
    var kbIndex = this.indexKnowledgeBase();

    // 3. Generate CI/CD report
    console.log('[UnifiedMCPOrchestratorAgent] Generating CI/CD integration report...');
    var cicdReport = this.generateCICDReport();

    run.status = 'completed';
    run.completedAt = timestamp();
    run.result = {
      completePhases: completePhases,
      totalPhases: 12,
      kbFilesIndexed: kbIndex.totalFiles,
      report: cicdReport.reportPath,
    };
    state.runs.push(run);
    state.currentRun = null;
    saveState(state);

    console.log('[UnifiedMCPOrchestratorAgent] Orchestration complete: ' + completePhases + '/12 phases complete');

    return {
      ok: true,
      orchestrationId: run.id,
      phaseSummary: phaseScan.map(function(p) { return { phase: p.phase, name: p.name, status: p.status }; }),
      completePhases: completePhases,
      totalPhases: 12,
      knowledgeBase: { categories: kbIndex.categories, totalFiles: kbIndex.totalFiles },
      cicdReport: { path: cicdReport.reportPath, overallStatus: cicdReport.overallStatus },
    };
  },

  // Get orchestration history
  getRunHistory: function() {
    var state = loadState();
    return state.runs || [];
  },

  // Get MCP config status
  getMCPStatus: function() {
    var configPath = path.join(process.cwd(), 'ai/mcp/mcp.config.json');
    var config = safeReadJson(configPath);
    if (!config) return { configured: false, servers: 0, message: 'MCP config not found' };
    var serverCount = Object.keys(config.servers || {}).length;
    return { configured: true, servers: serverCount, serverNames: Object.keys(config.servers || {}) };
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'run';

  if (command === 'run' || command === 'orchestrate') {
    var result = UnifiedMCPOrchestratorAgent.run();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'scan') {
    var phases = UnifiedMCPOrchestratorAgent.scanAllPhases();
    console.log('Phase Status:');
    phases.forEach(function(p) {
      console.log('  Phase ' + p.phase + ' (' + p.name + '): ' + p.status + ' [' + p.agentsPresent.length + ' agents, ' + p.artifactsPresent.length + ' artifacts]');
    });
    return;
  }

  if (command === 'index') {
    var result = UnifiedMCPOrchestratorAgent.indexKnowledgeBase();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'report') {
    var result = UnifiedMCPOrchestratorAgent.generateCICDReport();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'history') {
    var history = UnifiedMCPOrchestratorAgent.getRunHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  if (command === 'mcp') {
    var status = UnifiedMCPOrchestratorAgent.getMCPStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: run, scan, index, report, history, mcp');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[UnifiedMCPOrchestratorAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = UnifiedMCPOrchestratorAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Unified MCP Orchestrator Agent",
  "version": "1.0.0",
  "description": "Phase scanning, knowledge base indexing, and CI/CD integration status reporting",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "orchestration",
    "scanning"
  ],
  "executionStage": "reporting",
  "priority": 20,
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
