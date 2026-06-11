# AMAZONWEBMOBILEPLAYWRIGHTAUTOMATION

Unified enterprise automation framework for Amazon India using Playwright, JavaScript, Cucumber BDD, Page Object Model, Jenkins, GitHub Actions, Allure reporting, AI agents, and Vector DB support.

Application under test:

```text
https://www.amazon.in/
```

## Framework Stack

- JavaScript
- Playwright
- Cucumber BDD
- Page Object Model
- Appium mobile scaffold for Android and iOS
- Cucumber HTML and Allure reporting
- Jenkins pipeline
- GitHub Actions
- AI agent architecture
- ChromaDB-backed retrieval and RAG agents

## Project Structure

```text
features/              Cucumber feature files
step-definitions/      Cucumber step definitions
pages/                 Amazon page objects
hooks/                 Browser, context, screenshot, video, and trace lifecycle
config/                Runtime configuration
utils/                 Reporting, validation, and execution utilities
test-data/             Amazon-specific test data
reports/               Generated reports and artifacts
framework/             Web/mobile/common abstraction layer
mobile/                Appium mobile scaffolding
ai/                    AI agents, prompts, workflows, MCP, memory, Vector DB
```

## Setup

```bash
npm install
npx playwright install
```

Use `.env.example` as the reference environment file.

Important values:

```text
APP_NAME=Amazon India
BASE_URL=https://www.amazon.in
TEST_PLATFORM=WEB
BROWSER=chromium
HEADLESS=false
```

## Test Execution

Default AI-enriched Cucumber execution:

```bash
npm test
```

Plain Cucumber execution without AI service validation or post-test agents:

```bash
npm run test:core
```

Smoke tests:

```bash
npm run test:smoke
```

Regression tests:

```bash
npm run test:regression
```

Amazon web execution:

```bash
npm run test:web
```

Search results feature:

```bash
npm run test:search-results
```

Product details feature:

```bash
npm run test:product
```

Cart feature:

```bash
npm run test:cart
```

## Reports

Generate Cucumber HTML report:

```bash
npm run report
```

Generate and open Allure report:

```bash
npm run allure:generate
npm run allure:open
```

Generated artifacts are stored under:

```text
reports/
allure-results/
allure-report/
```

## Amazon Test Coverage

Current Amazon India scenarios cover:

- Home page load
- Amazon logo visibility
- Search box visibility
- Product search
- Search results page
- Search result product cards
- Opening first product from search result
- Product details page
- Product title, price, and rating checks
- Add product to cart if available
- Cart page and empty-cart validation
- Proceed-to-buy button if cart has items

Amazon can show captcha, location prompts, sign-in prompts, or availability changes. Those conditions may require headed debugging or test data adjustment.

## Unified Web And Mobile Execution

Web:

```bash
npm run test:web
```

Android:

```bash
npm run test:android
```

iOS:

```bash
npm run test:ios
```

All platforms:

```bash
npm run test:all
```

Mobile execution requires Appium 2, the relevant Appium driver, and valid device/app capability values in the environment files.

## AI Agents

The AI layer is kept under `ai/`. `npm test` and `npm run test:ai` validate ChromaDB
and embeddings, run Cucumber, ingest artifacts, and perform failure RAG when failures exist.
Use `npm run test:core` when intentionally running without AI services.

Common commands:

```bash
npm run ai:testcases
npm run ai:feature
npm run ai:steps
npm run ai:page
npm run ai:jenkins
npm run ai:review
npm run ai:heal
npm run ai:all
npm run test:ai
```

AI output files are generated under:

```text
ai/output/
ai/memory/
reports/ai/
```

## ChromaDB And RAG

The AI path requires a healthy ChromaDB service, a real embedding API, and a real
OpenAI-compatible chat completion API. It does not use local hash vectors or mock responses.

Prerequisites:

- Docker with the Compose plugin, or an externally managed ChromaDB endpoint
- `OPENAI_API_KEY`, or separate `EMBEDDING_API_KEY` plus the LLM credential
- Jenkins credential ID `openai-api-key` for the supplied pipeline

Start ChromaDB:

```bash
npm run vector:start
npm run vector:health
```

Ingest framework knowledge:

```bash
npm run vector:ingest
```

Search similar failures:

```bash
npm run vector:search -- --type failures --query "locator timeout element not visible"
```

Production validation:

```bash
npm run vector:test
npm run rag:test
npm run ai:test
```

See `docs/AI_RAG_MIGRATION.md` for architecture, impacted files, and rollout details.

Analyze failures with Vector DB context:

```bash
npm test
npm run ai:analyze-failures
```

Generate feature scenarios from `ai/input/requirement.txt`:

```bash
npm run ai:generate-tests
```

## Jenkins

The included `Jenkinsfile` supports:

- Web execution
- Android execution
- iOS execution
- Parallel platform execution
- Report artifact publishing
- Allure report publishing
- AI report artifact publishing

Typical flow:

```text
Checkout
Install dependencies
Install Playwright browsers
Run selected test platform
Generate reports
Archive reports, screenshots, traces, and AI artifacts
```

## AppiumAgent

`AppiumAgent` automatically manages the local Appium server for Android and iOS execution. Web Playwright execution does not use it.

Why it is used:

- Avoids manually starting Appium before every mobile run.
- Reuses an already-running Appium server when one exists.
- Starts Appium only when the configured `/status` endpoint is unavailable.
- Stops Appium only when this framework started it.
- Captures Appium server logs at `mobile/logs/appium-server.log`.

Local commands:

```bash
npm run appium:status
npm run appium:start
npm run appium:stop
npm run test:android
npm run test:ios
```

Mobile test flow:

```text
Cucumber BeforeAll
AppiumAgent checks http://127.0.0.1:4723/status
If Appium is running, reuse it
If Appium is not running and APPIUM_AUTO_START=true, start it
Run Android/iOS scenarios
Cucumber AfterAll stops Appium only if this framework started it
```

Jenkins flow:

```text
Install dependencies
Run web tests without AppiumAgent
Run Android/iOS tests with AppiumAgent preflight
Archive reports and mobile/logs/appium-server.log
```

Troubleshooting:

- If port `4723` is already used by Appium, the framework reuses it.
- If port `4723` is used by something that is not healthy Appium, the run fails clearly instead of killing that process.
- If startup times out, check `APPIUM_START_TIMEOUT` and `mobile/logs/appium-server.log`.
- Set `APPIUM_AUTO_START=false` if you want to manage Appium manually.
- Set `APPIUM_AUTO_STOP=false` if you want the framework-started Appium server to remain running after tests.

## GitHub Actions

Workflow files are under `.github/workflows/`:

```text
web.yml
android.yml
ios.yml
```

Each workflow installs dependencies, runs the relevant platform tests, and uploads report artifacts.

## Migration Validation

Run this command after migration changes:

```bash
npm run validate:migration
```

It scans for old application references and fails if any are found.

## Interview Explanation

This is a reusable Cucumber BDD Playwright framework using Page Object Model. Feature files describe business-readable Amazon India scenarios. Step definitions call Amazon page object methods. Page objects contain stable locators and page-specific actions. Hooks manage browser lifecycle, screenshots, videos, and traces. Config is environment-driven, reports are generated through Cucumber/Allure, CI/CD is available through Jenkins and GitHub Actions, and AI/Vector DB modules provide optional failure analysis and test generation support.
