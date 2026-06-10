# AI Automation Layer

This folder turns the existing Playwright + Cucumber + Page Object framework into an AI-assisted automation platform.

## Folder Structure

```text
ai/
  agents/      Specialized automation agents
  config/      AI provider and framework path configuration
  docs/        Architecture diagrams and implementation notes
  mcp/         MCP server usage design
  memory/      Shared agent memory
  output/      Generated AI artifacts
  prompts/     Prompt templates
  tools/       Local tools used by agents
  workflows/   Multi-agent workflow orchestration
```

## Environment

```env
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=4000
```

If `OPENAI_API_KEY` is missing, agents run in dry-run mode and return prompt previews.

## Agent Usage

```bash
npm run ai:agent -- --agent testCaseGeneration --requirement "Validate Amazon India search for valid and invalid products"
npm run ai:agent -- --agent playwrightCodeReview
npm run ai:agent -- --agent jenkinsBuildFailureAnalysis --file jenkins-console.txt
```

## Workflow Usage

```bash
npm run ai:workflow -- --workflow generateFeatureFromRequirement --requirement "User can search products by brand"
npm run ai:workflow -- --workflow healBrokenLocator --file failure.log
npm run ai:workflow -- --workflow analyzeJenkinsBuild --file jenkins-console.txt
npm run ai:workflow -- --workflow summarizeExecutionReport --file reports/json/cucumber-report.json
npm run ai:workflow -- --workflow generateDefectReport --file failure.log
```

Outputs are written to:

```text
ai/output/
```

## Runtime Integration

`npm test` now runs:

```text
utils/runCucumberWithAi.js
  -> npx cucumber-js --config cucumber.js
  -> ai/workflows/runPostExecutionAgents.js
  -> FailureAnalysisAgent
  -> ReportSummaryAgent
  -> ExecutionMemoryAgent
```

Generated post-execution artifacts:

```text
ai/output/failure-summary.md
ai/output/execution-summary.md
ai/memory/execution-history.json
```

Disable AI post-processing for a run:

```bash
AI_POST_TEST=false npm test
```

## Documentation

```text
ai/docs/ARCHITECTURE.md
ai/docs/AGENT_CATALOG.md
ai/docs/WORKFLOWS.md
ai/mcp/mcp.config.json
```
