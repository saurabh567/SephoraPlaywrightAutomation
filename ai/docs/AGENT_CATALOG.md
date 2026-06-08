# Agent Catalog

Each agent has:

- JavaScript implementation under `ai/agents/`
- Prompt template under `ai/prompts/`
- Shared configuration from `ai/config/ai.config.js`
- Shared memory from `ai/memory/shared-memory.json`
- Framework context from `ai/tools/frameworkScanner.js`

## Test Case Generation Agent

- Implementation: `ai/agents/testCaseGenerationAgent.js`
- Prompt: `ai/prompts/test-case-generation.md`
- Input: requirement, user story, acceptance criteria
- Output: Markdown test case table
- Example:

```bash
npm run ai:agent -- --agent testCaseGeneration --requirement "Validate product search"
```

## Feature File Generation Agent

- Implementation: `ai/agents/featureFileGenerationAgent.js`
- Prompt: `ai/prompts/feature-file-generation.md`
- Input: requirement or test cases
- Output: Gherkin feature file content
- Example:

```bash
npm run ai:workflow -- --workflow generateFeatureFromRequirement --requirement "User can search products by brand"
```

## Step Definition Generation Agent

- Implementation: `ai/agents/stepDefinitionGenerationAgent.js`
- Prompt: `ai/prompts/step-definition-generation.md`
- Input: feature file, existing step style, page object context
- Output: JavaScript Cucumber step definition code
- Example:

```bash
npm run ai:agent -- --agent stepDefinitionGeneration --file features/home.feature
```

## Page Object Generation Agent

- Implementation: `ai/agents/pageObjectGenerationAgent.js`
- Prompt: `ai/prompts/page-object-generation.md`
- Input: page requirement, DOM hints, existing BasePage pattern
- Output: JavaScript Page Object class
- Example:

```bash
npm run ai:agent -- --agent pageObjectGeneration --requirement "Create page object for checkout page"
```

## Locator Healing Agent

- Implementation: `ai/agents/locatorHealingAgent.js`
- Prompt: `ai/prompts/locator-healing.md`
- Input: failure log, current locator, DOM/screenshot/trace clues
- Output: ranked locator replacement suggestions
- Example:

```bash
npm run ai:workflow -- --workflow healBrokenLocator --file failure.log
```

## Test Data Generation Agent

- Implementation: `ai/agents/testDataGenerationAgent.js`
- Prompt: `ai/prompts/test-data-generation.md`
- Input: data requirement or schema
- Output: JSON test data
- Example:

```bash
npm run ai:agent -- --agent testDataGeneration --requirement "Generate pincode and product search test data"
```

## Failure Analysis Agent

- Implementation: `ai/agents/failureAnalysisAgent.js`
- Prompt: `ai/prompts/failure-analysis.md`
- Input: Cucumber output, Playwright error, screenshot notes, trace notes
- Output: failure diagnosis
- Example:

```bash
npm run ai:agent -- --agent failureAnalysis --file failure.log
```

## Root Cause Analysis Agent

- Implementation: `ai/agents/rootCauseAnalysisAgent.js`
- Prompt: `ai/prompts/root-cause-analysis.md`
- Input: failure analysis and evidence
- Output: RCA category, confidence, remediation
- Example:

```bash
npm run ai:agent -- --agent rootCauseAnalysis --file failure-analysis.md
```

## Report Summarization Agent

- Implementation: `ai/agents/reportSummarizationAgent.js`
- Prompt: `ai/prompts/report-summarization.md`
- Input: Cucumber JSON, Allure summary, Jenkins output
- Output: stakeholder-ready execution summary
- Example:

```bash
npm run ai:workflow -- --workflow summarizeExecutionReport --file reports/json/cucumber-report.json
```

## Jenkins Build Failure Analysis Agent

- Implementation: `ai/agents/jenkinsBuildFailureAnalysisAgent.js`
- Prompt: `ai/prompts/jenkins-build-failure-analysis.md`
- Input: Jenkins console log
- Output: failed stage, cause, proof, fix steps
- Example:

```bash
npm run ai:workflow -- --workflow analyzeJenkinsBuild --file jenkins-console.txt
```

## API Test Generation Agent

- Implementation: `ai/agents/apiTestGenerationAgent.js`
- Prompt: `ai/prompts/api-test-generation.md`
- Input: endpoint requirement, OpenAPI snippet, API contract
- Output: API test plan and Playwright request code
- Example:

```bash
npm run ai:agent -- --agent apiTestGeneration --requirement "Generate tests for GET /products search API"
```

## Playwright Code Review Agent

- Implementation: `ai/agents/playwrightCodeReviewAgent.js`
- Prompt: `ai/prompts/playwright-code-review.md`
- Input: framework scan or changed files
- Output: prioritized code review findings
- Example:

```bash
npm run ai:agent -- --agent playwrightCodeReview
```

## Self-Healing Automation Agent

- Implementation: `ai/agents/selfHealingAutomationAgent.js`
- Prompt: `ai/prompts/self-healing-automation.md`
- Input: failure analysis, RCA, locator candidates
- Output: safe healing patch plan
- Example:

```bash
npm run ai:workflow -- --workflow healBrokenLocator --file failure.log
```
