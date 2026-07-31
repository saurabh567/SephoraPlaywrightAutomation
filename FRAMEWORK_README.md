# Amazon Web + Mobile Playwright Automation Framework

##  Explain 

---

## 1. Framework Introduction

This is an enterprise-grade test automation framework built for Amazon India. It automates web browsers, Android and iOS mobile apps, REST APIs, and performance testing — all from a single codebase. The framework uses Playwright for web, Appium for mobile, Cucumber BDD for human-readable test scenarios, JMeter for performance testing, and 60+ AI agents for intelligent analysis, self-healing, and reporting. The business objective is to enable the team to run complete cross-platform regression in minutes, get AI-powered failure analysis instantly, and maintain tests with minimal manual effort.

---

## 2. Technology Stack

| Technology | What it does |
|---|---|
| **Playwright** | Automates web browsers — Chromium, Firefox, Safari. Faster than Selenium. |
| **Appium** | Automates mobile apps — Android (uiautomator2) and iOS (XCUITest). |
| **JavaScript (Node.js)** | The programming language used to write all tests and framework code. |
| **Cucumber (BDD)** | Lets us write test scenarios in plain English using Gherkin syntax (Given-When-Then). |
| **JMeter** | Runs performance and load tests against Amazon India APIs and pages. |
| **Allure / Cucumber HTML Reporter** | Generates beautiful HTML reports for test results. |
| **ChromaDB** | A vector database that stores test knowledge for AI-powered search and analysis. |
| **Ollama (LLM)** | Runs local AI models for analysis without sending data to the cloud. |
| **Android (ADB/Emulator)** | Tests Amazon app on Android emulator or real device. |
| **iOS (Xcode/Simulator)** | Tests Amazon app on iOS simulator or real device. |
| **REST API (Playwright)** | Tests backend APIs using Playwright's APIRequestContext — no browser needed. |
| **Git + GitHub** | Version control and CI/CD integration. |
| **60+ AI Agents** | Specialized bots that analyze failures, generate tests, heal locators, and create reports. |

---

## 3. Framework Architecture

Here is how the project is organized:

```
config/
→ Stores all configuration — execution mode (headless/headed), environment
  settings (dev/qa/stage/prod), and Appium configuration.

features/
→ Contains Cucumber feature files written in Gherkin language.
  Example: home.feature, cart.feature, search_results.feature.
  These are plain English descriptions of test scenarios.

step-definitions/
→ Contains JavaScript code that connects feature file steps to actual
  automation actions. Each "Given", "When", "Then" step has a matching
  function here.

pages/
→ Contains Page Object classes (AmazonHomePage, AmazonCartPage, etc).
  Each page class holds locators (CSS selectors) and action methods
  (search, add to cart, etc). Supports both Playwright (web) and
  Appium (mobile) drivers transparently.

mobile/
→ Contains everything for mobile testing:
  - android/ — Android-specific page objects
  - ios/ — iOS-specific page objects
  - lifecycle/ — Startup pipeline (boot emulator, start Appium, launch app)
  - drivers/ — Mobile driver creation
  - capabilities/ — Appium capability configurations
  - locators/ — Android & iOS specific locator files
  - utils/ — Mobile utilities (app launcher, device unlock, etc)

framework/
→ The core engine:
  - web/ — WebDriverFactory (launches Playwright browsers)
  - mobile/ — MobileDriverFactory, MobileSessionManager
  - common/ — Shared utilities (Logger, ConfigReader, WaitUtility, etc)

ai/
→ The AI brain of the framework:
  - agents/ — 60+ specialized AI agents
  - orchestrator/ — Enterprise orchestration pipelines
  - core/ — Agent Registry, Agent Router, EventBus, Execution Context
  - vector-db/ — ChromaDB integration for AI memory
  - health/ — Service health checks (Ollama, Chroma, Appium)
  - local/ — Local RAG and analysis scripts
  - memory/ — Shared memory for agents

hooks/
→ Cucumber hooks (BeforeAll, Before, After, AfterAll) that manage
  browser launch, context creation, screenshots on failure, and cleanup.

utils/
→ Utility scripts — report generation, dashboard, cross-browser runner,
  AI monitor, report cleaners.

performance/jmeter/
→ JMeter test plans (.jmx), configuration, and data files for
  performance testing Amazon India.

scripts/
→ Helper scripts — run JMeter, disable lockscreen, validate runtime.

plugins/
→ Plugin system for extending the framework with custom agents.

reports/
→ All generated reports — web, android, ios, api, jmeter, ai, dashboard.

features/api/
→ API-specific Cucumber feature files (e.g., apiCrud.feature).

step-definitions/api/
→ Step definitions for API tests using Playwright APIRequestContext.

pages/api/
→ API client for making HTTP requests.

.env, .env.android, .env.ios
→ Environment variable files for each platform.
```

---

## 4. Execution Flow

When you run `npm run test:ai`, this is what happens:

```
npm run test:ai
      ↓
Enterprise Execution Pipeline (ai/orchestrator/enterpriseExecutionPipeline.js)
      ↓
Phase 1: API Automation (REST API tests — fastest, runs first)
      ↓
Phase 2: Performance Testing (JMeter load tests)
      ↓
Phase 3: Web Automation (Playwright + Cucumber)
      ↓
Phase 4: Mobile Automation (Android + iOS run in parallel)
      ├── Android: Boot Emulator → Start Appium → Launch App → Run Tests → Cleanup
      └── iOS: Boot Simulator → Start Appium → Launch App → Run Tests → Cleanup
      ↓
Phase 5: AI Analysis & Reporting (failure analysis, self-healing, RCA)
      ↓
Phase 6: Consolidated Dashboard (HTML dashboard with all results)
```

Each platform runs independently — if Android fails, iOS still runs. One failure never blocks other platforms.

For single-platform runs:

```
npm run test:web      → Playwright → Cucumber → Reports
npm run test:android  → StartupOrchestrator (16-step pipeline) → Cucumber → Reports
npm run test:ios      → StartupOrchestrator (pipeline) → Cucumber → Reports
npm run test:api      → Playwright APIRequestContext → Cucumber → Reports
npm run perf:jmeter   → JMeter non-GUI → JTL → HTML Dashboard → AI Analysis
```

---

## 5. Supported Automation

**Web Automation**
Uses Playwright to test Amazon India on Chromium, Firefox, and WebKit. Supports headed and headless mode, parallel execution, and cross-browser execution.

**Android Automation**
Uses Appium with uiautomator2 driver. Tests both the Amazon native Android app (via app package/activity) and Chrome browser on Android. Includes a 16-step startup pipeline that boots the emulator, starts Appium, launches the app, and verifies the dashboard.

**iOS Automation**
Uses Appium with XCUITest driver. Tests both the Amazon native iOS app and Safari browser on iOS. Includes automatic WDA (WebDriverAgent) lifecycle management.

**API Automation**
Uses Playwright's APIRequestContext to test REST APIs directly — no browser involved. Tests CRUD operations and API responses.

**Performance Testing**
Uses Apache JMeter in non-GUI mode to run load tests against Amazon India. Generates JTL results, HTML dashboards, and AI-powered performance analysis reports.

---

## 6. AI Capabilities

The framework has 60+ specialized AI agents that work together to analyze, heal, and improve tests automatically.

**Key AI Features:**

- **Agent Registry**: All agents auto-discover themselves. No manual registration needed.
- **Agent Router**: Decides which agents to run based on context — if there are no failures, failure analysis agents are skipped.
- **EventBus**: Agents communicate with each other through events.
- **Vector Database (ChromaDB)**: Stores test knowledge for RAG (Retrieval Augmented Generation). When a test fails, AI searches past failures and suggests fixes.
- **Local LLM (Ollama)**: Runs AI models locally — no data leaves your machine.
- **Self-Healing Locators**: When a locator breaks (e.g., CSS class changes), the AI suggests a new working locator.
- **Root Cause Analysis**: Analyzes failures and tells you exactly what broke and why.
- **Test Generation**: AI can generate test cases, feature files, step definitions, and page objects from simple descriptions.
- **Performance Analysis**: AI analyzes JMeter results and suggests performance improvements.
- **Consolidated Reporting**: AI creates comprehensive reports across all platforms.

---

## 7. Reporting

The framework generates multiple types of reports:

**Cucumber HTML Reports**: One per platform (web, android, ios) with pass/fail counts, timings, and screenshots on failure.

**Combined HTML Report**: Merges all platform results into one report.

**Allure Reports**: Beautiful interactive dashboards with trends and history.

**JMeter Reports**: JTL data files, HTML dashboard, JSON summary, and Markdown summary with pass/fail thresholds.

**API Report**: JSON summary with API count, pass/fail rate, and response times.

**AI Analysis Reports**: AI-generated failure analysis, performance analysis, and root cause analysis in Markdown format.

**Enterprise Dashboard**: A single HTML dashboard showing all platform results, execution order, pass/fail/skip counts, and execution notes. Dark-themed, professional UI.

---

## 8. Design Patterns Used

**Page Object Model (POM)**
Each page (AmazonHomePage, AmazonCartPage) is a separate class. Locators and actions are encapsulated inside the class.

**Factory Pattern**
WebDriverFactory creates Playwright browser instances. MobileDriverFactory creates Appium sessions. PlatformDriverFactory delegates to the correct factory based on platform.

**Singleton Pattern**
Config objects, DriverManager, AgentRegistry, and EventBus have a single shared instance across the entire framework.

**Builder Pattern**
Appium capabilities are built using capability builder functions that combine platform, device, and app settings.

**Strategy Pattern**
Execution mode (headless/headed, web/mobile/api) is detected once and used to decide which code path to follow.

**Observer Pattern**
EventBus allows agents to listen and react to events (test started, failure detected, report generated).

**Facade Pattern**
StartupOrchestrator provides a simple interface to the complex 16-step Android/iOS startup pipeline.

**Proxy Pattern**
executionConfig uses a JavaScript Proxy to always return the live headless/headed mode — never stale cached values.

**Template Method Pattern**
BaseAgent provides a template for all AI agents — load prompt, build user input, call LLM, return result.

**Repository Pattern**
AgentRegistry stores, discovers, and queries all agents — like a database of agents.

---

## 9. Framework Features

- ✅ Cross-browser web automation (Chromium, Firefox, WebKit)
- ✅ Cross-platform mobile automation (Android, iOS)
- ✅ Android native app + Chrome browser testing
- ✅ iOS native app + Safari browser testing
- ✅ REST API testing (no browser)
- ✅ Performance/load testing (JMeter)
- ✅ AI-powered failure analysis and root cause analysis
- ✅ Self-healing locators using vector database
- ✅ AI test generation (test cases, features, steps, page objects)
- ✅ Parallel test execution
- ✅ Headless and headed mode
- ✅ Cross-browser execution
- ✅ Multi-environment support (dev, qa, stage, prod)
- ✅ Enterprise orchestration pipeline
- ✅ Comprehensive reporting (Cucumber HTML, Allure, Dashboard, AI reports)
- ✅ CI/CD ready (Jenkinsfile included)
- ✅ BDD with Cucumber (human-readable scenarios)
- ✅ Reusable utilities and helpers
- ✅ Plugin system for extensibility
- ✅ Agent monitoring and performance tracking
- ✅ Vector database (ChromaDB) for AI memory
- ✅ Local LLM (Ollama) for privacy

---

## 10. Important npm Commands

| Command | What it does |
|---|---|
| `npm run test` or `npm run test:ai` | Runs the FULL enterprise pipeline — API → Performance → Web → Mobile → AI Analysis → Dashboard |
| `npm run test:web` | Runs web automation on Chromium using Cucumber BDD |
| `npm run test:android` | Runs Android automation — boots emulator, starts Appium, runs Cucumber tests |
| `npm run test:ios` | Runs iOS automation — boots simulator, starts Appium, runs Cucumber tests |
| `npm run test:api` | Runs REST API tests using Playwright APIRequestContext |
| `npm run perf:jmeter` | Runs JMeter performance tests in non-GUI mode |
| `npm run test:all:ai` | Enterprise orchestrator — runs all platforms with AI analysis |
| `npm run test:parallel` | Runs Cucumber tests in parallel (4 workers) |
| `npm run test:cross-browser` | Runs same tests on Chromium, Firefox, and WebKit |
| `npm run report:all` | Generates HTML reports for all platforms |
| `npm run dashboard:enterprise` | Generates the enterprise execution dashboard |
| `npm run ai:orchestrate:full` | Runs the unified AI orchestrator with all agents |
| `npm run ai:heal` | Runs the self-healing AI agent to fix broken locators |
| `npm run ai:root-cause` | Runs root cause analysis on test failures |
| `npm run ai:analyze-failures` | Analyzes failures using local RAG |
| `npm run ai:generate-tests` | AI generates test cases from existing patterns |
| `npm run ai:consolidated-report` | Generates AI-powered consolidated test report |

---

## 11. Interview Explanation (2-Minute Version)

*Read this out loud during the interview:*

"This framework is an enterprise test automation solution built for Amazon India. It covers five testing areas from a single codebase: web browsers using Playwright, Android and iOS mobile apps using Appium, REST APIs using Playwright's API module, and performance testing using JMeter.

The tests are written in Cucumber BDD, which means business stakeholders can read and understand the scenarios. The framework uses the Page Object Model, so each page of the Amazon website or app has its own class with locators and actions. We have configuration files for dev, QA, stage, and production environments — just change the environment variable and the tests run against a different environment.

What makes this framework truly unique is the AI integration. We have over 60 specialized AI agents that auto-discover themselves and work together. When a test fails, AI analyzes the failure, suggests locator fixes, and generates root cause analysis — all using a local LLM so no data leaves our network. We use ChromaDB as a vector database to store test knowledge, which means the AI can search past failures and suggest fixes based on historical patterns.

The execution is managed by an enterprise pipeline that runs API tests first (fastest), then performance tests, then web, then Android and iOS in parallel. Each platform is independent — if one fails, others still run. After execution, AI analysis runs automatically and a consolidated enterprise dashboard is generated.

For mobile testing, we have a 16-step startup pipeline that boots the emulator, starts Appium, launches the app, verifies the dashboard, and then runs Cucumber tests — all automated, zero manual intervention.

This framework was designed to be scalable, maintainable, and intelligent. New test scenarios can be added by writing simple Gherkin feature files, and the AI can even generate page objects and step definitions automatically."

---

## 12. Possible Interview Questions & Answers

**Q1: Why Playwright instead of Selenium?**
Playwright is faster, has better built-in auto-wait, supports multiple browser contexts, handles network interception easily, and works great with modern single-page applications.

**Q2: Why Appium for mobile?**
Appium is the industry standard for mobile automation. It supports both Android and iOS from the same API, and we can reuse the same test logic for both platforms.

**Q3: Why JavaScript/Node.js?**
JavaScript is lightweight, has excellent async support, and Node.js provides fast execution. The team was already comfortable with JavaScript.

**Q4: How is AI integrated?**
We have 60+ AI agents that auto-discover via the AgentRegistry. They communicate through an EventBus and are routed by the AgentRouter based on execution context. We use Ollama for local LLM inference and ChromaDB for vector storage.

**Q5: How are reports generated?**
Cucumber generates JSON output, which is then converted to HTML using cucumber-html-reporter. AI agents also generate analysis reports in Markdown. The enterprise dashboard collects all platform results into a single HTML dashboard.

**Q6: How is Android execution handled?**
We have a 16-step StartupOrchestrator pipeline: validate environment → kill stale processes → boot emulator → verify device → verify app → start Appium → verify Appium health → create driver → launch app → initialize app → verify dashboard → run Cucumber tests → cleanup.

**Q7: How is API testing done without a browser?**
We use Playwright's APIRequestContext class. It makes HTTP requests directly without launching any browser. The API tests have their own Cucumber configuration that doesn't load browser hooks.

**Q8: How is performance testing integrated?**
We use Apache JMeter in non-GUI mode. A Node.js script (runJMeter.js) finds the JMeter binary, runs the test plan, parses JTL results, checks thresholds, generates HTML dashboard and JSON/Markdown summaries, and triggers AI analysis.

**Q9: How is the framework scalable?**
It uses parallel execution via Cucumber's parallel mode. Cross-browser runs can execute on all three Playwright browsers. The enterprise pipeline runs Android and iOS in parallel. New features are added by simply creating new feature files and page objects.

**Q10: How are locators managed?**
Web locators are inside page object classes using Playwright locators. Mobile locators are separated into mobile/locators/android/ and mobile/locators/ios/ directories. If a locator breaks, the AI self-healing agent can search the vector database and suggest a working locator.

**Q11: How do you handle different environments?**
We have .env files for each environment (.env for dev, .env.qa, .env.stage, .env.prod). The env.config.js reads the appropriate file based on the ENV environment variable.

**Q12: How does the AI self-healing work?**
When a locator fails, the self-healing agent queries ChromaDB (which stores page source snapshots) to find alternative locators. It tests the new locator and applies it if it works.

**Q13: How do you run tests in CI/CD?**
We have a Jenkinsfile in the repository. The Jenkins job runs `npm run test:all:ai` which executes all platforms, generates reports, and publishes the enterprise dashboard as a Jenkins artifact.

**Q14: What design patterns are used?**
Page Object Model, Factory, Singleton, Builder, Strategy, Observer (EventBus), Facade (StartupOrchestrator), Proxy (executionConfig), Template Method (BaseAgent), and Repository (AgentRegistry).

**Q15: How long does a full execution take?**
Web tests take about 2-3 minutes. API tests take under 30 seconds. Android and iOS each take 3-5 minutes including emulator boot. JMeter performance takes 1-2 minutes. So full execution is typically 10-15 minutes.

**Q16: Can non-technical people understand the tests?**
Yes. Because we use Cucumber BDD, test scenarios are written in plain English. For example: "Given I am on the Amazon India home page, When I search for 'iPhone', Then I should see search results."

**Q17: How do you handle mobile app initialization (first-launch screens)?**
The ApplicationInitializer handles language selection, permission prompts, onboarding screens, and "Continue Shopping" dialogs automatically after the app launches.

**Q18: How does the parallel execution work for mobile?**
Android and iOS run simultaneously using Node.js child processes. The pipeline spawns both and waits for both to complete. Cucumber also supports parallel workers within each platform.

**Q19: How do you manage test data?**
Test data is stored in the test-data/ directory and can also be generated by the TestDataPipelineAgent AI agent. Environment-specific data is managed through .env files.

**Q20: What happens if a platform is unavailable?**
The enterprise pipeline checks prerequisites before each platform. If Android emulator isn't available (ADB not found), it skips Android with a logged reason and continues with other platforms. One failure never blocks the entire run.
