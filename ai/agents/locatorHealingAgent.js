const fs = require('fs-extra');
const path = require('path');
const BaseAgent = require('./baseAgent');
const RagService = require('../rag/ragService');
const { readCucumberSummary } = require('../tools/cucumberReportReader');
const LocatorApplier = require('./locatorHealingApplier');
const LocatorAnalyzer = require('../tools/locatorAnalyzer');
const timestamp = () => new Date().toISOString().replace(/[:.]/g,'-');

// Lazy require to avoid circular dependency with HealingAgent
let HealingAgent = null;
function getHealingAgent() {
  if (!HealingAgent) {
    try {
      HealingAgent = require("./HealingAgent");
    } catch (_) {
      // HealingAgent may not be available (circular dep or missing)
    }
  }
  return HealingAgent;
}


const agent = new BaseAgent({
  name: 'Locator Healing Agent',
  role: 'Recommend stable alternative locators using current failures and retrieved framework locator evidence.',
  promptFile: 'locator-healing.md',
  outputType: 'Locator healing recommendation'
});

function readFailureInput(input = {}) {
  if (input.failures?.length) return input.failures;
  const explicitPath = path.join(process.cwd(), 'ai/input/failed-locators.json');
  if (fs.existsSync(explicitPath)) {
    const data = fs.readJsonSync(explicitPath);
    if (Array.isArray(data) && data.length) return data;
  }
  return (readCucumberSummary(input.reportDir || process.env.REPORT_DIR || 'reports') || {}).failures || [];
}

function buildQuery(failures) {
  return failures.map((failure) => [
    failure.locator,
    failure.feature,
    failure.scenario,
    failure.failedStep,
    failure.error
  ].filter(Boolean).join(' ')).join('\n');
}

agent.suggestWithRag = async function suggestWithRag(input = {}) {
  const failures = readFailureInput(input);
  if (!failures.length) {
    return { skipped: true, reason: 'No locator failure input was found.' };
  }

  const query = buildQuery(failures);
  const rag = new RagService();
  const result = await rag.generate({
    task: 'Recommend replacement Playwright or Appium locators for the current failures without modifying source files.',
    input: { failures, mode: 'recommendation-only' },
    topK: Number(process.env.LOCATOR_RAG_TOP_K || 8),
    systemPrompt: agent.loadPrompt(),
    instructions: [
      '- Return Markdown with Failure Evidence and a ranked locator recommendation table.',
      '- For each suggestion include locator syntax, source file, stability rationale, confidence, and risk.',
      '- Never claim the locator was tested or fixed.'
    ].join('\n'),
    retrieve: async (retrieval, topK) => {
      const [locators, pageObjects] = await Promise.all([
        retrieval.searchLocators(query, topK),
        retrieval.searchPageObjects(query, Math.max(3, Math.ceil(topK / 2)))
      ]);
      return [...locators, ...pageObjects]
        .sort((left, right) => (right.similarityScore || 0) - (left.similarityScore || 0))
        .slice(0, topK);
    }
  });

  const outputPath = path.join(process.cwd(), 'reports/ai/locator-healing.md');
  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, result.content);

  return {
    outputPath: path.relative(process.cwd(), outputPath),
    response: result.content,
    retrievalEvidence: result.promptEvidence,
    model: result.model,
    usage: result.usage
  };
};

agent.suggestWithVectorDb = agent.suggestWithRag;

// Analyze failures using lightweight static heuristics + local evidence
agent.analyzeFailures = async function analyzeFailures(input = {}) {
  const failures = readFailureInput(input);
  if (!failures.length) return { skipped: true, reason: 'No failures found' };

  const candidates = await Promise.all(failures.map(async (f) => {
    const evidence = await LocatorAnalyzer.findCandidatesForFailure(f, {
      searchRoots: input.searchRoots || ['pages', 'mobile', 'test-helpers']
    });
    return { failure: f, candidates: evidence };
  }));

  const proposals = [];
  for (const c of candidates) {
    for (const cand of (c.candidates || [])) {
      const risk = LocatorAnalyzer.classifyRisk(c.failure, cand);
      proposals.push({
        failure: c.failure,
        suggested: cand,
        risk,
        rationale: cand.heuristic || '',
        confidence: Math.round((cand.score || 0) * 100)
      });
    }
  }

  proposals.sort((a,b) => (b.confidence||0) - (a.confidence||0));

  const proposalsPath = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-proposals.json');
  fs.ensureDirSync(path.dirname(proposalsPath));
  fs.writeJsonSync(proposalsPath, { generatedAt: new Date().toISOString(), proposals }, { spaces: 2 });

  const reportPath = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-report.md');
  const header = `# Locator Healing Report\n\nGenerated: ${new Date().toISOString()}\n\nSummary: ${proposals.length} proposals\n\n`;
  fs.writeFileSync(reportPath, header);

  return { proposalsPath: path.relative(process.cwd(), proposalsPath), reportPath: path.relative(process.cwd(), reportPath), proposals };
};

// Apply only LOW-risk proposals. Creates patches for review and backups when applying.
agent.applySafeFixes = async function applySafeFixes(options = {}) {
  const mode = options.mode || 'dry-run';
  const proposalsFile = options.proposalsFile || path.join(process.cwd(), 'reports', 'ai', 'locator-healing-proposals.json');
  if (!fs.existsSync(proposalsFile)) return { error: 'No proposals file found', path: proposalsFile };

  const data = fs.readJsonSync(proposalsFile);
  const lowRisk = (data.proposals || []).filter(p => p.risk === 'LOW');
  if (!lowRisk.length) return { applied: [], reason: 'No LOW-risk proposals' };

  const applier = new LocatorApplier({ backupRoot: path.join(process.cwd(), 'ai', 'backups', timestamp()) });
  const applied = [];
  for (const p of lowRisk) {
    const patch = applier.createPatchForSuggestion(p);
    const patchReportDir = path.join(process.cwd(), 'reports', 'ai', 'locator-healing-patches');
    fs.ensureDirSync(patchReportDir);
    const patchFile = path.join(patchReportDir, `${p.failure.feature || 'unknown'}-${Math.abs(Math.floor(Math.random()*1e9))}.patch`);
    fs.writeFileSync(patchFile, patch);
    if (mode === 'apply') {
      const ok = await applier.applyPatch(p);
      if (ok) applied.push({ proposal: p, appliedTo: p.suggested.sourceFile });
    }
  }

  return { mode, applied, patchesDir: path.relative(process.cwd(), path.join('reports','ai','locator-healing-patches')) };
};

agent.rollback = async function rollback(backupRoot) {
  if (!backupRoot) return { error: 'backupRoot required' };
  const applier = new LocatorApplier();
  const restored = await applier.restoreFromBackup(backupRoot);
  return { restored };
};

// run supports modes: 'recommend' (RAG), 'analyze' (static), 'apply' (apply low-risk)
agent.run = async function run(input = {}) {
  // Resolve mode FIRST to avoid TDZ ReferenceError
  const mode = input.mode || 'recommend';

  // Strategy Pattern: engine mode delegates to HealingAgent (LocatorHealingEngine-based)
  if (mode === "engine") {
    console.log("[locatorHealingAgent] Delegating to engine strategy (HealingAgent)");
    const engine = getHealingAgent();
    if (engine) {
      try {
        const engineResult = await engine.run(input);
        return engineResult;
      } catch (err) {
        console.warn("[locatorHealingAgent] Engine strategy failed, falling back to RAG:", err.message);
      }
    } else {
      console.warn("[locatorHealingAgent] HealingAgent unavailable, falling back to RAG");
    }
  }

  if (mode === 'recommend') {
    // RAG recommend mode — catch Ollama/Chroma failures and fall back to static analysis
    try {
      const r = await agent.suggestWithRag(input);
      if (r && r.response) return r.response;
      if (r && r.reason) return r.reason;
      return r;
    } catch (ragErr) {
      console.warn("[locatorHealingAgent] RAG recommend failed (" + ragErr.message + "), falling back to static analysis");
      const analysisResult = await agent.analyzeFailures(input);
      return analysisResult;
    }
  }

  if (mode === 'analyze') {
    return agent.analyzeFailures(input);
  }
  if (mode === 'apply') {
    return agent.applySafeFixes({ mode: input.dryRun ? 'dry-run' : 'apply', proposalsFile: input.proposalsFile });
  }
  return { error: 'unknown mode' };
};

module.exports = agent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Locator Healing Agent",
  "version": "1.0.0",
  "description": "RAG-based locator healing recommendations with static analysis fallback",
  "dependencies": [
    "failureAnalysisAgent"
  ],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "healing",
    "rag"
  ],
  "executionStage": "analysis",
  "priority": 70,
  "conditions": [
    {
      "type": "hasFailures"
    },
    {
      "type": "locatorFailure"
    }
  ],
  "retryPolicy": {
    "maxRetries": 1,
    "backoff": "none"
  },
  "strategy": "owner",
  "responsibilities": ["locator-healing"],
  "strategies": ["HealingAgent"],
  "lifecycle": "active"
};
