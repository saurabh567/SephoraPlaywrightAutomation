# Amazon Web & Mobile Playwright Automation Framework

A unified test automation framework for **Web**, **Android**, and **iOS** platforms using **Playwright**, **Cucumber BDD**, **AI agents**, **LLMs**, **RAG**, and **self-healing** capabilities.

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
- [Reports](#reports)
  - [Cucumber HTML Reports](#cucumber-html-reports)
  - [Allure Reports](#allure-reports)
  - [AI Reports](#ai-reports)
- [Commands](#commands)
- [Environment Variables](#environment-variables)
- [GitHub Secrets Safety](#github-secrets-safety)
- [Jenkins / CI-CD](#jenkins--ci-cd)
- [Troubleshooting](#troubleshooting)
- [Demo Guide](#demo-guide)
- [Final Framework Summary](#final-framework-summary)

---

## Project Overview

This framework allows you to run automated tests on:
- **Web** (Chrome, Firefox, Safari, Edge via Playwright)
- **Android** (native apps via Appium + Playwright)
- **iOS** (native apps via Appium + Playwright)

Tests are written in **Gherkin** (Cucumber) and implemented using the **Page Object Model**.  
The framework includes **AI-powered features** such as:
- AI-generated test steps and self-healing locators
- LLM integration for natural-language understanding
- RAG pipeline to retrieve relevant past test data
- ChromaDB for storing and querying vector embeddings

---

## Tech Stack & Tools

| Tool / Library       | Purpose                              |
|----------------------|--------------------------------------|
| Playwright           | Browser & mobile automation          |
| Appium               | Android / iOS native app automation  |
| Cucumber (BDD)       | Gherkin feature files & step defs    |
| Node.js              | Runtime                              |
| Allure               | Test reporting                       |
| ChromaDB             | Vector database for AI context       |
| OpenAI / LLM API     | Natural language & self-healing      |
| dotenv               | Environment variable management      |
| Jenkins              | CI/CD pipeline                       |
| GitHub Actions       | Optional CI                          |

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
├── reports/                     # Test output reports
├── allure-results/              # Allure raw results
├── allure-report/               # Allure HTML report
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

---

## LLM (Large Language Models)

- The framework connects to an LLM (e.g., OpenAI GPT) for:
  - Generating feature files from plain English descriptions
  - Suggesting locators when elements change
  - Explaining failures in plain language
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
- Used by the RAG pipeline.
- Persistent storage is in the `chroma/` directory.
- You can query ChromaDB directly for debugging.

**Example CLI usage:**
```bash
node -e "const { ChromaClient } = require('chromadb'); ..."
```

---

## Self-Healing

- When a test fails due to a changed locator, the framework:
  1. Detects the failure.
  2. Uses ChromaDB + LLM to find an alternative locator.
  3. Proposes or applies a fix automatically.
  4. Logs the change for review.
- Self-healing logic is in `framework/self-healing/` (if present) or in `utils/`.

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

### Allure Reports

- Allure provides rich, interactive dashboards.
- Raw results are stored in `allure-results/`.
- HTML report is generated in `allure-report/`.

**Generate & open:**
```bash
npm run report:allure
npm run report:allure:open
```

### AI Reports

- The framework can generate AI-powered summary reports.
- These include:
  - Failure analysis in natural language
  - Suggested fixes from the LLM
  - Trend analysis from ChromaDB
- Output: `reports/ai-report.html` or `reports/ai-summary.md`.

**Generate:**
```bash
npm run report:ai
```

---

## Commands

All commands are defined in `package.json` scripts.

| Command                      | Description                        |
|------------------------------|------------------------------------|
| `npm run test:web`           | Run all web tests                  |
| `npm run test:android`       | Run all Android tests              |
| `npm run test:ios`           | Run all iOS tests                  |
| `npm run test:all`           | Run web + mobile tests             |
| `npm run test:specific`      | Run a specific tag or feature      |
| `npm run report:cucumber`    | Generate Cucumber HTML report      |
| `npm run report:allure`      | Generate Allure report             |
| `npm run report:allure:open`  | Open Allure report in browser      |
| `npm run report:ai`          | Generate AI-powered report         |
| `npm run lint`               | Lint the codebase                  |
| `npm run format`             | Format code with Prettier          |

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
ALLURE_RESULTS_DIR=./allure-results
CUCUMBER_REPORT_DIR=./reports
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
4. Run tests (`npm run test:all`)
5. Generate reports (`npm run report:allure`)
6. Archive reports

**Environment variables in Jenkins:**
Configure these in Jenkins → Manage Jenkins → Configure System → Global Properties:
- `LLM_API_KEY`
- `ANDROID_DEVICE_NAME`
- `IOS_DEVICE_NAME`
- (and others as needed)

**Running on Jenkins:**
- Trigger manually or via webhook.
- View Allure report from the build artifacts.

---

## Troubleshooting

| Problem                          | Likely Cause                        | Solution                                      |
|----------------------------------|-------------------------------------|-----------------------------------------------|
| `chromadb` connection refused    | ChromaDB server not running         | Start ChromaDB: `npx chromadb start`          |
| LLM API call fails               | Missing or invalid `LLM_API_KEY`    | Check `.env` / secrets                        |
| Android tests fail to start      | Appium not running / device offline | Start `appium`, check `adb devices`           |
| iOS tests fail                   | WebDriverAgent not installed        | Run `xcodebuild` for WDA                      |
| Cucumber report missing          | Output dir not created              | Run `mkdir -p reports` first                  |
| Self-healing not working         | ChromaDB empty / LLM key missing    | Seed ChromaDB with `npm run seed:chroma`      |
| Port conflict                    | Another process on same port        | Change port in config or kill the other proc  |
| `dotenv` not loading             | `.env` file missing                 | Copy `.env.example` to `.env` and fill values |

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

4. **View Allure report**
   ```bash
   npm run report:allure
   npm run report:allure:open
   ```

5. **Show AI self-healing** (if ChromaDB is seeded)
   - Break a locator intentionally.
   - Run the test; watch the framework detect and fix it.
   - Show the AI report.

6. **Mobile (optional)**
   ```bash
   npm run test:android   # or test:ios
   ```

7. **CI pipeline**
   - Show the `Jenkinsfile`.
   - Trigger a build in Jenkins / GitHub Actions.

---

## Final Framework Summary

This framework is a **unified, AI-augmented test automation solution** covering:

| Feature               | Status |
|-----------------------|--------|
| Web automation        | ✅     |
| Android automation    | ✅     |
| iOS automation        | ✅     |
| Cucumber BDD          | ✅     |
| Page Object Model     | ✅     |
| Cross-browser         | ✅     |
| AI Agents             | ✅     |
| LLM Integration       | ✅     |
| RAG Pipeline          | ✅     |
| ChromaDB / Vectors    | ✅     |
| Self-Healing          | ✅     |
| Cucumber HTML Reports | ✅     |
| Allure Reports        | ✅     |
| AI Reports            | ✅     |
| Jenkins / CI-CD       | ✅     |
| GitHub Secrets Safety | ✅     |
| Demo-ready            | ✅     |

**Key differentiators:**
- **Single framework** for web, Android, and iOS.
- **AI-first** approach with LLM, RAG, ChromaDB, and self-healing.
- **Beginner-friendly** Gherkin syntax.
- **Production-ready** reporting (Cucumber + Allure + AI summaries).
- **Safe by design** — no secrets in code, CI/CD ready.

---

*For internal AI phase notes, see `ai/README.md` and `ai/README_PHASE1.md`.*
