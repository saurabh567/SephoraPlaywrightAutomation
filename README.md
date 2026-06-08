# Sephora Playwright Automation Framework

Industry-standard JavaScript automation framework built using Playwright, Cucumber BDD, Page Object Model, environment-based configuration, reporting, logging, Jenkins, and GitHub Actions.

## Tech Stack

- Playwright
- JavaScript
- Cucumber BDD
- Node.js
- Page Object Model
- Jenkins CI/CD
- GitHub Actions
- AI-assisted automation agents

## Folder Structure

For a file-by-file explanation, see [`FRAMEWORK_GUIDE.md`](FRAMEWORK_GUIDE.md).

```text
features/              Gherkin feature files
step-definitions/      Reusable Cucumber step definitions
pages/                 Page Object Model classes
utils/                 Config reader, logger, reports cleaner, report generator
hooks/                 Global Before/After hooks for browser, context, page, screenshots, videos, and traces
config/                Environment configuration
test-data/             JSON based test data
reports/               JSON, HTML, screenshots, videos, traces
screenshots/           Optional screenshot output folder
videos/                Optional video output folder
logs/                  Execution logs
.github/workflows/     GitHub Actions workflow
Jenkinsfile            Jenkins pipeline
```

## Setup

```bash
npm install
npx playwright install
```

## Execution Commands

```bash
npm test
npm run test:smoke
npm run test:regression
npm run test:login
npm run test:parallel
npm run test:parallel:2
npm run test:cross-browser
npm run test:cross-browser:smoke
npm run test:headed
npm run test:firefox
npm run test:webkit
npm run report
```

Run with a custom worker count:

```bash
PARALLEL=3 npm test
```

Run cross-browser tests:

```bash
npm run test:cross-browser
BROWSERS=chromium,firefox npm run test:cross-browser
TAGS=@smoke npm run test:cross-browser
```

## Environment Configuration

Update `.env`:

```env
ENV=dev
BASE_URL=https://sephora.in
BROWSER=chromium
HEADLESS=false
TIMEOUT=30000
RETRIES=1
PARALLEL=2
```

Supported browsers:

```text
chromium
firefox
webkit
```

Supported environments:

```text
dev
qa
stage
```

## Test Coverage Added

This framework includes 50 BDD scenarios based on the provided Sephora screenshots:

1. Home page
2. Makeup Face listing page
3. Product details page
4. Shopping bag page

Coverage includes positive and negative checks, smoke tags, regression tags, product listing, product details, cart summary, header navigation, filters, and delivery section validation.

## Reporting

After execution, reports are available under:

```text
reports/json/cucumber-report.json
reports/html/cucumber-report.html
reports/html/cucumber-html-report.html
reports/screenshots/
reports/videos/worker-<id>/
reports/traces/
reports/cross-browser/chromium/
reports/cross-browser/firefox/
reports/cross-browser/webkit/
logs/execution.log
```

## AI-Assisted Automation

The AI layer lives under [`ai/`](ai/) and is intentionally simple for interview demos. It works in two modes:

```text
MOCK_MODE=true   Local rule-based output, no API key required.
MOCK_MODE=false  Uses OPENAI_API_KEY from .env with an OpenAI-compatible API.
```

### AI Concepts

An LLM, or Large Language Model, is the AI model that understands requirements, code, logs, reports, and failures. In this framework, it can generate test cases, feature files, step definitions, page objects, reviews, and failure analysis.

An AI Agent is a focused automation helper with one responsibility. For example, `TestCaseGenerationAgent` creates test cases, while `SelfHealingAutomationAgent` suggests better locators.

Agentic AI means multiple agents run in a controlled workflow. Here, `ai/core/AgentRunner.js` can run one agent, all agents, or post-test AI analysis after Cucumber execution.

MCP servers are used to safely provide external context to AI agents, such as file system data, GitHub pull requests, Jenkins logs, browser state, Playwright traces, or documentation. This beginner layer does not require real paid MCP setup, but the architecture can later connect to MCP servers when the framework becomes more advanced.

### Agents In This Framework

```text
TestCaseGenerationAgent
FeatureFileGenerationAgent
StepDefinitionGenerationAgent
PageObjectGenerationAgent
JenkinsBuildFailureAnalysisAgent
PlaywrightCodeReviewAgent
SelfHealingAutomationAgent
```

Every agent prints clear execution logs:

```text
[AI] Starting AgentName
[AI] Reading input from ...
[AI] Generating output ...
[AI] Completed AgentName
```

### Run AI Agents

```bash
npm run ai:testcases
npm run ai:feature
npm run ai:steps
npm run ai:page
npm run ai:jenkins
npm run ai:review
npm run ai:heal
npm run ai:all
```

Run AI-integrated tests:

```bash
npm test
npm run test:ai
```

`npm test` runs normal Cucumber tests only. `npm run test:ai` runs Cucumber first and then runs post-test AI analysis. Even if tests fail, AI analysis still runs and the original Cucumber exit code is preserved.

Generated AI proof files:

```text
ai/output/generated-test-cases.md
ai/output/generated-feature.feature
ai/output/generated-step-definitions.js
ai/output/generated-page-object.js
ai/output/jenkins-failure-analysis.md
ai/output/code-review-report.md
ai/output/self-healing-suggestions.md
ai/output/ai-post-test-summary.md
ai/memory/agent-run-history.json
```

Main AI implementation files:

```text
ai/core/BaseAgent.js
ai/core/AgentRunner.js
ai/core/LLMClient.js
ai/index.js
```

### Multi-Page Requirement Generation

You can put multiple page requirements in one file:

```text
ai/input/requirement.txt
```

Example:

```text
1. Home page: Verify all footer links have unique URLs.
2. Cart page: Verify cart item quantity can be increased.
3. Product details page: Verify product price and Add To Bag button.
4. Checkout page: Verify user can see payment options.
```

Then run:

```bash
npm run ai:testcases
npm run ai:feature
npm run ai:steps
```

The AI layer classifies requirements by page area and creates draft feature files:

```text
ai/output/generated-feature.feature
ai/output/generated-features/home.feature
ai/output/generated-features/cart.feature
ai/output/generated-features/product_details.feature
ai/output/generated-features/checkout.feature
```

These files are draft AI output. Review them first, then copy approved scenarios into the real executable files under `features/`.

## Jenkins Steps

1. Install NodeJS plugin in Jenkins.
2. Configure NodeJS tool name as `NodeJS`.
3. Create a pipeline job.
4. Connect your GitHub repository.
5. Use the included `Jenkinsfile`.
6. Run the build.
7. Check archived artifacts and Cucumber HTML report.

## Interview Explanation

This is a Cucumber BDD Playwright framework using Page Object Model. Feature files contain business-readable Gherkin scenarios. Step definitions directly create the required page class, for example `const homePage = new HomePage(this.page)`, and then call page action methods like `homePage.searchProduct()`. Page classes contain locators and page-specific actions, while `BasePage` contains reusable methods like `open`, `click`, `fill`, and `verifyVisible`. Configuration is managed through `.env`, test data is maintained separately in JSON files, and global hooks manage browser, context, page, screenshot, video, and trace lifecycle. Parallel execution is controlled by the `PARALLEL` environment variable, and worker-specific artifacts are saved with the worker id to avoid collisions. The framework is CI/CD ready through Jenkinsfile and GitHub Actions.
