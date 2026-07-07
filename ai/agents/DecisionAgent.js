// DecisionAgent - Makes autonomous decisions about test execution strategy,
// then generates the Playwright CLI command via PlaywrightCommandBuilder.
//
// Decides: platform, workers, retries, headless, projects, tags, shards,
//          browser, tracing, video, screenshots, timeout, reporter, output folder.
//
// Flow:
//   Input → DecisionEngine.evaluate() → Context Analysis
//   → Parameter Decisions → PlaywrightCommandBuilder.build() → CanonicalCommand
//   → Execute via PlaywrightExecutionEngine
//
// Dependencies: DecisionEngine, PlaywrightCommandBuilder, PlaywrightExecutionEngine

const fs = require('fs-extra');
const path = require('path');
const DecisionEngine = require('../core/DecisionEngine');
const commandBuilder = require('../core/PlaywrightCommandBuilder');
const executionEngine = require('../core/PlaywrightExecutionEngine');

const BaseAgent = require('./baseAgent');

const agent = new BaseAgent({
  name: 'Decision Agent',
  role: 'Evaluate inputs, decide execution parameters, generate Playwright CLI commands, and execute tests.',
  promptFile: 'test-case-generation.prompt.md',
  outputType: 'Decision rationale, Playwright CLI command, and execution results'
});

agent.run = async function run(input) {
  if (!input) input = {};
  console.log('[DecisionAgent] Evaluating inputs and making execution decisions');

  // ─── Build decision object ───────────────────────────────────────────────
  var decision = {
    timestamp: new Date().toISOString(),
    context: {},
    decisions: [],
    rationale: [],
    executionPlan: {
      platform: null,
      workers: null,
      retries: null,
      headless: null,
      project: null,
      tags: null,
      shard: null,
      browser: null,
      trace: null,
      video: null,
      screenshot: null,
      timeout: null,
      reporter: null,
      outputFolder: null
    },
    commands: [],
    result: null
  };

  // ─── Evaluate with DecisionEngine ────────────────────────────────────────
  var engineDecisions;
  try {
    var engine = new DecisionEngine();
    engineDecisions = await engine.evaluate(input);
  } catch (engineErr) {
    console.warn('[DecisionAgent] DecisionEngine evaluate failed: ' + engineErr.message);
    engineDecisions = {
      agents: { always: [], conditional: [], skip: [] },
      llm: { strategy: 'rag', model: 'default', temperature: 0.2 },
      healing: { primary: 'rag', mode: 'recommend' },
      retry: { maxRetries: 0, backoff: 'none' },
      pipeline: { stages: [] },
      context: { risk: { level: 'unknown', score: 0 }, priority: 'normal' },
      timestamp: new Date().toISOString()
    };
  }

  var engineCtx = engineDecisions && engineDecisions.context ? engineDecisions.context : {};
  decision.engine = engineDecisions;
  decision.context.riskLevel = (engineCtx.risk && engineCtx.risk.level) || 'unknown';
  decision.context.riskScore = (engineCtx.risk && engineCtx.risk.score) || 0;
  decision.context.priority = engineCtx.priority || 'normal';
  decision.context.llmStrategy = (engineDecisions && engineDecisions.llm && engineDecisions.llm.strategy) || 'rag';
  decision.context.healingStrategy = (engineDecisions && engineDecisions.healing && engineDecisions.healing.primary) || 'rag';

  var retryEngine = (engineDecisions && engineDecisions.retry) || {};
  decision.context.retryStrategy = JSON.stringify(retryEngine);

  // ─── Extract parameters from input / env / defaults ─────────────────────
  var platform = (input.platform || process.env.TEST_PLATFORM || 'WEB').toUpperCase();
  var isCI = input.isCI === true || process.env.CI === 'true';
  var riskLevel = decision.context.riskLevel;
  var priority = decision.context.priority;
  var tagsInput = input.tags || process.env.TAGS || '';

  // ═══════════════════════════════════════════════════════════════════════════
  // ║               DECIDE ALL EXECUTION PARAMETERS                         ║
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. PLATFORM ──────────────────────────────────────────────────────────
  var decidedPlatform = platform;
  decision.executionPlan.platform = platform;
  decision.rationale.push({ parameter: 'platform', value: platform, reason: 'Input or TEST_PLATFORM env var' });
  // ── 2. WORKERS (parallelism) ────────────────────────────────────────────
  var workers;
  if (isCI && riskLevel === 'critical') workers = 2;
  else if (isCI) workers = 4;
  else if (riskLevel === 'high' || riskLevel === 'medium') workers = 2;
  else workers = input.workers || 1;
  decision.executionPlan.workers = workers;
  decision.decisions.push({
    area: 'parallelism',
    decision: workers + ' workers',
    confidence: 0.9,
    reason: isCI ? (riskLevel === 'critical' ? 'Critical CI — reduced parallelism for stability' : 'CI — full parallelism') : (riskLevel === 'high' || riskLevel === 'medium' ? 'Elevated risk — moderate parallelism' : 'Local run — single worker')
  });

  // ── 3. RETRIES ─────────────────────────────────────────────────----------
  var retries;
  var retryFromEngine = retryEngine.maxRetries;
  if (retryFromEngine !== undefined && retryFromEngine !== null) retries = retryFromEngine;
  else if (isCI && riskLevel === 'critical') retries = 3;
  else if (isCI) retries = 2;
  else if (riskLevel === 'high') retries = 1;
  else retries = input.retries !== undefined ? input.retries : 0;
  decision.executionPlan.retries = retries;
  decision.decisions.push({
    area: 'retries',
    decision: retries + ' retries',
    confidence: 0.85,
    reason: retries > 0 ? (isCI ? 'CI reliability — auto retry flaky tests' : 'High risk — one retry') : 'No retries needed'
  });

  // ── 4. HEADLESS / HEADED ─────────────────────────────────────────────────
  var headless = input.headless !== undefined ? input.headless : process.env.HEADLESS !== 'false';
  var headed = !headless;
  if (platform === 'ANDROID' || platform === 'IOS') { headed = true; headless = false; }
  if (platform === 'ANDROID' || platform === 'IOS') headed = true;
  // Override for debug
  if (process.env.PWDEBUG) { headed = true; headless = false; }
  decision.executionPlan.headless = headless;
  decision.decisions.push({
    area: 'presentation',
    decision: headed ? 'headed' : 'headless',
    confidence: 0.95,
    reason: headed ? (platform === 'ANDROID' || platform === 'IOS' ? 'Mobile requires headed' : 'Headed mode requested') : 'Headless for speed'
  });

  // ── 5. PROJECT ────────────────────────────────────────────────────────────
  var project = input.project;
  if (!project) {
    if (platform === 'ANDROID') project = 'Android';
    else if (platform === 'IOS') project = 'iOS';
    else if (platform === 'API') project = 'API Tests';
    else if (input.browser === 'firefox') project = 'Web - Firefox';
    else if (input.browser === 'webkit') project = 'Web - WebKit';
    else project = undefined; // Let Playwright decide based on config
  }
  decision.executionPlan.project = project || '(auto)';
  if (project) {
    decision.rationale.push({ parameter: 'project', value: project, reason: 'Platform mapping' });
  }

  // ── 6. TAGS ───────────────────────────────────────────────────────────────
  var tags = tagsInput;
  if (!tags && input.suite) {
    if (input.suite === 'smoke') tags = '@Smoke';
    else if (input.suite === 'regression') tags = '@Regression';
    else if (input.suite === 'sanity') tags = '@Sanity';
  }
  decision.executionPlan.tags = tags || '(none)';
  if (tags) {
    decision.decisions.push({
      area: 'test_selection',
      decision: 'Tags: ' + tags,
      confidence: 0.9,
      reason: 'Filtering tests by tag(s): ' + tags
    });
  }

  // ── 7. SHARDS ─────────────────────────────────────────────────────────────
  var shard = input.shard || null;
  // Auto-shard for large CI runs with many workers
  if (!shard && isCI && workers >= 4 && !project) {
    // Let Playwright handle sharding internally
    shard = null;
  } else if (input.shardCurrent && input.shardTotal) {
    shard = input.shardCurrent + '/' + input.shardTotal;
  }
  decision.executionPlan.shard = shard;
  if (shard) {
    decision.decisions.push({
      area: 'sharding',
      decision: 'Shard ' + shard,
      confidence: 0.85,
      reason: 'Distributing load across shards'
    });
  }

  // ── 8. BROWSER ────────────────────────────────────────────────────────────
  var browser = input.browser || process.env.BROWSER;
  if (!browser) {
    if (platform === 'ANDROID' || platform === 'IOS') browser = 'chromium';
    else if (platform === 'API') browser = undefined;
    else browser = 'chromium'; // web default
  }
  decision.executionPlan.browser = browser || '(config default)';
  if (browser) {
    decision.rationale.push({ parameter: 'browser', value: browser, reason: 'Platform default or input' });
  }

  // ── 9. TRACE ──────────────────────────────────────────────────────────────
  var trace;
  if (input.trace) trace = input.trace;
  else if (riskLevel === 'critical' || (isCI && retries > 0)) trace = 'on';
  else if (isCI) trace = 'retain-on-failure';
  else trace = 'retain-on-failure';
  decision.executionPlan.trace = trace;
  decision.decisions.push({
    area: 'tracing',
    decision: 'Trace: ' + trace,
    confidence: 0.85,
    reason: trace === 'on' ? 'Critical/CI — full tracing for deep analysis' : 'Retain on failure for debugging'
  });

  // ── 10. VIDEO ─────────────────────────────────────────────────────────────
  var video;
  if (input.video) video = input.video;
  else if (riskLevel === 'critical' || (isCI && retries > 0)) video = 'on';
  else if (isCI) video = 'retain-on-failure';
  else video = 'retain-on-failure';
  decision.executionPlan.video = video;
  decision.decisions.push({
    area: 'video',
    decision: 'Video: ' + video,
    confidence: 0.85,
    reason: video === 'on' ? 'Critical CI — record all' : 'Record failures only'
  });

  // ── 11. SCREENSHOTS ──────────────────────────────────────────────────────
  var screenshot;
  if (input.screenshot) screenshot = input.screenshot;
  else if (riskLevel === 'critical') screenshot = 'on';
  else screenshot = 'only-on-failure';
  decision.executionPlan.screenshot = screenshot;
  decision.rationale.push({ parameter: 'screenshot', value: screenshot, reason: riskLevel === 'critical' ? 'Capture all for critical run' : 'Capture failures' });

  // ── 12. TIMEOUT ───────────────────────────────────────────────────────────
  var timeout;
  if (input.timeout) timeout = input.timeout;
  else if (platform === 'ANDROID' || platform === 'IOS') timeout = 180000;
  else if (isCI && riskLevel === 'critical') timeout = 120000;
  else if (isCI) timeout = 60000;
  else timeout = 60000;
  decision.executionPlan.timeout = timeout;
  decision.rationale.push({ parameter: 'timeout', value: timeout + 'ms', reason: timeout > 60000 ? 'Extended for mobile/critical' : 'Standard timeout' });

  // ── 13. REPORTER ─────────────────────────────────────────────────────────
  var reporter;
  if (input.reporter) reporter = input.reporter;
  else if (isCI) reporter = [['github'], ['html', { outputFolder: 'playwright-report' }], ['json', { outputFile: 'reports/playwright-cli/results.json' }]];
  else reporter = [['list'], ['html', { outputFolder: 'playwright-report' }], ['json', { outputFile: 'reports/playwright-cli/results.json' }]];
  decision.executionPlan.reporter = reporter;
  decision.rationale.push({ parameter: 'reporter', value: 'html + json' + (isCI ? ' + github' : ''), reason: isCI ? 'CI-friendly output' : 'Local development output' });

  // ── 14. OUTPUT FOLDER ────────────────────────────────────────────────────
  var outputFolder = input.outputFolder || 'test-results';
  decision.executionPlan.outputFolder = outputFolder;
  decision.rationale.push({ parameter: 'outputFolder', value: outputFolder, reason: 'Artifact storage location' });

  // ═══════════════════════════════════════════════════════════════════════════
  // ║               GENERATE PLAYWRIGHT CLI COMMANDS                        ║
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('[DecisionAgent] Generating Playwright CLI commands from decisions');
  var commands = [];

  // Build parameters for the command builder
  var buildOptions = {
    platform: platform,
    project: project,
    tags: tags || undefined,
    workers: workers,
    retries: retries,
    shard: shard || undefined,
    headed: !headless,
    browser: browser,
    trace: trace,
    video: video,
    screenshot: screenshot,
    timeout: timeout,
    extraArgs: []
  };

  // Add reporter and output folder as extra args since CanonicalCommand
  // doesn't have explicit fields for them (they go in config, not CLI directly)
  var extraArgs = [];
  if (reporter) {
    for (var ri = 0; ri < reporter.length; ri++) {
      var rep = reporter[ri];
      if (Array.isArray(rep)) {
        try { extraArgs.push('--reporter', JSON.stringify(rep)); }
        catch (e) { extraArgs.push('--reporter', rep[0]); }
      } else {
        extraArgs.push('--reporter', rep);
      }
    }
  }
  if (outputFolder) {
    extraArgs.push('--output', outputFolder);
  }
  buildOptions.extraArgs = extraArgs;

  // Primary command
  var primaryCmd = commandBuilder.build(buildOptions);
  primaryCmd.description = 'Primary execution — ' + platform + (tags ? ' [' + tags + ']' : '') + ' | ' + workers + ' workers, ' + retries + ' retries' + (headed ? ', headed' : ', headless');
  commands.push(primaryCmd);
  decision.commands.push(primaryCmd.toJSON());

  // Shard commands if explicit sharding requested
  if (input.shardCurrent && input.shardTotal) {
    for (var si = 1; si <= input.shardTotal; si++) {
      if (si === input.shardCurrent) continue; // Already covered
      var shardCmd = commandBuilder.build({
        ...buildOptions,
        shard: si + '/' + input.shardTotal,
        extraArgs: extraArgs
      });
      shardCmd.description = 'Shard ' + si + '/' + input.shardTotal;
      commands.push(shardCmd);
      decision.commands.push(shardCmd.toJSON());
    }
  }

  // Retry command for high-risk / CI scenarios
  if ((isCI && retries > 0) || riskLevel === 'critical') {
    var retryCmd = commandBuilder.build({
      ...buildOptions,
      retries: Math.max(retries, 1),
      trace: 'on',
      video: 'on',
      screenshot: 'on',
      extraArgs: extraArgs,
      description: 'Retry with full artifacts'
    });
    retryCmd.description = 'Retry pass — full tracing for failure analysis';
    commands.push(retryCmd);
    decision.commands.push(retryCmd.toJSON());
  }

  console.log('[DecisionAgent] Generated ' + commands.length + ' command(s)');

  // ═══════════════════════════════════════════════════════════════════════════
  // ║               EXISTING EVALUATIONS (preserved)                        ║
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Evaluate if execution plan should proceed
  var planPath = path.join(process.cwd(), 'reports/ai/execution-plan.json');
  if (fs.existsSync(planPath)) {
    try {
      var plan = fs.readJsonSync(planPath);
      decision.context.hasPlan = true;
      decision.context.planSteps = plan.plan ? plan.plan.length : 0;
      decision.decisions.push({
        area: 'execution_plan',
        decision: 'PROCEED',
        confidence: 0.9,
        reason: 'Execution plan exists with defined steps'
      });
    } catch (_) {
      decision.decisions.push({
        area: 'execution_plan',
        decision: 'GENERATE_PLAN',
        confidence: 0.7,
        reason: 'Execution plan file is corrupt, recommend generating one first'
      });
    }
  } else {
    decision.decisions.push({
      area: 'execution_plan',
      decision: 'GENERATE_PLAN',
      confidence: 0.7,
      reason: 'No execution plan found, recommend generating one first'
    });
  }

  // 2. Evaluate test results
  var reportPath = path.join(process.cwd(), 'reports/json/cucumber-report.json');
  if (fs.existsSync(reportPath)) {
    try {
      var report = fs.readJsonSync(reportPath);
      var features = Array.isArray(report) ? report : [];
      var allScenarios = [];
      for (var fi = 0; fi < features.length; fi++) {
        var f = features[fi];
        var elements = f.elements || [];
        for (var ei = 0; ei < elements.length; ei++) {
          if (elements[ei].type === 'scenario') allScenarios.push(elements[ei]);
        }
      }
      var passed = [];
      var failed = [];
      for (var si = 0; si < allScenarios.length; si++) {
        var s = allScenarios[si];
        var steps = s.steps || [];
        var hasFailed = false;
        for (var ti = 0; ti < steps.length; ti++) {
          if (steps[ti].result && steps[ti].result.status === 'failed') {
            hasFailed = true;
            break;
          }
        }
        if (hasFailed) failed.push(s);
        else passed.push(s);
      }
      var passRate = allScenarios.length > 0 ? (passed.length / allScenarios.length) * 100 : 0;

      decision.context.totalScenarios = allScenarios.length;
      decision.context.passed = passed.length;
      decision.context.failed = failed.length;
      decision.context.passRate = passRate;

      if (passRate >= 95) {
        decision.decisions.push({ area: 'test_quality', decision: 'HIGH_QUALITY', confidence: 0.95, reason: 'Pass rate ' + passRate.toFixed(1) + '%' });
      } else if (passRate >= 80) {
        decision.decisions.push({ area: 'test_quality', decision: 'ACCEPTABLE', confidence: 0.80, reason: 'Pass rate ' + passRate.toFixed(1) + '% - investigate failures' });
      } else {
        decision.decisions.push({ area: 'test_quality', decision: 'BLOCKING', confidence: 0.90, reason: 'Pass rate ' + passRate.toFixed(1) + '% - failures need resolution' });
      }
    } catch (e) {
      decision.decisions.push({ area: 'test_quality', decision: 'INCONCLUSIVE', confidence: 0.5, reason: 'Could not parse report: ' + e.message });
    }
  }

  // 3. Evaluate locator healing necessity
  var healingPath = path.join(process.cwd(), 'reports/ai/locator-healing-proposals.json');
  if (fs.existsSync(healingPath)) {
    try {
      var healing = fs.readJsonSync(healingPath);
      var proposals = healing.proposals || [];
      var lowRisk = [];
      var highRisk = [];
      for (var pi = 0; pi < proposals.length; pi++) {
        if (proposals[pi].risk === 'LOW') lowRisk.push(proposals[pi]);
        else highRisk.push(proposals[pi]);
      }
      decision.context.locatorProposals = proposals.length;
      decision.context.lowRiskProposals = lowRisk.length;
      if (lowRisk.length > 0) {
        decision.decisions.push({ area: 'locator_healing', decision: 'APPLY_LOW_RISK', confidence: 0.85, reason: lowRisk.length + ' low-risk locator replacements available' });
      }
      if (highRisk.length > 0) {
        decision.decisions.push({ area: 'locator_healing', decision: 'MANUAL_REVIEW_REQUIRED', confidence: 0.75, reason: highRisk.length + ' medium/high risk proposals need manual review' });
      }
    } catch (_) {}
  }

  // 4. Evaluate release readiness
  var currentPassRate = decision.context.passRate !== undefined ? decision.context.passRate : 0;
  decision.decisions.push({
    area: 'overall_readiness',
    decision: currentPassRate >= 80 ? 'READY_FOR_RELEASE' : 'HOLD_FOR_FIXES',
    confidence: 0.80,
    reason: currentPassRate >= 80
      ? 'Pass rate ' + currentPassRate.toFixed(1) + '% meets release threshold'
      : 'Pass rate ' + currentPassRate.toFixed(1) + '% below 80% threshold'
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ║               EXECUTE (if run flag is set)                            ║
  // ═══════════════════════════════════════════════════════════════════════════

  if (input.execute !== false && input.dryRun !== true) {
    console.log('[DecisionAgent] Executing primary Playwright CLI command');
    try {
      var execResult = await executionEngine.execute({
        platform: platform,
        project: project,
        tags: tags || undefined,
        workers: workers,
        retries: retries,
        shard: shard || undefined,
        headed: !headless,
        browser: browser,
        trace: trace,
        video: video,
        screenshot: screenshot,
        timeout: timeout,
        extraArgs: extraArgs,
        validateEnv: false
      });
      decision.result = execResult.toJSON();
      decision.decisions.push({
        area: 'execution',
        decision: execResult.exitCode === 0 ? 'PASSED' : 'FAILED',
        confidence: execResult.exitCode === 0 ? 0.95 : 0.7,
        reason: 'Exit code ' + execResult.exitCode + ' | ' + execResult.passed + ' passed, ' + execResult.failed + ' failed, ' + execResult.skipped + ' skipped in ' + execResult.durationFormatted
      });
    } catch (execErr) {
      console.warn('[DecisionAgent] Execution failed: ' + execErr.message);
      decision.result = { error: execErr.message, exitCode: -1 };
      decision.decisions.push({
        area: 'execution',
        decision: 'ERROR',
        confidence: 0.5,
        reason: 'Execution error: ' + execErr.message
      });
    }
  } else {
    console.log('[DecisionAgent] Skipping execution (dry-run or execute disabled)');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ║               GENERATE REPORT                                         ║
  // ═══════════════════════════════════════════════════════════════════════════

  var outPath = path.join(process.cwd(), 'reports/ai', 'decision-report.md');
  fs.ensureDirSync(path.dirname(outPath));

  var lines = [];
  lines.push('# Decision Agent Report');
  lines.push('');
  lines.push('Generated: ' + decision.timestamp);
  lines.push('');
  lines.push('## Execution Plan');
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('|-----------|-------|');
  lines.push('| Platform | ' + (decision.executionPlan.platform || '—') + ' |');
  lines.push('| Workers | ' + (decision.executionPlan.workers !== null ? decision.executionPlan.workers : '—') + ' |');
  lines.push('| Retries | ' + (decision.executionPlan.retries !== null ? decision.executionPlan.retries : '—') + ' |');
  lines.push('| Headless | ' + (decision.executionPlan.headless !== null ? decision.executionPlan.headless : '—') + ' |');
  lines.push('| Project | ' + (decision.executionPlan.project || '—') + ' |');
  lines.push('| Tags | ' + (decision.executionPlan.tags || '—') + ' |');
  lines.push('| Shard | ' + (decision.executionPlan.shard || '—') + ' |');
  lines.push('| Browser | ' + (decision.executionPlan.browser || '—') + ' |');
  lines.push('| Trace | ' + (decision.executionPlan.trace || '—') + ' |');
  lines.push('| Video | ' + (decision.executionPlan.video || '—') + ' |');
  lines.push('| Screenshots | ' + (decision.executionPlan.screenshot || '—') + ' |');
  lines.push('| Timeout | ' + (decision.executionPlan.timeout + 'ms' || '—') + ' |');
  lines.push('| Output Folder | ' + (decision.executionPlan.outputFolder || '—') + ' |');
  lines.push('');
  lines.push('## Generated Playwright CLI Commands');
  lines.push('');
  for (var ci = 0; ci < commands.length; ci++) {
    var cmd = commands[ci];
    lines.push('### Command ' + (ci + 1) + ': ' + (cmd.description || 'Playwright CLI'));
    lines.push('');
    lines.push('```bash');
    lines.push(cmd.commandString);
    lines.push('```');
    lines.push('');
    lines.push('- **Platform**: ' + (cmd.platform || '—'));
    lines.push('- **Project**: ' + (cmd.project || '—'));
    lines.push('- **Tags**: ' + (cmd.tags || '—'));
    lines.push('- **Workers**: ' + (cmd.workers || '—'));
    lines.push('- **Retries**: ' + (cmd.retries || '—'));
    lines.push('- **Shard**: ' + (cmd.shard || '—'));
    lines.push('- **Headed**: ' + (cmd.headed ? 'yes' : 'no'));
    lines.push('- **Browser**: ' + (cmd.browser || '—'));
    lines.push('- **Trace**: ' + (cmd.trace || '—'));
    lines.push('- **Video**: ' + (cmd.video || '—'));
    lines.push('- **Screenshot**: ' + (cmd.screenshot || '—'));
    lines.push('- **Timeout**: ' + (cmd.timeout ? cmd.timeout + 'ms' : '—'));
    lines.push('');
  }
  lines.push('## Context');
  lines.push('');
  for (var key in decision.context) {
    if (decision.context.hasOwnProperty(key)) {
      lines.push('- **' + key + '**: ' + decision.context[key]);
    }
  }
  lines.push('');
  lines.push('## Execution Results');
  lines.push('');
  if (decision.result) {
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push('| Exit Code | ' + (decision.result.exitCode !== null && decision.result.exitCode !== undefined ? decision.result.exitCode : '—') + ' |');
    lines.push('| Duration | ' + (decision.result.durationFormatted || '—') + ' |');
    lines.push('| Passed | ' + (decision.result.passed || 0) + ' |');
    lines.push('| Failed | ' + (decision.result.failed || 0) + ' |');
    lines.push('| Skipped | ' + (decision.result.skipped || 0) + ' |');
    lines.push('| Flaky | ' + (decision.result.flaky || 0) + ' |');
    lines.push('| Workers | ' + (decision.result.workers || 0) + ' |');
    lines.push('| HTML Report | ' + (decision.result.htmlReportPath || '—') + ' |');
    lines.push('| JSON Report | ' + (decision.result.jsonReportPath || '—') + ' |');
    if (decision.result.error) lines.push('| Error | ' + decision.result.error + ' |');
  } else {
    lines.push('_Execution skipped (dry-run mode or execution disabled)_');
  }
  lines.push('');
  lines.push('## Decisions');
  lines.push('');
  for (var di = 0; di < decision.decisions.length; di++) {
    var d = decision.decisions[di];
    lines.push('### ' + d.area);
    lines.push('- **Decision**: ' + d.decision);
    lines.push('- **Confidence**: ' + (d.confidence * 100).toFixed(0) + '%');
    lines.push('- **Reason**: ' + d.reason);
    lines.push('');
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('[DecisionAgent] Report written to ' + outPath);

  return {
    ok: true,
    report: path.relative(process.cwd(), outPath),
    decisions: decision.decisions,
    executionPlan: decision.executionPlan,
    commands: decision.commands,
    result: decision.result
  };
};

module.exports = agent;

// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  name: 'Decision Agent',
  version: '2.0.0',
  description: 'Decides execution parameters (platform, workers, retries, headless, project, tags, shards, browser, tracing, video, screenshots, timeout, reporter, output folder) and generates Playwright CLI commands via PlaywrightCommandBuilder. Executes via PlaywrightExecutionEngine.',
  dependencies: ['DecisionEngine', 'PlaywrightCommandBuilder', 'PlaywrightExecutionEngine'],
  platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
  tags: ['decision', 'orchestration', 'playwright-cli'],
  executionStage: 'multi-agent',
  priority: 75,
  conditions: [{ type: 'always' }],
  retryPolicy: { maxRetries: 0, backoff: 'none' },
  lifecycle: 'active'
};
