// MobileAgent - Generates mobile (Android/iOS) Appium test scenarios and page objects
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  run: async function run(input = {}) {
    console.log('[MobileAgent] Generating mobile test assets');

    const platform = (input.platform || process.env.MOBILE_PLATFORM || 'android').toLowerCase();
    const outputDir = path.join(process.cwd(), 'mobile');
    const generatedDir = path.join(process.cwd(), 'ai/generated-features');
    fs.ensureDirSync(generatedDir);

    const capabilities = {
      android: {
        platformName: 'Android',
        automationName: 'UiAutomator2',
        appWaitActivity: '*',
        locatorStrategy: 'xpath'
      },
      ios: {
        platformName: 'iOS',
        automationName: 'XCUITest',
        locatorStrategy: 'xpath'
      }
    };

    const cap = capabilities[platform] || capabilities.android;

    // Generate Appium feature file
    const featurePath = path.join(generatedDir, `mobile-${platform}-tests.feature`);
    const featureLines = [];

    featureLines.push(`@mobile @${platform} @generated`);
    featureLines.push(`Feature: ${platform.charAt(0).toUpperCase() + platform.slice(1)} Mobile Tests`);
    featureLines.push('');
    featureLines.push('  Background:');
    featureLines.push(`    Given I launch the ${platform} app`);
    featureLines.push('    And I wait for the app to load');
    featureLines.push('');

    // Home page scenarios
    featureLines.push('  @mobile-smoke');
    featureLines.push('  Scenario: App should launch successfully');
    featureLines.push(`    Then I should see the ${platform} app home screen`);
    featureLines.push('');

    featureLines.push('  @mobile-smoke');
    featureLines.push('  Scenario: User can search for a product');
    featureLines.push('    When I tap on the search bar');
    featureLines.push('    And I enter search text "mobile phone"');
    featureLines.push('    And I press Enter on the keyboard');
    featureLines.push('    Then I should see search results');
    featureLines.push('');

    featureLines.push('  @mobile-regression');
    featureLines.push('  Scenario: User can view product details');
    featureLines.push('    When I tap on the first search result');
    featureLines.push('    Then I should see the product details screen');
    featureLines.push('    And I should see the product title');
    featureLines.push('    And I should see the product price');
    featureLines.push('');

    featureLines.push('  @mobile-regression');
    featureLines.push('  Scenario: User can add product to cart');
    featureLines.push('    When I tap on the first search result');
    featureLines.push('    And I tap on "Add to Cart" button');
    featureLines.push('    Then I should see the cart updated confirmation');
    featureLines.push('');

    featureLines.push('  @mobile-negative');
    featureLines.push('  Scenario: Empty search should show suggestions');
    featureLines.push('    When I tap on the search bar');
    featureLines.push('    And I submit empty search');
    featureLines.push('    Then I should see search suggestions or popular searches');
    featureLines.push('');

    fs.writeFileSync(featurePath, featureLines.join('\n'), 'utf8');

    // Generate Appium config
    const configPath = path.join(outputDir, `appium.${platform}.config.js`);
    if (!fs.existsSync(configPath)) {
      const configLines = [];
      configLines.push('module.exports = {');
      configLines.push('  server: {');
      configLines.push('    port: 4723,');
      configLines.push('    host: process.env.APPIUM_HOST || "127.0.0.1"');
      configLines.push('  },');
      configLines.push('  capabilities: {');
      configLines.push(`    platformName: "${cap.platformName}",`);
      configLines.push(`    "appium:automationName": "${cap.automationName}",`);
      configLines.push('    "appium:deviceName": process.env.DEVICE_NAME || "emulator-5554",');
      configLines.push('    "appium:app": process.env.APP_PATH || "",');
      configLines.push('    "appium:appPackage": process.env.APP_PACKAGE || "",');
      configLines.push('    "appium:appActivity": process.env.APP_ACTIVITY || "",');
      configLines.push('    "appium:noReset": false,');
      configLines.push('    "appium:fullReset": false,');
      configLines.push('    "appium:autoGrantPermissions": true');
      configLines.push('  }');
      configLines.push('};');
      fs.writeFileSync(configPath, configLines.join('\n'), 'utf8');
    }

    // Generate mobile page object
    const pageObjDir = path.join(outputDir, 'pages');
    fs.ensureDirSync(pageObjDir);
    const pageObjPath = path.join(pageObjDir, `${platform}HomePage.js`);
    if (!fs.existsSync(pageObjPath)) {
      const popLines = [];
      popLines.push('const { AppiumDriver } = require("../utils/appiumDriver");');
      popLines.push('');
      popLines.push(`class ${platform.charAt(0).toUpperCase() + platform.slice(1)}HomePage {`);
      popLines.push('  constructor(driver) {');
      popLines.push('    this.driver = driver;');
      popLines.push('    this.searchBar = driver.element({');
      popLines.push(`      ${cap.locatorStrategy}: '//android.widget.EditText'`);
      popLines.push('    });');
      popLines.push('    this.firstSearchResult = driver.element({');
      popLines.push(`      ${cap.locatorStrategy}: '(//android.view.ViewGroup[@clickable=true])[1]'`);
      popLines.push('    });');
      popLines.push('    this.addToCartButton = driver.element({');
      popLines.push(`      ${cap.locatorStrategy}: '//android.widget.Button[contains(@text, "Add to Cart")]'`);
      popLines.push('    });');
      popLines.push('  }');
      popLines.push('');
      popLines.push('  async isLoaded() {');
      popLines.push('    return this.searchBar.isDisplayed();');
      popLines.push('  }');
      popLines.push('');
      popLines.push('  async searchFor(text) {');
      popLines.push('    await this.searchBar.tap();');
      popLines.push('    await this.searchBar.sendKeys(text);');
      popLines.push('    await this.driver.pressEnter();');
      popLines.push('  }');
      popLines.push('');
      popLines.push('  async tapFirstResult() {');
      popLines.push('    await this.firstSearchResult.tap();');
      popLines.push('  }');
      popLines.push('');
      popLines.push('  async tapAddToCart() {');
      popLines.push('    await this.addToCartButton.tap();');
      popLines.push('  }');
      popLines.push('}');
      popLines.push('');
      popLines.push(`module.exports = ${platform.charAt(0).toUpperCase() + platform.slice(1)}HomePage;`);
      fs.writeFileSync(pageObjPath, popLines.join('\n'), 'utf8');
    }

    // Generate mobile step definitions
    const stepDefPath = path.join(process.cwd(), 'step-definitions', `mobile-${platform}-steps.js`);
    if (!fs.existsSync(stepDefPath)) {
      const stepLines = [];
      stepLines.push(`const { Given, When, Then } = require('@cucumber/cucumber');`);
      stepLines.push(`const { expect } = require('@playwright/test');`);
      stepLines.push(`const ${platform.charAt(0).toUpperCase() + platform.slice(1)}HomePage = require('../mobile/pages/${platform}HomePage');`);
      stepLines.push('');
      stepLines.push(`let ${platform}HomePage;`);
      stepLines.push('');
      stepLines.push(`Given('I launch the ${platform} app', async function () {`);
      stepLines.push('  // Appium session is managed by the hooks');
      stepLines.push('});');
      stepLines.push('');
      stepLines.push(`Given('I wait for the app to load', async function () {`);
      stepLines.push(`  ${platform}HomePage = new ${platform.charAt(0).toUpperCase() + platform.slice(1)}HomePage(this.driver);`);
      stepLines.push('  await this.driver.waitForApp();');
      stepLines.push('});');
      stepLines.push('');
      stepLines.push(`Then('I should see the ${platform} app home screen', async function () {`);
      stepLines.push(`  const loaded = await ${platform}HomePage.isLoaded();`);
      stepLines.push('  expect(loaded).toBe(true);');
      stepLines.push('});');
      stepLines.push('');

      const actionSteps = [
        { pattern: "I tap on the search bar", body: 'await this.driver.element().tap();' },
        { pattern: 'I enter search text "{text}"', body: 'await this.driver.element().sendKeys(text);' },
        { pattern: 'I press Enter on the keyboard', body: 'await this.driver.pressEnter();' },
        { pattern: 'I tap on the first search result', body: 'await androidHomePage.tapFirstResult();' }
      ];

      for (const s of actionSteps) {
        stepLines.push(`When('${s.pattern}', async function () {`);
        stepLines.push(`  ${s.body}`);
        stepLines.push('});');
        stepLines.push('');
      }

      stepLines.push(`When('I submit empty search', async function () {`);
      stepLines.push('  await this.driver.element().tap();');
      stepLines.push('  await this.driver.pressEnter();');
      stepLines.push('});');
      stepLines.push('');

      fs.writeFileSync(stepDefPath, stepLines.join('\n'), 'utf8');
    }

    // Generate report
    const reportPath = path.join(process.cwd(), 'reports/ai', `mobile-${platform}-report.md`);
    const reportLines = [];
    reportLines.push(`# ${platform.charAt(0).toUpperCase() + platform.slice(1)} Mobile Test Generation Report`);
    reportLines.push('');
    reportLines.push(`Generated: ${new Date().toISOString()}`);
    reportLines.push('');
    reportLines.push('## Generated Assets');
    reportLines.push('');
    reportLines.push(`| Asset | Path |`);
    reportLines.push(`|---|---|`);
    reportLines.push(`| Feature File | \`${path.relative(process.cwd(), featurePath)}\` |`);
    reportLines.push(`| Appium Config | \`${path.relative(process.cwd(), configPath)}\` |`);
    reportLines.push(`| Page Object | \`${path.relative(process.cwd(), pageObjPath)}\` |`);
    reportLines.push(`| Step Definitions | \`${path.relative(process.cwd(), stepDefPath)}\` |`);
    reportLines.push('');
    reportLines.push('## Platform Capabilities');
    reportLines.push('');
    reportLines.push(`| Capability | Value |`);
    reportLines.push(`|---|---|`);
    reportLines.push(`| Platform | ${cap.platformName} |`);
    reportLines.push(`| Automation | ${cap.automationName} |`);
    reportLines.push(`| Locator Strategy | ${cap.locatorStrategy} |`);

    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), reportPath),
      platform,
      generatedFiles: {
        feature: path.relative(process.cwd(), featurePath),
        config: path.relative(process.cwd(), configPath),
        pageObject: path.relative(process.cwd(), pageObjPath),
        stepDefinitions: path.relative(process.cwd(), stepDefPath)
      }
    };
  }
};


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Mobile Test Generation Agent",
  "version": "1.0.0",
  "description": "Generates Appium mobile test scenarios and page objects for Android/iOS",
  "dependencies": ["AppiumAgent"],
  "platforms": [
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "mobile",
    "generation"
  ],
  "executionStage": "execution",
  "priority": 50,
  "conditions": [
    {
      "type": "platform",
      "value": "mobile"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
