# Unified Enterprise Automation Framework Migration

## Current Architecture

```text
features/            Cucumber BDD feature files
step-definitions/    Step definitions calling page objects
pages/               Existing Playwright web page objects
hooks/               Cucumber lifecycle and browser handling
utils/               Reports, logging, config helpers
config/              Environment config
reports/             Runtime reports and screenshots
ai/                  Existing AI-assisted automation assets
```

## Enhanced Architecture

```text
framework/
  common/            Platform constants, config bridge, shared utilities
  web/               Playwright driver factory and web base page
  mobile/            Appium driver factory and mobile base page

mobile/
  android/           Android native page objects
  ios/               iOS native page objects
  capabilities/      Android UiAutomator2 and iOS XCUITest capabilities
  drivers/           Mobile driver adapter notes
  locators/          Android and iOS native locators
```

## Execution Flow

```text
Requirement
  ↓
Feature File
  ↓
Step Definition
  ↓
Platform Factory
  ↓
Playwright OR Appium
  ↓
Execution
  ↓
```

## Platform Selection

```text
TEST_PLATFORM=WEB      -> Playwright
TEST_PLATFORM=ANDROID  -> Appium + UiAutomator2
TEST_PLATFORM=IOS      -> Appium + XCUITest
```

## Commands

```bash
npm run test:web
npm run test:android
npm run test:ios
npm run test:all
```

## Mobile Prerequisites

```bash
npm install
npx appium driver install uiautomator2
npx appium driver install xcuitest
npx appium
```

Android execution needs one of:

```text
APP_PATH
APP_PACKAGE + APP_ACTIVITY
```

iOS execution needs one of:

```text
APP_PATH
BUNDLE_ID
```

## Migration Plan

1. Keep existing web tests running with `TEST_PLATFORM=WEB`.
2. Add shared business scenarios only when they apply across platforms.
3. Add mobile page objects under `mobile/android` and `mobile/ios`.
4. Add stable native locators under `mobile/locators`.
5. Move reusable behavior into `framework/common`.
6. Keep platform-specific implementation details out of feature files.
7. Use Jenkins/GitHub Actions platform parameters for CI execution.

## Impact

Existing Playwright web tests remain backward-compatible because:

```text
npm test
```

still runs the original Cucumber web flow, and `TEST_PLATFORM` defaults to `WEB`.
