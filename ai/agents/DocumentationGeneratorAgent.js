// DocumentationGeneratorAgent - Phase 17
// Auto-generates comprehensive multi-format documentation for the entire AI ecosystem.
// Produces updated AGENT_CATALOG.md, ARCHITECTURE.md, WORKFLOWS.md, CLI command reference,
// and a system overview README covering all 42+ agents across 17 phases.
const fs = require('fs-extra');
const path = require('path');

const AI_DOCS_DIR = path.join(process.cwd(), 'ai', 'docs');
const ROOT_README = path.join(process.cwd(), 'README.md');
const ECOSYSTEM_README = path.join(process.cwd(), 'AI_ECOSYSTEM.md');
const FRAMEWORK_GUIDE = path.join(process.cwd(), 'FRAMEWORK_GUIDE.md');

function ensureDirs() {
  fs.ensureDirSync(AI_DOCS_DIR);
}

function timestamp() {
  return new Date().toISOString();
}

function getAgentList() {
  try {
    var idx = require('../agents/index');
    var keys = Object.keys(idx);
    return keys.map(function(k) {
      var agent = idx[k];
      return {
        key: k,
        name: agent && agent.name ? agent.name : k,
        version: agent && agent.version ? agent.version : '1.0.0',
        hasRun: typeof (agent && agent.run) === 'function',
        methods: agent ? Object.keys(agent).filter(function(m) { return m !== 'name' && m !== 'version'; }) : [],
      };
    });
  } catch { return []; }
}

// ---------- Phase definitions with all agents ----------
var PHASE_MAP = [
  { phase: 1, name: 'Foundation & Base Agents', agents: ['PlannerAgent', 'DecisionAgent', 'ExecutionAgent', 'HealingAgent', 'RetryAgent', 'RCAAgent', 'PRAgent', 'JenkinsAgent', 'APIAgent', 'MobileAgent', 'VisualAgent', 'ImpactAgent', 'ReleaseGateAgent', 'MonitoringAgent', 'mcpHealthCheck', 'baseAgent'], description: 'Core agent architecture, AgentRunner, AgentRegistry, shared memory, and MCP config.' },
  { phase: 2, name: 'Test Generation Pipeline', agents: ['testCaseGeneration', 'featureFileGeneration', 'stepDefinitionGeneration', 'pageObjectGeneration', 'apiTestGeneration'], description: 'AI-driven generation of test cases, Gherkin features, step definitions, page objects, and API tests.' },
  { phase: 3, name: 'AI Analysis & RCA', agents: ['failureAnalysis', 'rootCauseAnalysis', 'playwrightCodeReview', 'reportSummarization'], description: 'Failure analysis, root cause categorization, Playwright code review, and execution report summarization.' },
  { phase: 4, name: 'Locator Self-Healing', agents: ['locatorHealing', 'selfHealingAutomation'], description: 'Automated locator repair using DOM context, failure logs, and screenshot analysis.' },
  { phase: 5, name: 'Advanced Self-Healing', agents: ['LocatorApplyManager', 'locatorHealingApplier'], description: 'Advanced locator healing with apply manager and automatic healing application.' },
  { phase: 6, name: 'Multi-Agent Execution', agents: ['execution', 'testExecution', 'executionMemory'], description: 'Coordinated test execution across platforms with retry logic and execution state tracking.' },
  { phase: 7, name: 'Mobile Test Generation', agents: ['mobileTestGeneration'], description: 'Appium-based mobile test generation for Android/iOS native and hybrid apps.' },
  { phase: 8, name: 'Device Farm Agent', agents: ['mobileDeviceFarm'], description: 'Cross-platform mobile device farm with emulator, real device, and cloud (BrowserStack/SauceLabs) support.' },
  { phase: 9, name: 'Self-Healing Pipeline', agents: ['selfHealingPipeline'], description: 'AI-powered self-healing test pipeline with automatic retry, healing, and CI/CD integration.' },
  { phase: 10, name: 'AI Dashboard', agents: ['aiDashboard'], description: 'Unified HTML dashboard aggregating test results, pipeline runs, device farm data, and AI reports.' },
  { phase: 11, name: 'Test Data Pipeline', agents: ['testDataPipeline'], description: 'Synthetic test data generation for users, products, addresses, payment methods, and search queries.' },
  { phase: 12, name: 'Unified MCP Orchestrator', agents: ['unifiedOrchestrator'], description: 'Consolidated orchestrator managing all 12+ phases, knowledge base indexing, and CI/CD status reporting.' },
  { phase: 13, name: 'Anomaly Detection', agents: ['anomalyDetection'], description: 'Real-time anomaly detection for flaky tests, performance regressions, and locator decay patterns.' },
  { phase: 14, name: 'Smart Test Selector', agents: ['smartTestSelector'], description: 'Risk-based test selection using code change analysis, feature mapping, and priority-based optimization.' },
  { phase: 15, name: 'Ecosystem Readiness', agents: ['ecosystemReadiness'], description: 'End-to-end ecosystem health validation across 67 checks in 6 categories.' },
  { phase: 16, name: 'Secrets Vault', agents: ['secretsVault'], description: 'AES-256-CBC encrypted credential management with profile system, key rotation, and env injection.' },
  { phase: 17, name: 'Documentation Generator', agents: ['ai/docs'], description: 'Auto-generated multi-format documentation covering all agents, phases, CLI commands, and architecture.' },
];

// ---------- Generators ----------

function generateAgentCatalog(agents) {
  var lines = [];
  lines.push('# Agent Catalog');
  lines.push('');
  lines.push('Auto-generated by DocumentationGeneratorAgent v1.0.0');
  lines.push('Generated: ' + timestamp());
  lines.push('');
  lines.push('Total Agents: **' + agents.length + '**');
  lines.push('');
  lines.push('## Agent Index');
  lines.push('');
  lines.push('| # | Agent Key | Display Name | Version | Has run() | Methods |');
  lines.push('|---|---|---|---|---|---|');
  agents.sort(function(a, b) { return a.key.localeCompare(b.key); }).forEach(function(a, i) {
    lines.push('| ' + (i + 1) + ' | `' + a.key + '` | ' + a.name + ' | v' + a.version + ' | ' + (a.hasRun ? 'Yes' : 'No') + ' | ' + a.methods.length + ' |');
  });
  lines.push('');

  // Phase breakdown
  lines.push('## Phase Breakdown');
  lines.push('');
  PHASE_MAP.forEach(function(p) {
    lines.push('### Phase ' + p.phase + ': ' + p.name);
    lines.push('');
    lines.push(p.description);
    lines.push('');
    lines.push('Agents: ' + p.agents.join(', '));
    lines.push('');
  });

  return lines.join('\n');
}

function generateArchitectureDoc(agents) {
  var lines = [];
  lines.push('# AI-Assisted Automation Platform Architecture');
  lines.push('');
  lines.push('Auto-generated by DocumentationGeneratorAgent v1.0.0');
  lines.push('Generated: ' + timestamp());
  lines.push('');
  lines.push('## Framework Layers');
  lines.push('');
  lines.push('```text');
  lines.push('features/ -> step-definitions/ -> pages/ -> BasePage -> Playwright browser');
  lines.push('mobile/android/ -> mobile/ios/ -> MobileBasePage -> Appium/WD driver');
  lines.push('ai/agents/ -> 42 specialized agents -> ai/output/');
  lines.push('```');
  lines.push('');
  lines.push('## Agent Architecture');
  lines.push('');
  lines.push('```text');
  lines.push('┌──────────────────────────────────────────────────┐');
  lines.push('│                   User / CI/CD                   │');
  lines.push('└──────────────────────┬───────────────────────────┘');
  lines.push('                       │');
  lines.push('┌──────────────────────▼───────────────────────────┐');
  lines.push('│            Agent Registry (42 agents)             │');
  lines.push('│  ai/agents/index.js                              │');
  lines.push('└──────┬──────────┬──────────┬─────────────────────┘');
  lines.push('       │          │          │');
  lines.push('  ┌────▼───┐ ┌───▼────┐ ┌───▼──────┐');
  lines.push('  │Generation│ │Analysis │ │Execution  │');
  lines.push('  │ Agents   │ │ Agents  │ │ Agents    │');
  lines.push('  └─────────┘ └────────┘ └──────────┘');
  lines.push('       │          │          │');
  lines.push('  ┌────▼───┐ ┌───▼────┐ ┌───▼──────┐');
  lines.push('  │ Mobile  │ │Pipeline│ │Dashboard  │');
  lines.push('  │ Agents  │ │ Agents │ │ Agents    │');
  lines.push('  └─────────┘ └────────┘ └──────────┘');
  lines.push('       │          │          │');
  lines.push('  ┌────▼───┐ ┌───▼────┐ ┌───▼──────┐');
  lines.push('  │Security │ │Smart   │ │Ecosystem  │');
  lines.push('  │ Vault   │ │Selector│ │Readiness  │');
  lines.push('  └─────────┘ └────────┘ └──────────┘');
  lines.push('```');
  lines.push('');

  // Agent categories
  var categories = {
    'Generation': agents.filter(function(a) { return ['testCaseGeneration','featureFileGeneration','stepDefinitionGeneration','pageObjectGeneration','apiTestGeneration','mobileTestGeneration','testDataPipeline'].indexOf(a.key) !== -1; }),
    'Analysis & RCA': agents.filter(function(a) { return ['failureAnalysis','rootCauseAnalysis','playwrightCodeReview','reportSummarization','anomalyDetection'].indexOf(a.key) !== -1; }),
    'Healing & Pipeline': agents.filter(function(a) { return ['locatorHealing','selfHealingAutomation','selfHealingPipeline'].indexOf(a.key) !== -1; }),
    'Execution & Orchestration': agents.filter(function(a) { return ['execution','testExecution','executionMemory','planner','decision','retry','healing','rca','unifiedOrchestrator'].indexOf(a.key) !== -1; }),
    'Mobile & Device Farm': agents.filter(function(a) { return ['mobile','mobileTestGeneration','mobileDeviceFarm'].indexOf(a.key) !== -1; }),
    'Dashboard & Reporting': agents.filter(function(a) { return ['aiDashboard','report','reportSummarization','pr','prPreparation'].indexOf(a.key) !== -1; }),
    'CI/CD & Infrastructure': agents.filter(function(a) { return ['jenkins','jenkinsBuildFailureAnalysis','mcpHealthCheck','monitoring'].indexOf(a.key) !== -1; }),
    'Security & Quality': agents.filter(function(a) { return ['secretsVault','smartTestSelector','ecosystemReadiness','visual','impact','release','api'].indexOf(a.key) !== -1; }),
  };

  lines.push('## Agent Categories');
  lines.push('');
  Object.keys(categories).forEach(function(cat) {
    var catAgents = categories[cat];
    if (catAgents.length > 0) {
      lines.push('### ' + cat + ' (' + catAgents.length + ' agents)');
      lines.push('');
      catAgents.forEach(function(a) {
        lines.push('- **' + a.name + '** (`' + a.key + '`) v' + a.version + ' — methods: ' + a.methods.join(', '));
      });
      lines.push('');
    }
  });

  return lines.join('\n');
}

function generateWorkflowsDoc(agents) {
  var lines = [];
  lines.push('# AI Workflow Examples & CLI Commands');
  lines.push('');
  lines.push('Auto-generated by DocumentationGeneratorAgent v1.0.0');
  lines.push('Generated: ' + timestamp());
  lines.push('');
  lines.push('## All Agents CLI Commands');
  lines.push('');
  lines.push('Each agent can be invoked via node:');
  lines.push('');
  lines.push('```bash');
  lines.push('node ai/agents/<AgentFileName>.js [command]');
  lines.push('```');
  lines.push('');

  agents.sort(function(a, b) { return a.key.localeCompare(b.key); }).forEach(function(a) {
    var fileName = a.name.replace('Agent', '') + 'Agent.js';
    // Find actual filename by searching
    var actualFile = a.key + '.js';
    // Try to map
    var agentFileMap = {
      'testCaseGeneration': 'testCaseGenerationAgent.js',
      'featureFileGeneration': 'featureFileGenerationAgent.js',
      'stepDefinitionGeneration': 'stepDefinitionGenerationAgent.js',
      'pageObjectGeneration': 'pageObjectGenerationAgent.js',
      'apiTestGeneration': 'apiTestGenerationAgent.js',
      'mobileTestGeneration': 'MobileTestGenerationAgent.js',
      'failureAnalysis': 'failureAnalysisAgent.js',
      'rootCauseAnalysis': 'rootCauseAnalysisAgent.js',
      'playwrightCodeReview': 'playwrightCodeReviewAgent.js',
      'reportSummarization': 'reportSummarizationAgent.js',
      'anomalyDetection': 'AnomalyDetectionAgent.js',
      'locatorHealing': 'locatorHealingAgent.js',
      'selfHealingAutomation': 'selfHealingAutomationAgent.js',
      'selfHealingPipeline': 'SelfHealingPipelineAgent.js',
      'testDataGeneration': 'testDataGenerationAgent.js',
      'testDataPipeline': 'TestDataPipelineAgent.js',
      'secretsVault': 'SecretsVaultAgent.js',
      'jenkinsBuildFailureAnalysis': 'jenkinsBuildFailureAnalysisAgent.js',
      'jenkins': 'JenkinsAgent.js',
      'executionMemory': 'executionMemoryAgent.js',
      'execution': 'ExecutionAgent.js',
      'testExecution': 'TestExecutionAgent.js',
      'planner': 'PlannerAgent.js',
      'decision': 'DecisionAgent.js',
      'retry': 'RetryAgent.js',
      'healing': 'HealingAgent.js',
      'rca': 'RCAAgent.js',
      'unifiedOrchestrator': 'UnifiedMCPOrchestratorAgent.js',
      'ecosystemReadiness': 'EcosystemReadinessAgent.js',
      'report': 'ReportAgent.js',
      'pr': 'PRAgent.js',
      'prPreparation': 'prPreparationAgent.js',
      'aiDashboard': 'AIDashboardAgent.js',
      'smartTestSelector': 'SmartTestSelectorAgent.js',
      'api': 'APIAgent.js',
      'mobile': 'MobileAgent.js',
      'mobileDeviceFarm': 'MobileDeviceFarmAgent.js',
      'visual': 'VisualAgent.js',
      'impact': 'ImpactAgent.js',
      'release': 'ReleaseGateAgent.js',
      'monitoring': 'MonitoringAgent.js',
      'mcpHealthCheck': 'mcpHealthCheckAgent.js',
    };
    var filename = agentFileMap[a.key] || a.key + 'Agent.js';
    lines.push('### ' + a.name + ' (`' + a.key + '`)');
    lines.push('');
    lines.push('```bash');
    lines.push('# Run with default behavior');
    lines.push('node ai/agents/' + filename);
    lines.push('');
    if (a.methods.length > 0) {
      lines.push('# Available CLI commands depend on agent implementation');
    }
    lines.push('```');
    lines.push('');
  });

  // Workflow section
  lines.push('## Common Workflows');
  lines.push('');
  var workflows = [
    { name: 'End-to-End Test Generation', cmd: 'node ai/index.js --all', desc: 'Runs all generation agents sequentially (test cases → feature files → step defs → page objects)' },
    { name: 'Post-Test AI Analysis', cmd: 'node ai/index.js --post-test', desc: 'Analyzes cucumber report, runs failure analysis, and generates execution summary' },
    { name: 'Unified Orchestration', cmd: 'node ai/agents/UnifiedMCPOrchestratorAgent.js', desc: 'Scans all phases, indexes knowledge base, generates CI/CD integration report' },
    { name: 'AI Dashboard Generation', cmd: 'node ai/agents/AIDashboardAgent.js', desc: 'Generates unified HTML dashboard with test results, pipeline runs, and AI reports' },
    { name: 'Self-Healing Pipeline', cmd: 'node ai/agents/SelfHealingPipelineAgent.js pipeline', desc: 'Runs cross-platform self-healing pipeline with automatic retry and locator healing' },
    { name: 'Anomaly Detection', cmd: 'node ai/agents/AnomalyDetectionAgent.js', desc: 'Scans execution history for flaky tests, performance regressions, and locator decay' },
    { name: 'Smart Test Selection', cmd: 'node ai/agents/SmartTestSelectorAgent.js', desc: 'Analyzes git changes and selects optimal test suite based on risk profile' },
    { name: 'Ecosystem Health Check', cmd: 'node ai/agents/EcosystemReadinessAgent.js', desc: 'Validates all 67 health checks across agents, framework, CI/CD, and reporting' },
    { name: 'Secrets Vault', cmd: 'node ai/agents/SecretsVaultAgent.js init', desc: 'Initializes encrypted credential vault for cloud device farm and API keys' },
    { name: 'Test Data Generation', cmd: 'node ai/agents/TestDataPipelineAgent.js', desc: 'Generates synthetic test datasets for users, products, addresses, and payments' },
    { name: 'Device Farm Execution', cmd: 'node ai/agents/MobileDeviceFarmAgent.js', desc: 'Runs tests on built-in emulators, real devices, or BrowserStack/SauceLabs cloud' },
  ];

  lines.push('| # | Workflow | Command | Description |');
  lines.push('|---|---|---|---|');
  workflows.forEach(function(w, i) {
    lines.push('| ' + (i + 1) + ' | ' + w.name + ' | `' + w.cmd + '` | ' + w.desc + ' |');
  });
  lines.push('');

  // Phase workflow map
  lines.push('## Phase-to-Agent Workflow Map');
  lines.push('');
  lines.push('| Phase | Workflow | Key Command |');
  lines.push('|---|---|---|');
  PHASE_MAP.forEach(function(p) {
    lines.push('| Phase ' + p.phase + ': ' + p.name + ' | ' + p.description + ' | `node ai/agents/' + (p.agents[0] || 'index') + '` |');
  });

  return lines.join('\n');
}

function generateEcosystemReadme(agents) {
  var lines = [];
  lines.push('# AI Test Automation Ecosystem');
  lines.push('');
  lines.push('Auto-generated by DocumentationGeneratorAgent v1.0.0');
  lines.push('Generated: ' + timestamp());
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push('This ecosystem extends the core Playwright + Cucumber BDD test automation framework with **42 AI-powered agents** across **17 phases**. The AI layer provides test generation, self-healing, cross-platform execution, anomaly detection, secrets management, and comprehensive documentation.');
  lines.push('');
  lines.push('## Quick Start');
  lines.push('');
  lines.push('```bash');
  lines.push('# Run all web tests');
  lines.push('npm run test:web');
  lines.push('');
  lines.push('# Run mobile tests (Android)');
  lines.push('npm run test:android');
  lines.push('');
  lines.push('# Generate AI Dashboard');
  lines.push('node ai/agents/AIDashboardAgent.js');
  lines.push('');
  lines.push('# Check ecosystem readiness');
  lines.push('node ai/agents/EcosystemReadinessAgent.js');
  lines.push('');
  lines.push('# Initialize secrets vault');
  lines.push('node ai/agents/SecretsVaultAgent.js init');
  lines.push('```');
  lines.push('');
  lines.push('## Agent Summary');
  lines.push('');
  lines.push('| Category | Count | Agents |');
  lines.push('|---|---|---|');
  lines.push('| Generation | 7 | TestCase, FeatureFile, StepDefinition, PageObject, APITest, MobileTest, TestDataPipeline |');
  lines.push('| Analysis & RCA | 5 | FailureAnalysis, RootCause, CodeReview, ReportSummary, AnomalyDetection |');
  lines.push('| Healing & Pipeline | 3 | LocatorHealing, SelfHealingAuto, SelfHealingPipeline |');
  lines.push('| Execution & Orchestration | 9 | Execution, TestExecution, ExecutionMemory, Planner, Decision, Retry, Healing, RCA, UnifiedOrchestrator |');
  lines.push('| Mobile & Device Farm | 3 | Mobile, MobileTestGeneration, MobileDeviceFarm |');
  lines.push('| Dashboard & Reporting | 5 | AIDashboard, Report, ReportSummarization, PR, PRPreparation |');
  lines.push('| CI/CD & Infra | 4 | Jenkins, JenkinsBuildFail, MCPHealth, Monitoring |');
  lines.push('| Security & Quality | 6 | SecretsVault, SmartSelector, EcosystemReadiness, Visual, Impact, Release, API |');
  lines.push('| **Total** | **42** | |');
  lines.push('');
  lines.push('## Phase Implementation Status');
  lines.push('');
  lines.push('| Phase | Name | Status |');
  lines.push('|---|---|---|');
  PHASE_MAP.forEach(function(p) {
    lines.push('| Phase ' + p.phase + ' | ' + p.name + ' | &#x2705; Complete |');
  });
  lines.push('');
  lines.push('## Key Files');
  lines.push('');
  lines.push('| File | Description |');
  lines.push('|---|---|');
  lines.push('| `ai/agents/index.js` | Central agent registry (42 exports) |');
  lines.push('| `ai/agents/*.js` | Individual agent implementations |');
  lines.push('| `ai/docs/AGENT_CATALOG.md` | Full agent catalog with descriptions |');
  lines.push('| `ai/docs/ARCHITECTURE.md` | System architecture documentation |');
  lines.push('| `ai/docs/WORKFLOWS.md` | CLI commands and workflow examples |');
  lines.push('| `ai/memory/*.json` | Agent state and execution history |');
  lines.push('| `reports/ai/dashboard/index.html` | Unified AI Dashboard |');
  lines.push('| `reports/ai/readiness/*.md` | Ecosystem readiness reports |');
  lines.push('');

  // Architecture overview
  lines.push('## Architecture Overview');
  lines.push('');
  lines.push('```text');
  lines.push('┌─────────────────────────────────────────────────────┐');
  lines.push('│                CI/CD Pipeline                       │');
  lines.push('│  Jenkinsfile / GitHub Actions                       │');
  lines.push('└──────────────────────┬──────────────────────────────┘');
  lines.push('                       │');
  lines.push('┌──────────────────────▼──────────────────────────────┐');
  lines.push('│              Test Execution Engine                   │');
  lines.push('│  Playwright (Web) + Appium (Mobile) + Cucumber BDD  │');
  lines.push('└──────┬──────────────────────────┬───────────────────┘');
  lines.push('       │                          │');
  lines.push('┌──────▼──────────┐     ┌─────────▼─────────────────┐');
  lines.push('│   Web Tests     │     │   Mobile Tests              │');
  lines.push('│   pages/        │     │   mobile/android/, ios/     │');
  lines.push('│   features/     │     │   mobile/capabilities/      │');
  lines.push('│   step-defs/    │     │   mobile/locators/          │');
  lines.push('└─────────────────┘     └───────────────────────────┘');
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────┐');
  lines.push('│              AI Agent Layer (42 agents)              │');
  lines.push('│  Generation │ Analysis │ Healing │ Pipeline         │');
  lines.push('│  Mobile │ Dashboard │ Security │ Orchestration      │');
  lines.push('└─────────────────────────────────────────────────────┘');
  lines.push('```');

  return lines.join('\n');
}

// ---------- Main Agent ----------
var DocumentationGeneratorAgent = {
  name: 'DocumentationGeneratorAgent',
  version: '1.0.0',

  // Generate all documentation
  generate: function() {
    ensureDirs();
    console.log('[DocumentationGeneratorAgent] Generating multi-format documentation');

    var agents = getAgentList();
    console.log('  Agents discovered: ' + agents.length);

    var results = [];

    // 1. AGENT_CATALOG.md
    var catalogPath = path.join(AI_DOCS_DIR, 'AGENT_CATALOG.md');
    var catalogContent = generateAgentCatalog(agents);
    fs.writeFileSync(catalogPath, catalogContent, 'utf8');
    results.push({ file: 'ai/docs/AGENT_CATALOG.md', sizeKB: (catalogContent.length / 1024).toFixed(1) });
    console.log('  Generated: ai/docs/AGENT_CATALOG.md');

    // 2. ARCHITECTURE.md
    var archPath = path.join(AI_DOCS_DIR, 'ARCHITECTURE.md');
    var archContent = generateArchitectureDoc(agents);
    fs.writeFileSync(archPath, archContent, 'utf8');
    results.push({ file: 'ai/docs/ARCHITECTURE.md', sizeKB: (archContent.length / 1024).toFixed(1) });
    console.log('  Generated: ai/docs/ARCHITECTURE.md');

    // 3. WORKFLOWS.md
    var workflowsPath = path.join(AI_DOCS_DIR, 'WORKFLOWS.md');
    var workflowsContent = generateWorkflowsDoc(agents);
    fs.writeFileSync(workflowsPath, workflowsContent, 'utf8');
    results.push({ file: 'ai/docs/WORKFLOWS.md', sizeKB: (workflowsContent.length / 1024).toFixed(1) });
    console.log('  Generated: ai/docs/WORKFLOWS.md');

    // 4. AI_ECOSYSTEM.md (root-level overview)
    var ecosystemPath = ECOSYSTEM_README;
    var ecosystemContent = generateEcosystemReadme(agents);
    fs.writeFileSync(ecosystemPath, ecosystemContent, 'utf8');
    results.push({ file: 'AI_ECOSYSTEM.md', sizeKB: (ecosystemContent.length / 1024).toFixed(1) });
    console.log('  Generated: AI_ECOSYSTEM.md');

    return {
      ok: true,
      files: results,
      totalFiles: results.length,
      totalSizeKB: results.reduce(function(sum, r) { return sum + parseFloat(r.sizeKB); }, 0).toFixed(1),
      agentCount: agents.length,
    };
  },

  // Main run method
  run: function() {
    console.log('[DocumentationGeneratorAgent] Auto-generating multi-format documentation');
    return this.generate();
  },

  // Regenerate a single doc
  regenerateFile: function(docName) {
    var agents = getAgentList();
    var map = {
      'catalog': { gen: generateAgentCatalog, path: path.join(AI_DOCS_DIR, 'AGENT_CATALOG.md') },
      'architecture': { gen: generateArchitectureDoc, path: path.join(AI_DOCS_DIR, 'ARCHITECTURE.md') },
      'workflows': { gen: generateWorkflowsDoc, path: path.join(AI_DOCS_DIR, 'WORKFLOWS.md') },
      'ecosystem': { gen: generateEcosystemReadme, path: ECOSYSTEM_README },
    };
    var entry = map[docName];
    if (!entry) return { ok: false, error: 'Unknown doc: ' + docName + '. Available: ' + Object.keys(map).join(', ') };
    var content = entry.gen(agents);
    fs.writeFileSync(entry.path, content, 'utf8');
    return { ok: true, file: path.relative(process.cwd(), entry.path), sizeKB: (content.length / 1024).toFixed(1) };
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'generate';

  if (command === 'generate' || command === 'all') {
    var result = DocumentationGeneratorAgent.generate();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'regenerate') {
    var docName = args[1];
    if (!docName) { console.log('Usage: regenerate [catalog|architecture|workflows|ecosystem]'); process.exit(1); }
    var result = DocumentationGeneratorAgent.regenerateFile(docName);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: generate, all, regenerate <name>');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[DocumentationGeneratorAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = DocumentationGeneratorAgent;
