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
