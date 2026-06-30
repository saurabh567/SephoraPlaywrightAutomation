# Amazon Web & Mobile Playwright Automation Framework

A unified test automation framework for **Web**, **Android**, and **iOS** platforms using **Playwright**, **Cucumber BDD**, **AI agents**, **LLMs**, **RAG**, **self-healing**, and **JMeter performance testing**.

> **Note:** Additional internal AI phase notes may exist under `ai/`, but this root `README.md` is the main document for understanding and using the framework.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack & Tools](#tech-stack--tools)
- [Folder Structure](#folder-structure)
- [Web Automation](#web-automation)
- [Android Automation](#android-automation)
- [iOS Automation](#ios-automation)
- [Cucumber BDD](#cucumber-bdd)
- [Page Object Model (POM)](#page-object-model-pom)
- [AI Agents](#ai-agents)
- [LLM (Large Language Models)](#llm-large-language-models)
- [RAG (Retrieval-Augmented Generation)](#rag-retrieval-augmented-generation)
- [ChromaDB / Vector Database](#chromadb--vector-database)
- [Self-Healing](#self-healing)
- [JMeter Performance Testing](#jmeter-performance-testing)
  - [Purpose](#purpose)
  - [Folder Structure](#jmeter-folder-structure)
  - [Test Plan](#test-plan)
  - [Configuration](#configuration)
  - [Commands](#jmeter-commands)
  - [Thresholds & Build Failure](#thresholds--build-failure)
- [AI JMeter Analysis Agent](#ai-jmeter-analysis-agent)
  - [Purpose](#ai-analysis-purpose)
  - [Issue Classification](#issue-classification)
  - [Report](#ai-analysis-report)
- [Reports](#reports)
  - [Cucumber HTML Reports](#cucumber-html-reports)
  - [AI Reports](#ai-reports)
  - [JMeter Reports](#jmeter-reports)
- [Commands](#commands)
- [Environment Variables](#environment-variables)
- [GitHub Secrets Safety](#github-secrets-safety)
- [Jenkins / CI-CD](#jenkins--ci-cd)
- [GitHub Actions](#github-actions)
- [Troubleshooting](#troubleshooting)
- [Demo Guide](#demo-guide)
- [Interview Explanation](#interview-explanation)
- [Final Framework Summary](#final-framework-summary)

---

## Project Overview

This framework allows you to run automated tests on:
- **Web** (Chrome, Firefox, Safari, Edge via Playwright)
- **Android** (native apps via Appium + Playwright)
- **iOS** (native apps via Appium + Playwright)
- **Performance** (JMeter load testing for API/HTTP performance)

Tests are written in **Gherkin** (Cucumber) and implemented using the **Page Object Model**.  
The framework includes **AI-powered features** such as:
- AI-generated test steps and self-healing locators
- LLM integration for natural-language understanding
- RAG pipeline to retrieve relevant past test data
- ChromaDB for storing and querying vector embeddings
- **JMeter performance test execution with AI-driven analysis**

---

## Tech Stack & Tools

| Tool / Library       | Purpose                              |
|----------------------|--------------------------------------|
| Playwright           | Browser & mobile automation          |
| Appium               | Android / iOS native app automation  |
| Cucumber (BDD)       | Gherkin feature files & step defs    |
| Node.js              | Runtime                              |
| ChromaDB             | Vector database for AI context       |
| OpenAI / LLM API     | Natural language & self-healing      |
| dotenv               | Environment variable management      |
| Jenkins              | CI/CD pipeline                       |
| GitHub Actions       | Optional CI                          |
| **Apache JMeter**    | **Performance/load testing**         |

---

## Folder Structure

```
.
├── README.md                    # This file (main documentation)
├── ai/                          # Internal AI phase notes (see ai/README.md)
├── config/                      # Environment-specific config files
├── features/                    # Cucumber feature files (.feature)
├── step-definitions/            # Step definition files
├── pages/                       # Page Object classes
├── framework/                   # Core framework utilities
├── hooks/                       # Cucumber hooks (Before, After, etc.)
├── utils/                       # Helper functions
├── test-data/                   # Test data (JSON, CSV, etc.)
├── mobile/                      # Mobile app configs & capabilities
├── generated-features/          # AI-generated feature files
├── performance/                 # JMeter performance tests
│   ├── jmeter/
│   │   ├── plans/               # JMeter test plans (.jmx)
│   │   ├── data/                # Test data for JMeter (CSV, etc.)
│   │   └── config/              # JMeter configuration properties
├── scripts/                     # Helper scripts (runJMeter.js, etc.)
├── reports/                     # Test output reports
│   ├── jmeter/                  # JMeter reports
│   │   ├── jtl/                 # Raw JTL result files
│   │   ├── html/                # JMeter HTML dashboard
│   │   └── summary/             # JSON + Markdown summaries
│   ├── ai/                      # AI analysis reports
│   └── ...
├── chroma/                      # ChromaDB persistence
├── screenshots/                 # Failure screenshots
├── videos/                      # Test recordings
├── logs/                        # Execution logs
├── docs/                        # Additional documentation
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Example env template
├── package.json                 # Dependencies & scripts
├── playwright.config.js         # Playwright configuration
├── cucumber.js                  # Cucumber configuration
├── Jenkinsfile                  # Jenkins pipeline definition
└── .github/                     # GitHub Actions workflows
```

---

## Web Automation

- Uses **Playwright** for cross-browser testing (Chromium, Firefox, WebKit).
- Tests are written in Gherkin and placed under `features/`.
- Page Objects are stored in `pages/`.
- Configuration is in `playwright.config.js`.

**Example command:**
```bash
npm run test:web
```

---

## Android Automation

- Uses **Appium** + **Playwright** (via Appium's Playwright integration or WebDriverAgent).
- Native Android apps are tested on emulators or real devices.
- Capabilities are defined in `mobile/android/`.
- Android-specific step definitions are in `step-definitions/android/`.

**Prerequisites:**
- Appium server running (`appium`)
- Android emulator or real device connected
- `adb` available

**Example command:**
```bash
npm run test:android
```

---

## iOS Automation

- Uses **Appium** + **XCUITest** + **Playwright** integration.
- Native iOS apps tested on simulator or real device.
- Capabilities defined in `mobile/ios/`.

**Prerequisites:**
- macOS with Xcode installed
- Appium server running (`appium`)
- iOS simulator booted or real device connected

**Example command:**
```bash
npm run test:ios
```

---

## Cucumber BDD

- Tests are written in **Gherkin** syntax (Given-When-Then).
- Feature files: `features/*.feature`
- Step definitions: `step-definitions/*.js`
- Hooks (Before/After scenarios): `hooks/`
- Cucumber configuration: `cucumber.js`

**Example feature file:**
```gherkin
Feature: Search on Amazon

  Scenario: Search for a product
    Given I am on the Amazon homepage
    When I search for "Playwright book"
    Then I see results containing "Playwright"
```

---

## Page Object Model (POM)

- Every page or screen has a dedicated class in `pages/`.
- Locators and page methods are encapsulated.
- Example: `pages/HomePage.js`, `pages/LoginPage.js`.
- Mobile variants: `pages/android/`, `pages/ios/`.

**Page Object example (pseudocode):**
```javascript
class LoginPage {
  constructor(page) {
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.loginButton = page.locator('#loginBtn');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
```

---

## AI Agents

- AI agents generate test steps, suggest locators, and fix broken tests.
- Located in `ai/` (notes) and integrated via `utils/` or `framework/` modules.
- Agents use **LLM APIs** to interpret natural language and produce Gherkin steps.
- Helps reduce manual effort in test creation and maintenance.
- **New:** `jmeterPerformanceAnalysisAgent.js` — AI agent for analyzing JMeter performance results.

---

## LLM (Large Language Models)

- The framework connects to an LLM (e.g., OpenAI GPT) for:
  - Generating feature files from plain English descriptions
  - Suggesting locators when elements change
  - Explaining failures in plain language
  - **Analyzing JMeter performance reports and suggesting fixes**
- LLM configuration (model name, temperature, etc.) is in environment variables.

---

## RAG (Retrieval-Augmented Generation)

- RAG improves LLM responses by retrieving relevant context from past test runs.
- When the LLM needs to fix a test, it first queries ChromaDB for similar past failures.
- The retrieved context is injected into the LLM prompt for better accuracy.

**Flow:**
1. Test fails.
2. Framework queries ChromaDB for similar error + locator context.
3. Retrieved context is combined with the prompt.
4. LLM generates a fix suggestion.

---

## ChromaDB / Vector Database

- **ChromaDB** stores vector embeddings of:
  - Test step descriptions
  - Locator strings
  - Error messages
  - Fix suggestions
  - Performance test summaries (for trend analysis)
- Used by the RAG pipeline.
- Persistent storage is in the `chroma/` directory.
- You can query ChromaDB directly for debugging.

**Example CLI usage:**
```bash
node -e "const { ChromaClient } = require('chromadb'); ..."
```

---

## Self-Healing

The framework includes two complementary self-healing systems for handling locator failures:
a **RAG-based agent** for AI-driven recommendations and an **Advanced Locator Healing Engine**
for automated heuristic-based healing with confidence scoring.

### RAG-Based Locator Healing

When a test fails due to a changed locator, the `LocatorHealingAgent`:
  1. Detects the failure and captures context (locator, page, feature, scenario, error).
  2. Queries ChromaDB via the RAG pipeline for similar past failures and locator evidence.
  3. Uses an LLM to generate alternative locator recommendations.
  4. Produces a ranked recommendations table with confidence and risk for each suggestion.

### Advanced Self-Healing (Phase 5)

The **Advanced Locator Healing Engine** provides deterministic, heuristic-based healing
without requiring an LLM or external API. It consists of three components:

| Component | File | Purpose |
|---|---|---|
| **LocatorHealingEngine** | `ai/agents/locator-healing/LocatorHealingEngine.js` | Orchestrates the healing workflow — captures failures, generates candidates, scores them, auto-applies fixes, and generates reports |
| **LocatorConfidenceScorer** | `ai/agents/locator-healing/LocatorConfidenceScorer.js` | Calculates confidence scores (0.0–1.0) using DOM similarity, historical success rate, locator type stability, attribute richness, and proximity matching |
| **LocatorHistoryStore** | `ai/agents/locator-healing/LocatorHistoryStore.js` | Persistent store tracking locator versions, successes, failures, replacements, and rollback state under `ai/memory/locator-history.json` |

#### How It Works

1. **Capture**: When a Playwright locator fails, the engine captures the failed locator, page URL, feature name, scenario name, error message, and timestamp.
2. **Generate Candidates**: The engine generates alternative locators using heuristic strategies:
   - Convert XPath to CSS (extract IDs, classes, text, tags)
   - Convert CSS to attribute-based selectors
   - Adapt to `data-testid` patterns
   - Simplify locators (remove index positions like `[0]`)
   - Roll back to historical versions from the history store
3. **Score**: Each candidate is scored by `LocatorConfidenceScorer` across five weighted factors:

   | Factor | Weight | Description |
   |--------|--------|-------------|
   | DOM Similarity | 30% | Shared classes, IDs, tags, attributes, and string similarity between failed and candidate locator |
   | Historical Success | 25% | Past success/failure rate for this locator from the history store |
   | Locator Type Stability | 20% | Stability ranking: `testid` > `id` > `role` > `name` > `label` > `css` > `xpath` > `text` |
   | Attribute Richness | 15% | How many attributes/constraints the locator uses (more = more specific) |
   | Proximity Match | 10% | How closely the candidate matches the failed element's DOM path |

4. **Auto-Apply**: If the best candidate's confidence score exceeds the configurable threshold (default: 0.80), the engine automatically replaces the locator via `LocatorHealingApplier`, which backs up the original file first.
5. **Record**: All replacements are recorded in the history store for future reference.
6. **Report**: A detailed markdown report is generated at `reports/ai/locator-healing-report.md`.

#### Confidence Levels

| Label | Score Range | Recommended Action |
|---|---|---|
| HIGH | ≥ 0.85 | AUTO_APPLY — Safe to automatically replace |
| MEDIUM_HIGH | 0.70 – 0.84 | AUTO_APPLY — Low risk, recommend automatic replacement |
| MEDIUM | 0.50 – 0.69 | REVIEW — Review before applying |
| LOW_MEDIUM | 0.30 – 0.49 | REVIEW — Low confidence, requires manual review |
| LOW | 0.15 – 0.29 | MANUAL — Manual investigation needed |
| VERY_LOW | < 0.15 | MANUAL — Cannot recommend replacement automatically |

#### Usage

```javascript
const LocatorHealingEngine = require("./ai/agents/locator-healing/LocatorHealingEngine");

const engine = new LocatorHealingEngine({
  mode: "recommend",        // "recommend" | "dry-run" | "apply"
  autoApplyThreshold: 0.80, // minimum confidence to auto-apply
});

// Heal a single failure
const result = await engine.healFailure({
  locator: "#twotabsearchtextbox",
  page: "HomePage",
  locatorName: "searchBox",
  feature: "Search Feature",
  scenario: "Search for a product",
  error: "Locator not found in DOM",
  locatorType: "css"
});

// Heal multiple failures at once
const results = await engine.healFailures(failuresArray);
```

#### CLI / Script

```bash
# Run locator healing analysis on failed locators
node -e "const E = require(\"./ai/agents/locator-healing/LocatorHealingEngine\");
(new E({ mode: \"dry-run\" })).healFailures([{ locator: \"#old-locator\", page: \"MyPage\", locatorName: \"myElement\", locatorType: \"css\" }]).then(r => console.log(JSON.stringify(r, null, 2)));"
```

#### Report Output

The engine generates a markdown report at `reports/ai/locator-healing-report.md` containing:
- Summary metrics (total failures, candidates generated, auto-applied, skipped)
- Confidence distribution across all failures
- Per-failure detailed results with best candidate and confidence breakdown
- Ranked list of all candidates for each failure
- Locator history statistics and healing success rate
- Unstable locators requiring attention

#### History Store

The `LocatorHistoryStore` persists data in `ai/memory/locator-history.json` and tracks:
- Locator versions over time (each replacement is a version bump)
- Success and failure counts per locator
- Consecutive failures (for detecting unstable locators)
- Rollback state for each replacement

Access analytics:
```javascript
const Store = require("./ai/agents/locator-healing/LocatorHistoryStore");
const store = new Store();
console.log(store.getAnalytics());          // { totalRecorded, totalReplacements }
console.log(store.getHealingSuccessRate()); // { rate, totalReplacements, ... }
console.log(store.getAllUnstableLocators());// locators with >3 consecutive failures
```

## JMeter Performance Testing

### Purpose

Apache JMeter is integrated to provide **performance/load testing** capability alongside Playwright UI and Appium mobile tests. It validates that the Amazon India application performs within acceptable thresholds under concurrent user load.

### JMeter Folder Structure

```
performance/jmeter/
├── plans/                     # JMeter test plans (.jmx)
│   └── amazon-load-test.jmx   # Sample Amazon India load test
├── data/                      # External test data (CSV, JSON)
│   └── test-data.csv          # Search term parameterization
└── config/
    └── jmeter.properties      # JMeter runner configuration
```

### Test Plan

The sample test plan `amazon-load-test.jmx` covers:

1. **TC_01_Homepage** — Load the Amazon India homepage
2. **TC_02_SearchProduct** — Search for a product (parameterized)
3. **TC_03_ProductDetails** — View product details page

Features:
- **Parameterized**: Uses `__P()` functions for BASE_URL, USERS, RAMP_UP, DURATION, SEARCH_TERM
- **Think Time**: 2-second delay ±1s between transactions
- **Assertions**: Response code (200/301/302) and duration (< 10s)
- **Cookie Management**: HTTP Cookie Manager for session handling
- **Error Logging**: View Results Tree configured for errors only

### Configuration

Environment variables and CLI flags for the JMeter runner:

| Variable | Default | Description |
|----------|---------|-------------|
| `JMETER_USERS` | 10 | Number of concurrent virtual users |
| `JMETER_RAMPUP` | 5 | Ramp-up period in seconds |
| `JMETER_DURATION` | 60 | Test duration in seconds |
| `JMETER_SEARCH_TERM` | laptop | Product search term |
| `BASE_URL` | https://www.amazon.in | Target base URL |
| `THRESHOLD_ERROR_PCT` | 5 | Max allowed error % before build failure |
| `THRESHOLD_RESPONSE_TIME` | 5000 | Max avg response time (ms) before build failure |
| `JMETER_BINARY` | (auto-detect) | Path to JMeter binary |

### JMeter Commands

| Command | Description |
|---------|-------------|
| `npm run perf:jmeter` | Run JMeter load test with defaults |
| `npm run perf:jmeter:html` | Open JMeter HTML report |
| `npm run ai:jmeter-analysis` | Run AI analysis on latest JMeter results |
| `npm run test:full-with-performance` | Run AI tests + JMeter + AI analysis |
| `npm run ci:full` | Full CI pipeline (alias for test:full-with-performance) |

Custom usage:
```bash
# Run with custom settings
JMETER_USERS=20 JMETER_DURATION=120 npm run perf:jmeter

# Run a different test plan
node scripts/runJMeter.js --plan performance/jmeter/plans/custom-test.jmx

# Set thresholds
THRESHOLD_ERROR_PCT=2 THRESHOLD_RESPONSE_TIME=3000 npm run perf:jmeter
```

### Thresholds & Build Failure

The JMeter runner automatically fails the build if:
- **Error percentage** exceeds `THRESHOLD_ERROR_PCT` (default: 5%)
- **Average response time** exceeds `THRESHOLD_RESPONSE_TIME` (default: 5000ms)
- **P90 response time** exceeds `jmeter.threshold.pct.response.time` (default: 8000ms)

The runner exits with code 1 on failure, which propagates to CI/CD pipelines.

---

## AI JMeter Analysis Agent

### AI Analysis Purpose

The `jmeterPerformanceAnalysisAgent.js` reads JMeter JTL/summary reports and provides an AI-driven analysis. It classifies performance issues, generates recommendations, and produces a markdown report.

### Issue Classification

The agent detects and classifies these issue types:

| Issue | Severity | Description |
|-------|----------|-------------|
| High Response Time | High | Average or percentile response times exceed thresholds |
| High Error Rate | Critical | Error percentage exceeds acceptable threshold |
| Throughput Bottleneck | High | System cannot handle expected requests per second |
| Server/Network Issue | Medium | High connect time or latency detected |
| Test Data Issue | Low | Inconsistent test data causing varied response patterns |

### AI Analysis Report

The agent generates `reports/ai/jmeter-performance-report.md` containing:
- Summary metrics (samples, throughput, response times, error %)
- Percentile analysis (P50, P90, P95, P99)
- Detected issues with severity and recommendations
- Per-transaction breakdown
- AI insights and trend analysis
- Thresholds applied

---

## Reports

### Cucumber HTML Reports

- Generated automatically after each run.
- Output location: `reports/cucumber-report.html` (configurable in `cucumber.js`).
- Shows passed/failed/skipped scenarios, step timings, and screenshots.

**Generate:**
```bash
npm run report:cucumber
```
- The framework can generate AI-powered summary reports.
- These include:
  - Failure analysis in natural language
  - Suggested fixes from the LLM
  - Trend analysis from ChromaDB
  - **JMeter performance analysis with AI insights**
- Output: `reports/ai/jmeter-performance-report.md` (performance) or `reports/ai-report.html`.

**Generate:**
```bash
npm run report:ai
npm run ai:jmeter-analysis   # JMeter-specific AI analysis
```

### JMeter Reports

| Report | Path | Description |
|--------|------|-------------|
| JTL Raw Data | `reports/jmeter/jtl/` | Raw JMeter results (CSV format) |
| HTML Dashboard | `reports/jmeter/html/index.html` | Interactive JMeter HTML report |
| JSON Summary | `reports/jmeter/summary/jmeter-summary.json` | Structured summary data |
| Markdown Summary | `reports/jmeter/summary/jmeter-summary.md` | Human-readable summary |
| AI Analysis | `reports/ai/jmeter-performance-report.md` | AI-powered performance analysis |

---

## Commands

All commands are defined in `package.json` scripts.

### UI & Mobile Commands (Existing)

| Command | Description |
|---------|-------------|
| `npm run test:web` | Run all web tests |
| `npm run test:android` | Run all Android tests |
| `npm run test:ios` | Run all iOS tests |
| `npm run test:all` | Run web + mobile tests |
| `npm run test:specific` | Run a specific tag or feature |
| `npm run report:cucumber` | Generate Cucumber HTML report |
| `npm run report:ai` | Generate AI-powered report |
| `npm run lint` | Lint the codebase |
| `npm run format` | Format code with Prettier |

### Performance Commands (New)

| Command | Description |
|---------|-------------|
| `npm run perf:jmeter` | Run JMeter performance load test |
| `npm run perf:jmeter:html` | Open JMeter HTML report in browser |
| `npm run ai:jmeter-analysis` | Run AI analysis on latest JMeter results |
| `npm run test:full-with-performance` | Run AI tests + JMeter + AI analysis |
| `npm run ci:full` | Full CI pipeline (all tests + performance) |

---

## Environment Variables

The framework uses `.env` files for configuration.

**`.env.example` template:**
```env
# --- Web ---
BASE_URL=https://www.amazon.com

# --- Android ---
ANDROID_DEVICE_NAME=emulator-5554
ANDROID_PLATFORM_VERSION=14
ANDROID_APP_PATH=./mobile/android/app.apk

# --- iOS ---
IOS_DEVICE_NAME=iPhone 15
IOS_PLATFORM_VERSION=17.0
IOS_APP_PATH=./mobile/ios/app.app

# --- LLM ---
LLM_API_KEY=sk-placeholder-your-key-here
LLM_MODEL=gpt-4o
LLM_TEMPERATURE=0.3

# --- ChromaDB ---
CHROMA_DB_PATH=./chroma
CHROMA_COLLECTION_NAME=test_vectors

# --- Reporting ---
CUCUMBER_REPORT_DIR=./reports

# --- JMeter Performance ---
JMETER_USERS=10
JMETER_RAMPUP=5
JMETER_DURATION=60
JMETER_SEARCH_TERM=laptop
THRESHOLD_ERROR_PCT=5
THRESHOLD_RESPONSE_TIME=5000
```

> **IMPORTANT:** Never commit real secrets. Use `.env.example` for templates and keep `.env` in `.gitignore`.

---

## GitHub Secrets Safety

- Real secrets are **never** stored in the repository.
- Use **GitHub Secrets** or **Jenkins credentials** for CI/CD.
- `.env` files are listed in `.gitignore` and not committed.
- Only `.env.example` (with placeholder values) is committed.
- If a secret leaks, rotate it immediately.

**Safe to commit checklist:**
- [x] `.env` is in `.gitignore`
- [x] No real API keys in source code
- [x] No real passwords or tokens
- [x] Placeholder values in `.env.example`

---

## Jenkins / CI-CD

A `Jenkinsfile` is provided at the root for Jenkins CI/CD pipeline.

**Pipeline stages:**
1. Checkout code
2. Install dependencies (`npm install`)
3. Lint (`npm run lint`)
4. Run Playwright/Cucumber tests (web, android, ios)
5. **Run JMeter Performance Tests** (configurable via `RUN_PERFORMANCE` parameter)
6. **Run AI Performance Analysis** (configurable via `RUN_AI_ANALYSIS` parameter)
8. Archive artifacts (reports, JMeter JTL, AI analysis)

**Jenkins parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `TEST_PLATFORM` | Choice | WEB | Target platform (WEB/ANDROID/IOS/ALL) |
| `ENVIRONMENT` | Choice | qa | Environment configuration |
| `RUN_PERFORMANCE` | Boolean | false | Run JMeter performance tests |
| `RUN_AI_ANALYSIS` | Boolean | true | Run AI analysis on reports |

**JMeter HTML report** is published via `publishHTML` step:
- Report name: `JMeter Performance Report`
- Report directory: `reports/jmeter/html`
- Report files: `index.html`

**Archived artifacts include:**
- `reports/**` (includes JMeter JTL, HTML, summaries)
- `ai/output/**`, `ai/memory/**`
- `mobile/logs/**`
- `performance/jmeter/**`

**Environment variables in Jenkins:**
Configure these in Jenkins → Manage Jenkins → Configure System → Global Properties:
- `LLM_API_KEY`
- `ANDROID_DEVICE_NAME`
- `IOS_DEVICE_NAME`
- `JMETER_HOME` (path to JMeter installation)
- (and others as needed)

**Running on Jenkins:**
- Trigger manually (with performance checkbox) or via webhook.

---

## GitHub Actions

A GitHub Actions workflow `.github/workflows/full-ci.yml` is provided for cloud CI execution.

**Workflow: `Full CI - Playwright + Cucumber + JMeter + AI Analysis`**

### Triggers
- Push to `main`, `develop`, `feature/**`
- Pull requests to `main`
- Manual workflow dispatch (with inputs)

### Steps
1. Checkout code
2. Setup Node.js (v20, npm cache)
3. Install dependencies (`npm install`)
4. Install Playwright browsers (Chromium)
5. Install/setup JMeter (if not present)
6. Create `.env` file
7. Run Playwright/Cucumber tests
8. Run JMeter performance tests
9. Run AI performance analysis

### Workflow Inputs
| Input | Default | Description |
|-------|---------|-------------|
| `run_performance` | true | Run JMeter performance tests |
| `run_ai_analysis` | true | Run AI analysis |

### Artifacts Uploaded
| Artifact | Path | Retention |
|----------|------|-----------|
| Cucumber HTML Report | `reports/html/` | 30 days |
| JMeter Performance Report | `reports/jmeter/` | 30 days |
| AI Analysis Report | `reports/ai/` | 30 days |
| Screenshots & Videos | `screenshots/` | 7 days |
| Performance Summary | `reports/jmeter/summary/` | 30 days |

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| `chromadb` connection refused | ChromaDB server not running | Start ChromaDB: `npx chromadb start` |
| LLM API call fails | Missing or invalid `LLM_API_KEY` | Check `.env` / secrets |
| Android tests fail to start | Appium not running / device offline | Start `appium`, check `adb devices` |
| iOS tests fail | WebDriverAgent not installed | Run `xcodebuild` for WDA |
| Cucumber report missing | Output dir not created | Run `mkdir -p reports` first |
| Self-healing not working | ChromaDB empty / LLM key missing | Seed ChromaDB with `npm run seed:chroma` |
| Port conflict | Another process on same port | Change port in config or kill the other proc |
| `dotenv` not loading | `.env` file missing | Copy `.env.example` to `.env` and fill values |
| **JMeter not found** | JMeter not installed / not in PATH | Install JMeter from https://jmeter.apache.org or set `JMETER_HOME` |
| **JMeter test fails** | Invalid test plan / missing dependencies | Validate `.jmx` file; check JMeter version (5.6.3+) |
| **Threshold exceeded** | Performance degradation | Check the AI report for recommendations |
| **JTL parsing fails** | Corrupted or empty JTL file | Re-run with `npm run perf:jmeter` |

---

## Demo Guide

To give a quick demo of the framework:

1. **Setup**
   ```bash
   git clone <repo-url>
   cd AmazonWebMobilePlaywrightAutomation
   npm install
   cp .env.example .env   # fill in placeholder values
   ```

2. **Run a web test**
   ```bash
   npm run test:web
   ```

3. **View Cucumber report**
   ```bash
   npm run report:cucumber
   ```

   ```bash
   ```

5. **Show AI self-healing** (if ChromaDB is seeded)
   - Break a locator intentionally.
   - Run the test; watch the framework detect and fix it.
   - Show the AI report.

6. **Mobile (optional)**
   ```bash
   npm run test:android   # or test:ios
   ```

7. **Run JMeter Performance Test**
   ```bash
   npm run perf:jmeter
   ```

8. **Run AI Performance Analysis**
   ```bash
   npm run ai:jmeter-analysis
   ```

9. **Full CI Pipeline**
   ```bash
   npm run ci:full
   ```

10. **View JMeter Report**
    ```bash
    open reports/jmeter/html/index.html
    ```

11. **CI pipeline**
    - Show the `Jenkinsfile`.
    - Show the GitHub Actions workflow.
    - Trigger a build in Jenkins / GitHub Actions.

---

## Interview Explanation

### Why JMeter?

JMeter is the industry standard for **performance and load testing** of web applications. Integrating it into this framework allows validating **not just functionality** (via Playwright) but also **performance under load** — ensuring Amazon India handles concurrent users within acceptable response times.

### How It's Integrated

- **Modular**: JMeter files live in `performance/jmeter/`, completely separate from Playwright/Cucumber code.
- **CI/CD-ready**: The `npm run perf:jmeter` script auto-detects JMeter, runs tests, parses results, checks thresholds, and fails the build if exceeded.
- **AI-powered**: The AI agent reads JMeter results, classifies issues, and generates actionable recommendations.

### Architecture Flow

```
User Action
    │
    ├── npm run test:ai          → Playwright UI tests (with AI)
    ├── npm run perf:jmeter      → JMeter performance test
    │       │
    │       ├── JTL results (raw data)
    │       ├── HTML dashboard (visual)
    │       └── JSON/MD summary
    │
    └── npm run ai:jmeter-analysis
            │
            └── AI agent analyzes:
                ├─ Response time
                ├─ Error rate
                ├─ Throughput
                ├─ Latency
                └─ Generates report + recommendations
```

### Key Differentiators

| Feature | Benefit |
|---------|---------|
| Single framework | Web + Mobile + Performance in one repo |
| AI-powered | No manual performance report reading |
| Threshold gating | Build fails automatically on regression |
| CI/CD native | Jenkins + GitHub Actions both supported |
| Modular | Performance code doesn't touch UI code |

---

## Final Framework Summary

This framework is a **unified, AI-augmented test automation solution** covering:

| Feature | Status |
|---------|--------|
| Web automation | ✅ |
| Android automation | ✅ |
| iOS automation | ✅ |
| Cucumber BDD | ✅ |
| Page Object Model | ✅ |
| Cross-browser | ✅ |
| AI Agents | ✅ |
| LLM Integration | ✅ |
| RAG Pipeline | ✅ |
| ChromaDB / Vectors | ✅ |
| Self-Healing | ✅ |
| Cucumber HTML Reports | ✅ |
| AI Reports | ✅ |
| **JMeter Performance Tests** | **✅** |
| **AI Performance Analysis** | **✅** |
| **GitHub Actions CI** | **✅** |
| Jenkins / CI-CD | ✅ |
| GitHub Secrets Safety | ✅ |
| Demo-ready | ✅ |

**Key differentiators:**
- **Single framework** for web, Android, iOS, and performance testing.
- **AI-first** approach with LLM, RAG, ChromaDB, self-healing, and performance analysis.
- **Beginner-friendly** Gherkin syntax.
- **Safe by design** — no secrets in code, CI/CD ready.
- **Performance-gated** — builds fail automatically on performance regression.

---

*For internal AI phase notes, see `ai/README.md` and `ai/README_PHASE1.md`.*
