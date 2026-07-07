# Playwright CLI Integration — Enterprise Architecture

## Overview

Playwright CLI (`npx playwright test`) is now the **official execution engine** of the enterprise AI automation framework. The AI layer (UnifiedOrchestrator, DecisionEngine, AgentRouter, EventBus) remains the intelligent orchestration layer that **controls** Playwright CLI.

Execution flow:

```
User
  │
  ▼
Unified Orchestrator
  │
  ▼
AI Decision Layer (DecisionEngine + AgentRouter)
  │
  ▼
PlaywrightCLIAgent → PlaywrightCLILauncher → Playwright CLI (npx playwright test)
  │
  ▼
Execution (Cucumber BDD via test runner spec)
  │
  ▼
AI Analysis Layer (failure analysis, RCA, healing, vector ingest)
  │
  ▼
Reports (dashboard, HTML, JSON, telemetry)
```

## Architecture

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| PlaywrightCLIAgent | `ai/agents/PlaywrightCLIAgent.js` | Agent registered with AgentRegistry; orchestrator invokes it for CLI execution |
| PlaywrightCLILauncher | `ai/playwright-cli/PlaywrightCLILauncher.js` | Core module that builds & executes `npx playwright test` commands |
| PlaywrightCLIConfig | `ai/playwright-cli/PlaywrightCLIConfig.js` | Configuration profiles for CI, local, debug, smoke, regression, mobile, API |
| CLI Config | `playwright.config.cli.js` | Extended Playwright config for CLI-driven execution |
| Test Runner | `test-runners/playwright-cli-runner.spec.js` | Bridges Playwright CLI to Cucumber BDD feature files |
| Global Setup | `ai/playwright-cli/globalSetup.js` | Pre-flight checks (AI services, Appium) before CLI execution |
| Global Teardown | `ai/playwright-cli/globalTeardown.js` | Post-execution cleanup (Appium stop, vector ingest) |

### EventBus Events (New)

| Event | Description |
|-------|-------------|
| `PlaywrightCLIStarted` | CLI execution initiated |
| `PlaywrightCLICompleted` | CLI execution completed successfully |
| `PlaywrightCLIFailed` | CLI execution failed |
| `PlaywrightCLIConfigSelected` | Profile selected by DecisionEngine |
| `PlaywrightCLIProfileApplied` | Profile configuration applied |

### Config Profiles

| Profile | Use Case | Browsers | Workers | Retries | Headed |
|---------|----------|----------|---------|---------|--------|
| `local` | Local dev | chromium | auto | 0 | yes |
| `ci` | CI pipeline | chromium, firefox, webkit | 4 | 2 | no |
| `ci-critical` | Critical CI | chromium | 2 | 3 | no |
| `debug` | Debugging | chromium | 1 | 0 | yes |
| `smoke` | Quick smoke | chromium | 2 | 1 | no |
| `regression` | Full regression | chromium, firefox, webkit | 4 | 1 | no |
| `performance` | Performance | chromium | 1 | 0 | no |
| `mobile-android` | Android | chromium | 1 | 1 | yes |
| `mobile-ios` | iOS | chromium | 1 | 1 | yes |
| `api` | API tests | chromium | 2 | 1 | no |

## Usage

### Via NPM Scripts

```bash
# Run tests via Playwright CLI (AI-controlled)
npm run test:playwright:cli

# Headed mode
npm run test:playwright:cli:headed

# CI mode (all browsers, retries)
npm run test:playwright:cli:ci

# Debug mode (PWDEBUG, slow timeout)
npm run test:playwright:cli:debug

# Smoke tests
npm run test:playwright:cli:smoke

# AI-orchestrated Playwright CLI (full pipeline)
npm run test:playwright:cli:ai

# Orchestrator with Playwright CLI flag
npm run test:playwright:cli:orchestrate
```

### Via Orchestrator

```bash
# Full pipeline with Playwright CLI engine
node ai/orchestrator/unifiedOrchestrator.js --playwright-cli

# Specific platform
node ai/orchestrator/unifiedOrchestrator.js --platform WEB --playwright-cli

# With env var
PLAYWRIGHT_CLI=true node ai/orchestrator/unifiedOrchestrator.js
```

### Via Direct CLI

```bash
# Direct Playwright CLI execution
npx playwright test --config playwright.config.cli.js

# With profile override
PLAYWRIGHT_CLI=true npx playwright test --config playwright.config.cli.js --headed --workers 2
```

## How It Works

1. **User triggers execution** (npm script, orchestrator CLI, CI pipeline)
2. **UnifiedOrchestrator** starts Phase 0 (pre-flight): AI health checks
3. **AgentRouter** selects execution agents (TestExecutionAgent, PlaywrightCLIAgent)
4. **PlaywrightCLIAgent.run()** is invoked by orchestrator
5. **DecisionEngine** evaluates context (platform, CI mode, risk, failures)
6. **PlaywrightCLIConfig** selects optimal profile based on DecisionEngine output
7. **PlaywrightCLILauncher** builds CLI args and executes `npx playwright test`
8. Playwright CLI runs the test runner spec which bridges to Cucumber BDD
9. Results captured and emitted via EventBus
10. **Phase 2 (AI Analysis)**: Vector ingestion, failure analysis, RCA, healing
11. **Phase 3 (Multi-Agent)**: Impact, anomaly, visual, monitoring agents
12. **Phase 4 (Reporting)**: Dashboard, consolidated reports, telemetry
13. **Phase 5 (Cleanup)**: Appium stop, resource cleanup

## Backward Compatibility

All existing npm scripts, agents, and execution paths remain intact. The Playwright CLI integration is additive:

- `PLAYWRIGHT_CLI=true` env var enables the new execution path
- Existing `npm test`, `npm run test:ai`, etc. continue to use legacy cucumber-js path
- `--playwright-cli` flag on the orchestrator enables CLI mode
- TestExecutionAgent routes to Playwright CLI when `PLAYWRIGHT_CLI=true`
- All 57 AI agents, EventBus, AgentRegistry, DecisionEngine, RAG pipeline unchanged

## Verification

```bash
# Verify Playwright CLI agent is registered
node ai/index.js --info PlaywrightCLIAgent

# List all agents including PlaywrightCLIAgent
node ai/index.js --list

# Dry run with Playwright CLI
PLAYWRIGHT_CLI=true node ai/orchestrator/unifiedOrchestrator.js --dry-run
```
