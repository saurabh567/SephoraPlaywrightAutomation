# AMAZONWEBMOBILEPLAYWRIGHTFRAMEWORK

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
- ChromaDB/local Vector DB support

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

Default Cucumber execution:

```bash
npm test
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

The AI layer is kept under `ai/` and remains independent from normal `npm test` execution unless you run AI-specific scripts.

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

## Vector DB Support

The framework supports ChromaDB locally first, with a local JSON fallback for demos when ChromaDB is not running.

Start ChromaDB:

```bash
npm run vector:start
```

Ingest framework knowledge:

```bash
npm run vector:ingest
```

Search similar failures:

```bash
npm run vector:search -- --type failures --query "locator timeout element not visible"
```

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
