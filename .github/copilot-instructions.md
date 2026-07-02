# Copilot instructions for AmazonWebMobilePlaywrightAutomation

Purpose: Provide concise, actionable guidance for Copilot sessions working on this repository: how to run builds/tests, the high-level architecture, and repo-specific conventions.

---

## Build, test and run commands

- Install deps: `npm install`
- Install Playwright browsers (CI uses this): `npx playwright install --with-deps chromium`

Main npm scripts (examples):
- Web suite: `npm run test:web`
- Android suite: `npm run test:android` (requires Appium + device/emulator)
- iOS suite: `npm run test:ios` (macOS + Xcode + Appium)
- API-only tests: `npm run test:api` (uses `cucumber.api.js` — no browser hooks)
- JMeter perf: `npm run perf:jmeter`
- Generate reports: `npm run report` or `npm run report:web` / `report:android`

Run a single feature or scenario:
- Single feature file: `npx cucumber-js --config cucumber.js features/path/to.feature`
- Single scenario by line: `npx cucumber-js --config cucumber.js features/path/to.feature:LINE`
- By scenario name: `npx cucumber-js --config cucumber.js --name "Scenario name"`

Headed vs headless:
- Run headed: `HEADLESS=false npm run test:web`

Environment & platform modifiers (used by scripts):
- TEST_PLATFORM (web/android/ios)
- REPORT_DIR (overrides reports location)
- ENV_FILE (e.g. `.env.android`) — some scripts use this
- PARALLEL (parallel worker count), RETRIES, TIMEOUT
- BROWSER (e.g., firefox, webkit) for playbook overrides

Notes on running locally:
- Many `pretest:*` scripts clean `reports/` before runs (via `utils/cleanReports.js`).
- CI installs Node 20 and Playwright browsers and creates a `.env` (see `.github/workflows/full-ci.yml`).

---

## High-level architecture (short)

- Tests are authored in Gherkin: `features/**/*.feature`.
- Step implementations live under `step-definitions/` and `step-definitions/api/` for API tests.
- Page Object Model classes are under `pages/` and consumed by step-definitions.
- Cucumber runtime config: `cucumber.js` (UI) and `cucumber.api.js` (API-only).
- Hooks that launch browsers and manage lifecycle: `hooks/hooks.js` (loaded by `cucumber.js`).
- Playwright settings and artifacts: `playwright.config.js` (timeouts, headless, traces, videos, screenshots).
- AI systems: `ai/` hosts agents, vector ingestion, and orchestration; ChromaDB persistence under `chroma/`.
- Performance testing: `performance/jmeter/` (JMX plans, data, config) and `scripts/runJMeter.js`.
- Reports & artifacts: `reports/` (per platform), `screenshots/`, `videos/`, `logs/`.

---

## Key conventions and repo-specific patterns

1. Platform-specific REPORT_DIR
- `cucumber.js` sets REPORT_DIR based on TEST_PLATFORM; most scripts rely on `REPORT_DIR` being set (e.g., `reports/web`, `reports/android`).

2. API vs UI isolation
- Use `cucumber.api.js` (script `npm run test:api`) for API-only runs — it intentionally does not load `hooks/hooks.js` to avoid browser activity.

3. Script composition
- Many `npm run` scripts chain helpers in `utils/` (cleanReports, generateReports) and small orchestration JS files (e.g., `utils/runAllPlatformsOrchestrator.js`). Inspect those scripts if behavior needs adjusting.

4. Test selection and tags
- Common tags exist: `@web`, `@android`, `@ios`, `@api`, `@smoke`, `@regression`, `@login`, etc.
- Several convenience scripts target single features (e.g., `test:home`, `test:search-results`, `test:cart`, `test:product`).

5. Environment files and platform-specific env
- `.env.example` is the template. Platform runs sometimes expect `ENV_FILE=.env.android` or `.env.ios`.

6. CI expectations
- CI workflow (`.github/workflows/full-ci.yml`) expects `LLM_API_KEY` in secrets for some AI steps and will run Playwright browser install and optional JMeter steps.

7. Artifacts & retention
- Test artifacts are written under `reports/<platform>/...`, `screenshots/`, `videos/`. CI uploads these artifacts — tools and agents read these paths.

8. Self-healing / AI agents
- AI agents under `ai/` use the vector DB and various scripts. Commands use `ai:` prefixes (e.g., `npm run ai:heal-locators`, `ai:generate-tests`). Treat these as higher-level automation utilities rather than unit tests.

---

## Files & places to check when making edits
- `playwright.config.js` — default browser options and artifact policies
- `cucumber.js` & `cucumber.api.js` — runtime, parallelism, and report paths
- `hooks/hooks.js` — scenario lifecycle; careful when modifying as it affects browser startup/shutdown
- `utils/` scripts — cleanup and report generation (used by many npm scripts)
- `ai/` — many automated agents; changes here can impact CI and local AI orchestration

---

## AI assistant/config files discovered
- No Claude/OpenCode, Cursor, Aider, Windsurf, or Cline assistant rule files were found. If adding one, include its key operational commands here.

---

If changes to these instructions are needed (more CI details, extra helper commands, or adding conventions), say what to include and Copilot can update this file.
