# Framework Executability & Production-Readiness Report

Date: 2026-07-31
Status: **All execution paths investigated — framework is runnable; 3 environmental limits documented**

---

## 1. Root cause of every issue

### Issue 1 — `Cannot find module 'wd'` (Playwright discovery crash)
- `ai/generated-features/mobile/tests/{android,ios}/*.test.ts` are **AI-generated artifacts** that use a
  legacy `wd` + `chai` + mocha stack. The framework's real mobile automation uses
  **webdriverio + Cucumber** (verified in `mobile/lifecycle/DriverManager.ts`, `framework/mobile/MobileDriverFactory.ts`).
- `wd`/`chai`/`mocha` are NOT project dependencies and must NOT be installed (they would be
  "blindly installing packages" for obsolete generated samples). The only real import of `wd`
  (`ai/agents/MobileTestGenerationAgent.ts`) is inside **string templates** that generate test code — not runtime code.
- **Fix:** the default `playwright.config.ts` had NO `testDir`/`testMatch`/`testIgnore`, so Playwright's
  default glob picked up the generated-feature tests. Added `testDir: test-runners`, `testMatch: '**/*.spec.ts'`,
  `testIgnore: ['**/ai/generated-features/**', '**/node_modules/**', '**/dist/**']`. Mirrored in
  `playwright.config.cli.ts`. `ai/generated-features` stays as AI output (already excluded from `tsconfig.json`).

### Issue 2 — Playwright lists 0 tests
- Default config: no `testDir`/`testMatch` → scanned everything, crashed on `wd` import → 0 tests.
- CLI config (`playwright.config.cli.ts`): `testMatch: '**/playwright-cli-runner.spec.js'` did NOT match the
  `.spec.ts` file on disk; `globalSetup`/`globalTeardown` pointed to non-existent `.js` files; and the base-config
  spread (`...playwrightConfig`) came LAST, silently overriding the CLI-specific `reporter`, `timeout`, `use`.
- **Fix:** testMatch → `**/*.spec.ts`; globalSetup/globalTeardown → `.ts` sources; base spread moved FIRST with
  CLI overrides after.
- **Result: 9 tests discovered** (one per Cucumber scenario in `features/`) under both configs.

### Issue 3 — Runtime execution gaps (migration fallout)
| Path | Root cause | Fix | Result |
|---|---|---|---|
| Cucumber BDD (web/android) | Configs required deleted `.js` (hooks/steps) | `requireModule: ['tsx']`, globs → `.ts`, `require('tsx')` in `cucumber.android.js` config load | Steps + hooks load; scenarios execute |
| Cucumber API | Same | Same for `cucumber.api.js` | **8/8 scenarios, 48/48 steps PASSED** |
| Lazy `require()` of ESM `.ts` | tsx returns `{default}` — `WebDriverFactory.launch is not a function` | `.default` at 6 lazy-require sites in `hooks/hooks.ts` | Session creation works |
| `mobile: shell` execute | wdio v9 requires plain-object args; array-of-array rejected | `[{...}]` → `{...}` in `MobileSessionManager` + `AmazonFirstLaunchHandler` | Android session survives |
| Android web initializer | `ApplicationInitializer` (native first-launch) ran on blank Chrome page → 6-min timeout; guard compared function *references* (`isAndroidWeb || …`) not results | Guard now calls `isAndroidWeb() || isIOSWeb()` and skips the native initializer for web-mode sessions | Android web proceeds to steps |
| Orchestrator dry-run | Stray `process.exit(0)` killed the async plan; registry scanned `.js` only | Removed stray exit (else-branch); `_walkDirectory` accepts `.ts` | **Dry run: 9 agents selected, 48 skipped** |
| MobileDebugUtility | Hook called non-existent `captureMobileDebugInfo` (pre-existing broken call) | Use existing `dumpPageState` | No more hook error |
| Combined report | `multiple-cucumber-html-reporter` scans `reports/**/*.json` and crashes on non-array JSON (dashboard/AI/API summaries) | Stage only the 3 platform cucumber reports into `reports/combined/source` | **Combined HTML PASS** |
| Appium binary | PATH `appium` = global **3.0.2** incompatible with local drivers (peer-dep ^2.5.4) | Use local `node_modules/.bin/appium` (2.19.0) | Android sessions stable |
| Chromedriver | Emulator Chrome 133 vs bundled chromedriver 150 | Downloaded chromedriver 133.0.6943.141 into appium-chromedriver/mac | Android web session loads amazon.in |

### Issue 4 — Dependencies
- **Added (genuinely required by code):** `pixelmatch`, `pngjs` (VisualAgent visual diff),
  `puppeteer` (AI-agent report PDF). Verified resolvable.
- **NOT added:** `wd`, `chai`, `mocha` (only in obsolete generated-features artifacts — excluded from discovery).
- **Removed:** none (nothing unused was removable without risk; `chromadb` etc. are imported).
- **Runtime prerequisite installed:** Playwright browsers (`npx playwright install chromium firefox webkit`).

### Issue 5 — Generated AI files
- `ai/generated-features/` is an AI **output** directory (writers: MobileAgent, APIAgent, testCaseGenerationAgent,
  LocatorApplyManager). Nothing in the framework imports from it.
- **Decision:** keep as artifacts; excluded from `tsconfig.json` and from Playwright discovery
  (`testIgnore`). Do NOT regenerate, do NOT delete.

### Issue 6 — Playwright configuration
- `playwright.config.ts`: now has testDir/testMatch/testIgnore; reporter `html` (playwright-report).
- `playwright.config.cli.ts`: corrected spread order, testMatch, globalSetup/globalTeardown `.ts` paths,
  JSON reporter writes `reports/playwright-cli/results.json`, projects (Web×3 / Android / iOS / API) with grep filters.
- All npm `test:playwright:*` scripts repointed from `.js` → `.ts` config.

### Issue 7 — Smoke results
| Check | Result |
|---|---|
| `npx tsc --noEmit` | **ZERO errors** |
| `npx playwright test --list` | **9 tests / 1 file** |
| `npx playwright test --config playwright.config.cli.ts --list` | **9 tests** (Web-Chromium project) |
| Web BDD scenario | Executes (browser launch, steps, hooks, report); final assertion blocked by **Amazon.in anti-bot interstitial** (environmental — desktop headless) |
| Android (emulator Pixel_9_Pro + Appium 2.19) | Emulator boots, Appium session created, chromedriver fixed, **amazon.in loads in emulator Chrome (no bot wall)**; native-app initializer handles language screen; dashboard verification fails against current Amazon app UI (app-locator drift) |
| iOS | Simulators available; WDA first build (5–30 min) not attempted — documented as manual step |
| API | **8 scenarios / 48 steps PASSED** (jsonplaceholder) |
| Reports | web/android/api HTML+JSON, combined HTML, dashboard index.html, api-summary, ai-api-analysis — all generated |
| Locator healing | Engine runs end-to-end (report + history JSON) |
| AI agents | EcosystemReadiness ran: 43 agents discovered, 68 checks (45 pass / 15 warn / 6 fail — missing Ollama/Chroma infra) |
| Orchestrator | Dry-run: 9 agents selected / 48 skipped |

## 2. Files modified
- Config/runtime: `playwright.config.ts`, `playwright.config.cli.ts`, `cucumber.js`, `cucumber.android.js`,
  `cucumber.api.js`, `package.json` (scripts + 3 deps), `tsconfig.json` (already excluded generated-features)
- Runtime fixes: `hooks/hooks.ts`, `framework/mobile/MobileSessionManager.ts`,
  `framework/mobile/AmazonFirstLaunchHandler.ts`, `framework/mobile/ApplicationInitializer.ts` (unchanged logic),
  `ai/core/AgentRegistry.ts`, `ai/orchestrator/unifiedOrchestrator.ts`, `utils/generateReports.ts`
- Reports: `TS_MIGRATION_REPORT.md` (migration), `FRAMEWORK_EXECUTION_REPORT.md` (this file)

## 3. Dependencies added
`pixelmatch@7.2.0`, `pngjs@7.0.0`, `puppeteer@25.4.0` (devDependencies)

## 4. Dependencies removed
None.

## 5. Runtime issues fixed
See Issue 3 table (9 distinct runtime defects fixed).

## 6. Playwright discovery status
Working — 9 tests discovered (default + CLI configs); generated-features excluded.

## 7. Tests discovered
**9** (one per Cucumber scenario across 5 feature files + fallback guard).

## 8. Android validation
✅ Emulator boot, Appium 2.19, chromedriver 133, web session, real amazon.in page load (no bot wall on mobile).
⚠ Standalone `@android` scenario: native-app dashboard verification fails against the current Amazon app UI
(locator drift); native initializer correctly handles language screen. Full native-app suites require
updated app locators/APK path (documented manual task).

## 9. iOS validation
⚠ Not executed: simulator + WDA first build (5–30 min). Infrastructure verified present
(xcrun simctl: iPhone 16 Pro etc.; appium-xcuitest-driver installed). Manual step documented.

## 10. API validation
✅ 8 scenarios / 48 steps PASSED; all API reports generated (summary/md/html/ai-analysis).

## 11. Dashboard validation
✅ `reports/dashboard/index.html` + data JSON + consolidated summary generated.

## 12. AI validation
✅ Agents load via registry (43 discovered), EcosystemReadiness runs 68 checks, locator healing engine runs,
orchestrator dry-run builds a 9-agent plan. LLM/Ollama/Chroma-dependent features degrade gracefully with warnings.

## 13. Remaining manual tasks
1. **Amazon.in anti-bot:** desktop-headless web runs hit the "Continue shopping" interstitial; use a real
   browser profile / residential proxy / headed + manual CAPTCHA for full web E2E.
2. **iOS:** run once to trigger the WDA build (`npm run test:ios` / lifecycle runner) — first run 5–30 min.
3. **Android native:** point `.env.android` `ANDROID_APP_PATH` at a valid APK and refresh app locators if the
   installed Amazon app UI drifts.
4. **AI infra:** start Ollama + Chroma (`npm run ollama:start`, `npm run chroma:start`) to turn the 6 failed
   readiness checks green.
5. Optionally: `npm audit fix` (npm reported advisories during install; none block runtime).
