# ROOT CAUSE ANALYSIS — Android Lifecycle Architecture

## 1. Dependency Graph: Current Android Execution Lifecycle

```
runAndroidWithOrchestrator.js
    │
    ▼
StartupOrchestrator.startAndroid()
    │
    ▼
AndroidStartupPipeline.run()
    │
    ├── [STEP 01] EnvironmentValidator.validate('android')
    ├── [STEP 02] DeviceManager.detectAndroidDevice()
    ├── [STEP 03] DeviceManager.bootAndroidEmulator()
    ├── [STEP 04] DeviceManager.verifyAndroidDeviceConnectivity()
    ├── [STEP 05] AppiumLifecycleManager.start()
    ├── [STEP 06] AppiumLifecycleManager.waitForHealthy()
    ├── [STEP 07] DriverManager.createAndroidDriver()  ← DRIVER #1 CREATED
    ├── [STEP 08] DriverManager.launchChromeAndNavigate()
    ├── [STEP 09] Navigate to Target URL
    └── [STEP 10] Execute Tests (Cucumber via spawnSync)
                        │
                        ▼
                  hooks.js (BeforeAll)
                        │
                        ▼
                  hooks.js (Before — per scenario)
                        │
                        ▼
                  MobileSessionManager.createSession()
                        │
                        ▼
                  MobileDriverFactory.createDriver()    ← DRIVER #2 CREATED
                        │
                        ▼
                  MobileDriverFactory.getCapabilities()
                        │
                        ▼
                  androidCapabilities.js (or iosCapabilities.js)
```

## 2. Identified Issues

### Issue A: Duplicate Appium Sessions
- **Path 1**: `StartupOrchestrator` → `AndroidStartupPipeline` → `DriverManager.createAndroidDriver()` creates Driver #1 (Appium session)
- **Path 2**: `Hooks` → `MobileSessionManager.createSession()` → `MobileDriverFactory.createDriver()` creates Driver #2
- **Result**: 2 Appium sessions created per execution. Wasteful and causes port/device conflicts.

### Issue B: No Execution Mode Enum
- No distinction between `ANDROID_NATIVE` (Amazon App) vs `ANDROID_WEB` (Chrome browser)
- `platforms.js` only defines `WEB`, `ANDROID`, `IOS` — no native vs web sub-mode
- `AndroidStartupPipeline` step 8 ALWAYS launches Chrome — breaks native app testing
- `MobileSessionManager` ALWAYS does native app prep (adb monkey, notification suppression) — even for web mode
- Each component independently infers the mode via environment variables

### Issue C: Mixed Capabilities
- `android.capabilities.js` includes BOTH native AND web capabilities in the same object
- When app is not installed, `DriverManager` fallback adds `browserName` but keeps `appPackage` — overlapping
- No separate builders for native vs mobile web

### Issue D: Headless Emulator Inconsistency
- `DeviceManager.bootAndroidEmulator()` checks `EMULATOR_HEADLESS === 'true'` for `-no-window`
- `utils/runAndroidWithLifecycle.js` checks `HEADLESS_EMULATOR`, `CI`, AND `HEADLESS` inconsistently
- No single source of truth for emulator headless mode
- `HEADLESS=false` does NOT correctly show emulator GUI

### Issue E: App Installation Detection
- App detection happens LATE (inside `DriverManager.createAndroidDriver()`) — after environment validation and driver creation already started
- No early validation that the native app is installed before creating the session
- Fallback silently converts to Chrome without clear error messaging

### Issue F: Hardcoded Launcher Activity
- `android.capabilities.js` hardcodes `com.amazon.mShop.home.HomeActivity` as fallback
- Activity resolution exists in `runAndroidWithLifecycle.js` and `androidAppLauncher.js` but is never cached
- Each component re-discovers the activity independently
- Orchestrator pipeline doesn't use dynamic activity resolution at all

### Issue G: Duplicate Emulator Launch Logic
- `DeviceManager.bootAndroidEmulator()` exists in both `DeviceManager.js` and `DeviceManager.js.bak`
- Legacy `runAndroidWithLifecycle.js` has its OWN emulator launch logic independent of DeviceManager
- No central emulator lifecycle management

### Issue H: Appium Server Duplicate Start
- `AppiumLifecycleManager.start()` in orchestrator starts Appium
- `AppiumAgent.startServerIfNeeded()` in hooks also starts Appium
- `appiumServerManager.js` provides a THIRD Appium start mechanism

## 3. Issue Severity

| Issue | Severity | Impact |
|-------|----------|--------|
| Duplicate Driver Session | CRITICAL | Multiple Appium sessions, resource waste, test flakiness |
| No Execution Mode | HIGH | Cannot distinguish native vs web, wrong capabilities |
| Mixed Capabilities | HIGH | Wrong capabilities sent to Appium |
| Headless Emulator | HIGH | GUI never shown even when HEADLESS=false |
| App Detection Late | MEDIUM | Sessions fail after already created |
| Hardcoded Activity | MEDIUM | Activity mismatch across app versions |
| Duplicate Emulator Logic | LOW | Functional but duplicated code |
| Duplicate Appium Start | LOW | Multiple Appium attempts but mostly harmless |

## 4. Before vs After Architecture

### BEFORE:
```
StartupOrchestrator → AndroidStartupPipeline → DriverManager → Driver #1
                                                        ↕ (no coordination)
Hooks → MobileSessionManager → MobileDriverFactory → Driver #2
```

### AFTER:
```
StartupOrchestrator
    │
    ├── Detects Execution Mode (ANDROID_NATIVE | ANDROID_WEB)
    │
    ├── EnvironmentValidator
    ├── DeviceManager (HEADLESS respected)
    ├── AppiumLifecycleManager
    │
    ├── DriverManager
    │       │
    │       ├── androidNativeCapabilities (only native caps)
    │       └── androidWebCapabilities (only web caps)
    │       │
    │       └── One Appium Driver Session
    │
    └── Hooks reuse existing driver (no new session)
            │
            └── Scenarios execute
```
