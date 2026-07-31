# Regression Risk Analysis — Android Lifecycle Refactoring

## Risk Levels

| Risk | Count | Description |
|------|-------|-------------|
| CRITICAL | 0 | Breaking changes to core execution flow |
| HIGH | 2 | Areas needing careful validation |
| MEDIUM | 4 | Changes with moderate risk |
| LOW | 8 | Low-risk changes with clear testing |

## Risk Assessment by Area

### 1. DriverManager.createAndroidDriver() — HIGH RISK

**Change**: Replaced fallback-to-Chrome logic with execution-mode-aware path selection.
**Risk**: Native execution might incorrectly use web capabilities if execution mode detection fails.
**Mitigation**: 
- ExecutionMode.getExecutionMode() is called once and cached
- Explicit validation: native caps reject browserName, web caps reject appPackage
- Fallback: backward-compatible android.capabilities() if mode is undetermined

**Rollback**: Keep backup file DriverManager.js.bak

### 2. hooks.js — HIGH RISK

**Change**: Hooks now reuse DriverManager.getSharedDriver() instead of creating new sessions.
**Risk**: 
- Scenario isolation might break if driver state leaks between scenarios
- Standalone execution (without orchestrator) needs to create sessions via fallback path
**Mitigation**:
- DriverManager.hasDriver() check prevents creating when orchestrator-d session exists
- Fallback to MobileSessionManager.createSession() when no shared driver
- Between-scenario cleanup still runs (Chrome data clear, etc.)

**Rollback**: Revert hooks.js to original version

### 3. DeviceManager bootAndroidEmulator() — MEDIUM RISK

**Change**: HEADLESS env var now controls -no-window (previously EMULATOR_HEADLESS only).
**Risk**: CI environments that relied on EMULATOR_HEADLESS=true might lose headless mode.
**Mitigation**:
- EMULATOR_HEADLESS still respected (higher priority than HEADLESS)
- CI=true also forces headless
- Default changed to show GUI (matching user expectation for HEADLESS=false)

**Rollback**: Revert DeviceManager.js to .bak version

### 4. AndroidStartupPipeline — MEDIUM RISK

**Change**: Now branches for native vs web (previously always launched Chrome).
**Risk**: Native execution might skip necessary Chrome steps, or web execution might try native app checks.
**Mitigation**:
- Explicit mode check before each step
- Native mode: verify app PID, set env flags for hooks
- Web mode: launch Chrome, navigate to URL

**Rollback**: Revert AndroidStartupPipeline.js

### 5. MobileSessionManager.createSession() — MEDIUM RISK

**Change**: Now checks DriverManager.hasDriver() first and reuses shared driver.
**Risk**: If DriverManager is in unexpected state, session creation might be skipped.
**Mitigation**:
- Falls through to original session creation if no shared driver
- Logs warnings for debugging

### 6. MobileDriverFactory.getCapabilities() — LOW RISK

**Change**: Now delegates to androidNativeCapabilities or androidWebCapabilities based on execution mode.
**Risk**: Backward compat callers passing explicit platform might not work as expected.
**Mitigation**:
- Falls back to legacy androidCapabilities() if mode not set
- Execution mode defaults to WEB, so the android path only triggers for ANDROID platform

### 7. android.capabilities.js — LOW RISK

**Change**: Simplified to delegate to native/web builders.
**Risk**: Existing code that imports androidCapabilities() directly gets correct builder.
**Mitigation**:
- Delegation logic matches the previous mixed approach
- All capabilities preserved (just separated into two files)

## Impact on Other Platforms

| Platform | Impact | Rationale |
|----------|--------|-----------|
| Web (Playwright) | NONE | No changes to WebDriverFactory, browser config, or Playwright pipeline |
| API | NONE | ExecutionMode.js added, but API path guarded by TEST_PLATFORM=API |
| iOS | LOW | DriverManager.createIOSDriver() updated with mode check |
| Reporting | NONE | ScreenshotUtility and report generation unchanged |
| AI Agents | NONE | No changes to AI agent code |
| Cucumber | LOW | hooks.js updated but exec flow unchanged for non-mobile |

## Files That Are NOT Modified

- config/env.config.js — unchanged
- config/executionConfig.js — unchanged
- framework/web/ — completely unchanged
- framework/common/ScreenshotUtility.js — unchanged
- framework/common/BrowserCacheCleanup.js — unchanged
- framework/mobile/AmazonFirstLaunchHandler.js — unchanged
- framework/mobile/MobileBasePage.js — unchanged
- mobile/ios/ — completely unchanged
- ai/ — completely unchanged
- pages/ — completely unchanged
- step-definitions/ — completely unchanged
- utils/logger.js — unchanged
- utils/mobileDebugUtility.js — unchanged
- All reporting/dashboard utilities — unchanged

## Recommended Validation Steps

1. Run `HEADLESS=false node mobile/runAndroidWithOrchestrator.js` → verify emulator GUI shows
2. Run `HEADLESS=true node mobile/runAndroidWithOrchestrator.js` → verify no-window mode
3. Run `TEST_PLATFORM=ANDROID BROWSER_NAME=Chrome npm run test:android:raw` → verify web mode
4. Run `TEST_PLATFORM=ANDROID APP_PACKAGE=in.amazon.mShop.android.shopping npm run test:android:raw` → verify native mode
5. Run `npx cucumber-js ... @api` → verify API tests unaffected
6. Run `npx playwright test` → verify Web tests unaffected
