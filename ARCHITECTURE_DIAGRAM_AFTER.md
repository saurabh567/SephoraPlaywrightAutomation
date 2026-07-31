# Architecture Diagram — AFTER

## Android Execution Lifecycle (After Refactoring)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       EXECUTION ENTRY POINT                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  runAndroidWithOrchestrator.js                                        │
│         │                                                             │
│         ▼                                                             │
│  StartupOrchestrator.startAndroid()                                   │
│         │                                                             │
│         ▼                                                             │
│  ExecutionMode.detect() ───────────────── once ─────────────────┐    │
│         │                                                        │    │
│         ▼                                                        │    │
│  AndroidStartupPipeline.run()                                     │    │
│         │                                                        │    │
│         ├── [01] EnvironmentValidator.validate('android')         │    │
│         ├── [02] DeviceManager.detectAndroidDevice()              │    │
│         ├── [03] DeviceManager.bootAndroidEmulator()              │    │
│         │            └── respects HEADLESS for -no-window         │    │
│         ├── [04] DeviceManager.verifyDeviceConnectivity()         │    │
│         ├── [05] AppiumLifecycleManager.start()                   │    │
│         ├── [06] AppiumLifecycleManager.waitForHealthy()          │    │
│         │                                                        │    │
│         ├── [07] DriverManager.createAndroidDriver()  ← ONE DRIVER    │
│         │            │                                          │    │
│         │            ├── AppInstallationDetector.verify()        │    │
│         │            ├── DynamicActivityResolver.resolve()       │    │
│         │            ├── ChromeDriverManager.setup() (if web)    │    │
│         │            ├── androidNativeCapabilities (if native)   │    │
│         │            ├── androidWebCapabilities (if web)         │    │
│         │            └── remote() → DRIVER #1 ONLY               │    │
│         │                                                        │    │
│         ├── [08] NATIVE: Verify native app launched              │    │
│         │          WEB:  Launch Chrome + Navigate                │    │
│         │                                                        │    │
│         └── [09] Execute Tests (Cucumber via spawnSync)          │    │
│                        │                                         │    │
│                        ▼                                         │    │
│                  hooks.js (BeforeAll)                             │    │
│                        │                                         │    │
│                        ├── DriverManager.hasDriver()?             │    │
│                        │       └── YES → reuse existing          │    │
│                        │                                         │    │
│                        ▼                                         │    │
│                  hooks.js (Before — per scenario)                  │    │
│                        │                                         │    │
│                        ├── DriverManager.getSharedDriver()        │    │
│                        │       └── NO NEW SESSION CREATED        │    │
│                        │                                         │    │
│                        ▼                                         │    │
│                  Scenario execution                                │    │
│                        │                                         │    │
│                        ▼                                         │    │
│                  hooks.js (After)                                  │    │
│                        │                                         │    │
│                        ├── Chrome data clear only (no pm clear)  │    │
│                        └── DO NOT delete shared session          │    │
│                        │                                         │    │
│                        ▼                                         │    │
│                  StartupOrchestrator.shutdown()                    │    │
│                        │                                         │    │
│                        ├── DriverManager.deleteSession()          │    │
│                        └── AppiumLifecycleManager.stop()          │    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘

## Execution Mode Flow

```
                     ┌─────────────────────────┐
                     │  ExecutionMode.detect()  │
                     │  (single source of truth)│
                     └────────────┬────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   ANDROID_NATIVE           ANDROID_WEB              IOS_WEB / IOS_NATIVE
          │                       │                       │
          ▼                       ▼                       ▼
   androidNative          androidWeb                iosCapabilities
   Capabilities           Capabilities
          │                       │
          ▼                       ▼
   No browserName          No appPackage
   appPackage only         browserName only
```

## Component Hierarchy

```
StartupOrchestrator (single entry point)
│
├── ExecutionMode (detected once, consumed everywhere)
│
├── AndroidStartupPipeline / IosStartupPipeline
│   ├── EnvironmentValidator
│   ├── DeviceManager
│   │   └── HEADLESS → -no-window (or GUI visible)
│   ├── AppiumLifecycleManager
│   └── DriverManager (SINGLETON — creates ONE driver)
│       ├── AppInstallationDetector
│       ├── DynamicActivityResolver (cached)
│       ├── ChromeDriverManager
│       ├── androidNativeCapabilities
│       └── androidWebCapabilities
│
├── Hooks (reuse DriverManager.getSharedDriver())
│
└── Scenarios execute
```

## Key Improvements

1. ✅ ONE Appium session per execution
2. ✅ Execution mode detected once via ExecutionMode.js
3. ✅ Native vs Web capability separation
4. ✅ HEADLESS env var correctly controls emulator GUI
5. ✅ App installation checked BEFORE session creation
6. ✅ Launcher activity resolved dynamically (cached)
7. ✅ Hooks reuse existing driver — no new session
8. ✅ MobileSessionManager checks DriverManager.hasDriver() first
9. ✅ ChromeDriver auto-detection for mobile web
10. ✅ No hardcoded HomeActivity/SplashActivity
