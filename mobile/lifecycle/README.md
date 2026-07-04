# Enterprise Mobile Startup Lifecycle

Deterministic execution pipeline for Android and iOS mobile automation.

## Architecture

```
StartupOrchestrator
├── StepLogger              — Structured [STEP N] logging with timing metrics
├── EnvironmentValidator    — Validates Java, Android SDK, adb, Xcode, etc.
├── DeviceManager           — Detects/boots emulators and simulators
├── AppiumLifecycleManager  — Starts/stops Appium with retry logic
├── WdaLifecycleManager     — Builds/launches/verifies WebDriverAgent (iOS)
├── DriverManager           — Creates Appium sessions, launches browsers
├── AndroidStartupPipeline  — 10-step deterministic Android sequence
└── IosStartupPipeline      — 14-step deterministic iOS sequence
```

## Usage

### Basic Android Startup

```javascript
const { StartupOrchestrator } = require('./mobile/lifecycle');

async function runTests(driver) {
  console.log(await driver.getTitle());
  // ... your test logic
}

const orchestrator = new StartupOrchestrator({ platform: 'android' });
const result = await orchestrator.startAndroid(runTests);

if (result.success) {
  console.log('All tests passed!');
}

await orchestrator.shutdown();
```

### Basic iOS Startup

```javascript
const { StartupOrchestrator } = require('./mobile/lifecycle');

async function runTests(driver) {
  console.log(await driver.getTitle());
  // ... your test logic
}

const orchestrator = new StartupOrchestrator({ platform: 'ios' });
const result = await orchestrator.startIOS(runTests);

if (result.success) {
  console.log('All tests passed!');
}

await orchestrator.shutdown();
```

### Static Convenience Methods

```javascript
const { StartupOrchestrator } = require('./mobile/lifecycle');

// Android
const result = await StartupOrchestrator.startAndroid(async (driver) => {
  await driver.url('https://www.amazon.in');
});

// iOS
const result = await StartupOrchestrator.startIOS(async (driver) => {
  await driver.url('https://www.amazon.in');
});
```

### Custom Configuration

```javascript
const orchestrator = new StartupOrchestrator({
  platform: 'android',
  config: {
    avdName: 'Pixel_6_API_34',
    appPackage: 'in.amazon.mShop.android.shopping',
    baseUrl: 'https://www.amazon.in'
  },
  appiumHost: '127.0.0.1',
  appiumPort: 4723,
  appiumRetryCount: 3
});
```

## Platform Startup Sequences

### Android (10 steps)
1. Environment Validation
2. Device Detection
3. Boot Emulator (if required)
4. Verify Device Connectivity
5. Start Appium Server
6. Verify Appium Health
7. Create Android Driver
8. Launch Chrome
9. Navigate to Target URL
10. Execute Tests

### iOS (14 steps)
1. Environment Validation
2. Detect Simulator
3. Boot Simulator (if needed)
4. Unlock Simulator
5. Verify WDA Installation
6. Build WDA (only if required)
7. Launch WDA
8. Verify WDA Health
9. Start Appium Server
10. Verify Appium Health
11. Create iOS Driver
12. Launch Safari
13. Navigate to Target URL
14. Execute Tests

## Guard Conditions

No browser or app launches before:
- **Environment validation completes**
- **Appium is healthy** (status endpoint OK)
- **WDA is healthy** (iOS only, health endpoint OK)
- **Driver creation starts**

## Error Handling

- If any step fails, execution stops immediately
- Root-cause message is printed with `[FAIL]` label
- Appium and WDA include retry logic
- Clean exit with `shutdown()` even on failure

## Logging Output

```
[STEP 01] Environment Validation
[PASS]  (1240ms)

[STEP 02] Device Detection
[PASS]  (340ms)

...

[STEP 10] Execute Tests
[PASS]  (5200ms)

╔══════════════════════════════════════════════════════════╗
║           STARTUP SEQUENCE COMPLETE                     ║
╚══════════════════════════════════════════════════════════╝
  Total duration: 45320ms
  Steps executed: 10
  Passed:         10
  Failed:         0
  Skipped:        0
```

## Dependency Injection

Every component is injectable for unit testing:

```javascript
const mockLogger = { step: jest.fn(), pass: jest.fn(), fail: jest.fn() };
const orchestrator = new StartupOrchestrator({
  platform: 'android',
  logger: mockLogger,
  envValidator: mockValidator,
  deviceManager: mockDeviceManager,
  appiumManager: mockAppiumManager
});
```
