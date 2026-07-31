# Cleanup Report — mobile/lifecycle Duplicate Files

## 1. Dependency Graph (Runtime)

### Android Startup Path (at runtime)

```
runAndroidWithOrchestrator.js
  └── ./lifecycle/index.js
        ├── StartupOrchestrator.js
        │     ├── StepLogger.js
        │     ├── EnvironmentValidator.js
        │     ├── DeviceManager.js
        │     ├── AppiumLifecycleManager.js
        │     ├── DriverManager.js
        │     ├── AndroidStartupPipeline.js
        │     └── IosStartupPipeline.js (not executed for Android)
        ├── StepLogger.js
        ├── AndroidBootManager.js → DeviceManager.js (deprecated wrapper)
        ├── EnvironmentValidator.js
        ├── DeviceManager.js
        ├── AppiumLifecycleManager.js
        ├── WdaLifecycleManager.js (iOS only, not executed)
        ├── DriverManager.js
        │     ├── ExecutionMode (framework/common/ExecutionMode)
        │     ├── androidNativeCapabilities (capabilities/...)
        │     ├── androidWebCapabilities (capabilities/...)
        │     ├── AppInstallationDetector (utils/...)
        │     ├── DynamicActivityResolver (utils/...)
        │     ├── ChromeDriverManager (utils/...)
        │     └── webdriverio (npm)
        ├── AndroidStartupPipeline.js
        └── IosStartupPipeline.js (not executed for Android)
```

### iOS Startup Path (at runtime)

```
runIOSWithOrchestrator.js
  └── ./lifecycle/index.js
        └── StartupOrchestrator.js
              ├── StepLogger.js
              ├── EnvironmentValidator.js
              ├── DeviceManager.js
              ├── AppiumLifecycleManager.js
              ├── DriverManager.js
              ├── IosStartupPipeline.js
              │     └── WdaLifecycleManager.js (conditional require inside startIOS)
              └── WdaLifecycleManager.js
```

### External Consumers of lifecycle modules

| External File | Imported Module |
|---|---|
| `hooks/hooks.js` | `DriverManager` |
| `framework/mobile/ApplicationInitializer.js` | `DriverManager` |
| `framework/mobile/MobileSessionManager.js` | `DriverManager` |
| `ai/agents/MobileDeviceFarmAgent.js` | `DeviceManager` |
| `mobile/runAndroidWithOrchestrator.js` | `StartupOrchestrator` (via index.js) |
| `mobile/runIOSWithOrchestrator.js` | `StartupOrchestrator` (via index.js), `DeviceManager` |

---

## 2. Files Executed During Android Startup

1. `index.js` — barrel exports
2. `StartupOrchestrator.js` — entry point, delegates to AndroidStartupPipeline
3. `StepLogger.js` — structured logging
4. `EnvironmentValidator.js` — tooling checks
5. `DeviceManager.js` — emulator/device lifecycle
6. `AppiumLifecycleManager.js` — Appium server start/stop/health
7. `DriverManager.js` — singleton driver creation
8. `AndroidStartupPipeline.js` — 16-step deterministic pipeline
9. `AndroidBootManager.js` — deprecated wrapper around DeviceManager (only if imported via index.js barrel)

## 3. Files Executed During iOS Startup

1. `index.js` — barrel exports
2. `StartupOrchestrator.js` — entry point, delegates to IosStartupPipeline
3. `StepLogger.js` — structured logging
4. `EnvironmentValidator.js` — tooling checks
5. `DeviceManager.js` — simulator lifecycle (detectIOSSimulator, bootIOSSimulator, etc.)
6. `AppiumLifecycleManager.js` — Appium server start/stop/health
7. `DriverManager.js` — singleton driver creation
8. `IosStartupPipeline.js` — 15-step deterministic pipeline
9. `WdaLifecycleManager.js` — WebDriverAgent lifecycle

---

## 4. Backup Files — NOT Imported Anywhere

Verified by searching for `.bak`, `.bak2`, `.bak3`, `.fix`, `.old` in all `.js` source files (excluding node_modules). **No backup file is referenced in any require() or import anywhere in the codebase.**

### Duplicate Files in mobile/lifecycle (safe to delete):

| File | Size | Description |
|---|---|---|
| `AndroidStartupPipeline.js.bak` | 14 KB | Older version of AndroidStartupPipeline.js |
| `DeviceManager.js.bak` | 17 KB | Older version of DeviceManager.js |
| `DeviceManager.js.fix` | 1.2 KB | Function replacement snippet for detectAndroidDevice (not a complete file) |
| `DriverManager.js.bak` | 8 KB | Older version of DriverManager.js |
| `DriverManager.js.bak2` | 13 KB | Second backup of DriverManager.js |
| `IosStartupPipeline.js.bak2` | 25 KB | First backup of IosStartupPipeline.js |
| `IosStartupPipeline.js.bak3` | 26 KB | Second backup of IosStartupPipeline.js |
| `WdaLifecycleManager.js.bak` | 14 KB | Older version of WdaLifecycleManager.js |

### Additional backup files outside mobile/lifecycle (scope limited):

| File | Location |
|---|---|
| `ExecutionAgent.js.bak` | `ai/agents/` |
| `MobileDeviceFarmAgent.js.bak` | `ai/agents/` |
| `RetryAgent.js.bak` | `ai/agents/` |
| `SelfHealingPipelineAgent.js.bak` | `ai/agents/` |
| `PlaywrightExecutionEngine.js.bak` | `ai/core/` |
| `enterpriseExecutionPipeline.js.bak2` | `ai/orchestrator/` |
| `runIOSWithOrchestrator.js.bak` | `mobile/` |

These are out of scope for this report (not in mobile/lifecycle).

---

## 5. Recommendation

### DELETE these 8 files from `mobile/lifecycle/`:

1. `AndroidStartupPipeline.js.bak`
2. `DeviceManager.js.bak`
3. `DeviceManager.js.fix`
4. `DriverManager.js.bak`
5. `DriverManager.js.bak2`
6. `IosStartupPipeline.js.bak2`
7. `IosStartupPipeline.js.bak3`
8. `WdaLifecycleManager.js.bak`

### KEEP these 11 files:

1. `AndroidBootManager.js` — deprecated but referenced via index.js barrel export
2. `AndroidStartupPipeline.js` — current runtime implementation
3. `AppiumLifecycleManager.js` — current runtime implementation
4. `DeviceManager.js` — current runtime implementation
5. `DriverManager.js` — current runtime implementation
6. `EnvironmentValidator.js` — current runtime implementation
7. `IosStartupPipeline.js` — current runtime implementation
8. `README.md` — documentation
9. `StartupOrchestrator.js` — current runtime implementation
10. `StepLogger.js` — current runtime implementation
11. `WdaLifecycleManager.js` — current runtime implementation
12. `index.js` — barrel exports file

**No backup file will be imported after deletion. Dead code will be eliminated.**

---

*Report generated automatically. Awaiting approval to proceed with deletions.*
