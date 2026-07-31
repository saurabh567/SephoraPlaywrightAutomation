# Architecture Diagram — BEFORE

## Android Execution Lifecycle (Before Refactoring)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION ENTRY POINTS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  runAndroidWithOrchestrator.js      runAndroidWithLifecycle.js   │
│  (enterprise orchestrator)          (legacy runner)              │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  StartupOrchestrator               (Independent lifecycle)       │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  AndroidStartupPipeline             (parallel emulator boot)     │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  DriverManager.createAndroidDriver()  (own appium start)         │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  DRIVER #1 CREATED                    (separate session)         │
│         │                                 │                      │
│         ▼                                 │                      │
│  spawnSync(Cucumber)                    │                        │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  hooks.js (BeforeAll)                                            │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  hooks.js (Before — per scenario)                                │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  MobileSessionManager.createSession()                            │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  MobileDriverFactory.createDriver()                              │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  DRIVER #2 CREATED  ← DUPLICATE SESSION                         │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  Scenario execution                                              │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  hooks.js (After)                                                │
│         │                                 │                      │
│         ▼                                 ▼                      │
│  Session cleanup                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

## Key Problems

1. TWO Appium sessions created per execution (Driver #1 + Driver #2)
2. No coordination between StartupOrchestrator and Hooks
3. AndroidStartupPipeline always launches Chrome (step 8) — wrong for native
4. MobileSessionManager always does native app prep (adb monkey) — wrong for web
5. Capabilities mix native and web properties
6. HEADLESS env var not respected for emulator -no-window
7. Launcher activity hardcoded as HomeActivity
8. No execution mode enum
9. Hooks always create new session via MobileSessionManager
10. App installation check happens too late (inside DriverManager)
```

