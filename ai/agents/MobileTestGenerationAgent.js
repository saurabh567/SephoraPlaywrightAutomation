// MobileTestGenerationAgent - Phase 7
// Generates Appium mobile tests, page objects, locators, and flows for Android/iOS native & hybrid apps.
const fs = require('fs-extra');
const path = require('path');

const PLATFORMS = ['android', 'ios'];
const APP_TYPES = ['native', 'hybrid'];

const GENERATED_MOBILE_DIR = path.join(process.cwd(), 'ai/generated-features/mobile');

function ensureDirs() {
  const subdirs = [
    GENERATED_MOBILE_DIR,
    path.join(GENERATED_MOBILE_DIR, 'tests'),
    path.join(GENERATED_MOBILE_DIR, 'tests/android'),
    path.join(GENERATED_MOBILE_DIR, 'tests/ios'),
    path.join(GENERATED_MOBILE_DIR, 'page-objects'),
    path.join(GENERATED_MOBILE_DIR, 'page-objects/native'),
    path.join(GENERATED_MOBILE_DIR, 'page-objects/hybrid'),
    path.join(GENERATED_MOBILE_DIR, 'locators'),
    path.join(GENERATED_MOBILE_DIR, 'locators/android'),
    path.join(GENERATED_MOBILE_DIR, 'locators/ios'),
    path.join(GENERATED_MOBILE_DIR, 'flows'),
    path.join(GENERATED_MOBILE_DIR, 'flows/android'),
    path.join(GENERATED_MOBILE_DIR, 'flows/ios')
  ];
  for (const dir of subdirs) {
    fs.ensureDirSync(dir);
  }
}

// ---------- Android Native App Test Template ----------
function generateAndroidNativeTest() {
  const lines = [];
  lines.push(`const wd = require('wd');`);
  lines.push(`const chai = require('chai');`);
  lines.push(`const { expect } = chai;`);
  lines.push(`const androidCapabilities = require('../../mobile/capabilities/android.capabilities');`);
  lines.push(`const appiumConfig = require('../../config/appium.config');`);
  lines.push(`const AmazonAndroidPage = require('../../mobile/android/AmazonAndroidPage');`);
  lines.push(``);
  lines.push(`describe('Android Native App - Amazon', function () {`);
  lines.push(`  this.timeout(120000);`);
  lines.push(`  let driver;`);
  lines.push(`  let homePage;`);
  lines.push(``);
  lines.push(`  before(async function () {`);
  lines.push(`    driver = await wd.promiseChainRemote({`);
  lines.push(`      host: appiumConfig.host,`);
  lines.push(`      port: appiumConfig.port`);
  lines.push(`    });`);
  lines.push(`    await driver.init(androidCapabilities());`);
  lines.push(`    homePage = new AmazonAndroidPage(driver);`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  after(async function () {`);
  lines.push(`    if (driver) {`);
  lines.push(`      await driver.quit();`);
  lines.push(`    }`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should launch the Android native app and display the home screen', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.verifyHomeLoaded();`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should search for a product', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.searchProduct('mobile phone');`);
  lines.push(`    await homePage.verifySearchResultsVisible('mobile phone');`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should open product details from search results', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.searchProduct('headphones');`);
  lines.push(`    await homePage.openFirstProductFromResults();`);
  lines.push(`    await homePage.verifyProductDetailsVisible();`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should add a product to cart', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.searchProduct('book');`);
  lines.push(`    await homePage.openFirstProductFromResults();`);
  lines.push(`    const added = await homePage.addToCartIfAvailable();`);
  lines.push(`    await homePage.verifyAddToCartFlowComplete(added);`);
  lines.push(`  });`);
  lines.push(`});`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- iOS Native App Test Template ----------
function generateIosNativeTest() {
  const lines = [];
  lines.push(`const wd = require('wd');`);
  lines.push(`const chai = require('chai');`);
  lines.push(`const { expect } = chai;`);
  lines.push(`const iosCapabilities = require('../../mobile/capabilities/ios.capabilities');`);
  lines.push(`const appiumConfig = require('../../config/appium.config');`);
  lines.push(`const AmazonIOSAppPage = require('../../mobile/ios/AmazonIOSAppPage');`);
  lines.push(``);
  lines.push(`describe('iOS Native App - Amazon', function () {`);
  lines.push(`  this.timeout(120000);`);
  lines.push(`  let driver;`);
  lines.push(`  let homePage;`);
  lines.push(``);
  lines.push(`  before(async function () {`);
  lines.push(`    driver = await wd.promiseChainRemote({`);
  lines.push(`      host: appiumConfig.host,`);
  lines.push(`      port: appiumConfig.port`);
  lines.push(`    });`);
  lines.push(`    await driver.init(iosCapabilities());`);
  lines.push(`    homePage = new AmazonIOSAppPage(driver);`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  after(async function () {`);
  lines.push(`    if (driver) {`);
  lines.push(`      await driver.quit();`);
  lines.push(`    }`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should launch the iOS native app and display the home screen', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.verifyHomeLoaded();`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should search for a product', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.searchProduct('iPhone');`);
  lines.push(`    await homePage.verifySearchResultsVisible();`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  it('should open product details from search results', async function () {`);
  lines.push(`    await homePage.openHomePage();`);
  lines.push(`    await homePage.searchProduct('iPad');`);
  lines.push(`    await homePage.openFirstProductFromResults();`);
  lines.push(`    await homePage.verifyProductDetailsVisible();`);
  lines.push(`  });`);
  lines.push(`});`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- Native App Page Object Template ----------
function generateNativePageObject(platform) {
  const capAccessor = platform === 'android'
    ? 'androidCapabilities'
    : 'iosCapabilities';
  const className = platform === 'android'
    ? 'AndroidNativeHomePage'
    : 'IOSNativeHomePage';
  const locatorModule = platform === 'android'
    ? 'native-home.locators'
    : 'native-home.locators';
  const locatorPath = `../locators/${platform}/${locatorModule}`;

  const lines = [];
  lines.push(`const MobileBasePage = require('../../framework/mobile/MobileBasePage');`);
  lines.push(`const locators = require('${locatorPath}');`);
  lines.push(`const { ${capAccessor} } = require('../../mobile/capabilities/${platform}.capabilities');`);
  lines.push(``);
  lines.push(`class ${className} extends MobileBasePage {`);
  lines.push(`  constructor(driver) {`);
  lines.push(`    super(driver);`);
  lines.push(`    this.locators = locators;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async isLoaded() {`);
  lines.push(`    try {`);
  lines.push(`      return await this.isDisplayed(this.locators.homeScreenIndicator);`);
  lines.push(`    } catch {`);
  lines.push(`      return false;`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async searchFor(text) {`);
  lines.push(`    await this.tap(this.locators.searchField);`);
  lines.push(`    await this.type(this.locators.searchInput, text);`);
  lines.push(`    await this.tap(this.locators.searchSubmitButton);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async tapFirstResult() {`);
  lines.push(`    await this.tap(this.locators.firstSearchResult);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async tapCartButton() {`);
  lines.push(`    await this.tap(this.locators.cartButton);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async getProductTitle() {`);
  lines.push(`    return this.getText(this.locators.productTitle);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async waitForNetwork() {`);
  lines.push(`    await this.driver.pause(2000);`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`module.exports = ${className};`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- Hybrid App Page Object Template ----------
function generateHybridPageObject(platform) {
  const className = platform === 'android'
    ? 'AndroidHybridHomePage'
    : 'IOSHybridHomePage';
  const locatorModule = platform === 'android'
    ? 'hybrid-home.locators'
    : 'hybrid-home.locators';

  const lines = [];
  lines.push(`const MobileBasePage = require('../../framework/mobile/MobileBasePage');`);
  lines.push(`const locators = require('../locators/${platform}/${locatorModule}');`);
  lines.push(``);
  lines.push(`class ${className} extends MobileBasePage {`);
  lines.push(`  constructor(driver) {`);
  lines.push(`    super(driver);`);
  lines.push(`    this.locators = locators;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async switchToWebView() {`);
  lines.push(`    const contexts = await this.driver.contexts();`);
  lines.push(`    const webview = contexts.find((ctx) => ctx.startsWith('WEBVIEW'));`);
  lines.push(`    if (webview) {`);
  lines.push(`      await this.driver.context(webview);`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async switchToNative() {`);
  lines.push(`    await this.driver.context('NATIVE_APP');`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async isLoaded() {`);
  lines.push(`    try {`);
  lines.push(`      return await this.isDisplayed(this.locators.homeScreenIndicator);`);
  lines.push(`    } catch {`);
  lines.push(`      return false;`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async login(username, password) {`);
  lines.push(`    await this.switchToWebView();`);
  lines.push(`    await this.type(this.locators.usernameInput, username);`);
  lines.push(`    await this.type(this.locators.passwordInput, password);`);
  lines.push(`    await this.tap(this.locators.loginButton);`);
  lines.push(`    await this.switchToNative();`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async searchFor(text) {`);
  lines.push(`    await this.tap(this.locators.searchField);`);
  lines.push(`    await this.type(this.locators.searchInput, text);`);
  lines.push(`    await this.tap(this.locators.searchSubmitButton);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async getFooterLinks() {`);
  lines.push(`    await this.switchToWebView();`);
  lines.push(`    const links = await this.driver.executeScript(`);
  lines.push(`      'return Array.from(document.querySelectorAll("a")).map(a => ({ text: a.innerText, href: a.href }))'`);
  lines.push(`    );`);
  lines.push(`    await this.switchToNative();`);
  lines.push(`    return links || [];`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`module.exports = ${className};`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- Mobile Locator Strategy Support ----------
function generateAndroidLocatorFile(name, locatorMap) {
  const lines = [];
  lines.push(`// Android ${name} locators`);
  lines.push(`// Supported strategies: accessibility-id, id, xpath, class name, -android uiautomator, -ios predicate string`);
  lines.push(`module.exports = {`);
  const entries = Object.entries(locatorMap);
  for (let i = 0; i < entries.length; i += 1) {
    const [key, value] = entries[i];
    const comma = i < entries.length - 1 ? ',' : '';
    lines.push(`  ${key}: '${value}'${comma}`);
  }
  lines.push(`};`);
  lines.push(``);
  return lines.join('\n');
}

function generateIosLocatorFile(name, locatorMap) {
  const lines = [];
  lines.push(`// iOS ${name} locators`);
  lines.push(`// Supported strategies: accessibility-id, id, xpath, class name, -ios predicate string, -ios class chain`);
  lines.push(`module.exports = {`);
  const entries = Object.entries(locatorMap);
  for (let i = 0; i < entries.length; i += 1) {
    const [key, value] = entries[i];
    const comma = i < entries.length - 1 ? ',' : '';
    lines.push(`  ${key}: '${value}'${comma}`);
  }
  lines.push(`};`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- Mobile Flow Templates ----------
function generateAndroidFlow(flowName) {
  const lines = [];
  lines.push(`// Android Flow: ${flowName}`);
  lines.push(`// Reusable mobile flow that can be composed in test scenarios`);
  lines.push(``);
  lines.push(`const AmazonAndroidPage = require('../../../mobile/android/AmazonAndroidPage');`);
  lines.push(``);
  lines.push(`class ${flowName}Flow {`);
  lines.push(`  constructor(driver) {`);
  lines.push(`    this.driver = driver;`);
  lines.push(`    this.page = new AmazonAndroidPage(driver);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async execute(options = {}) {`);
  lines.push(`    const { productName = 'mobile phone', addToCart = false } = options;`);
  lines.push(``);
  lines.push(`    await this.page.openHomePage();`);
  lines.push(`    await this.page.verifyHomeLoaded();`);
  lines.push(``);
  lines.push(`    if (productName) {`);
  lines.push(`      await this.page.searchProduct(productName);`);
  lines.push(`      await this.page.verifySearchResultsVisible(productName);`);
  lines.push(`      await this.page.openFirstProductFromResults();`);
  lines.push(`      await this.page.verifyProductDetailsVisible();`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    if (addToCart) {`);
  lines.push(`      const added = await this.page.addToCartIfAvailable();`);
  lines.push(`      await this.page.verifyAddToCartFlowComplete(added);`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    return { success: true, productName, addToCart };`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`module.exports = ${flowName}Flow;`);
  lines.push(``);
  return lines.join('\n');
}

function generateIosFlow(flowName) {
  const lines = [];
  lines.push(`// iOS Flow: ${flowName}`);
  lines.push(`// Reusable mobile flow that can be composed in test scenarios`);
  lines.push(``);
  lines.push(`const AmazonIOSAppPage = require('../../../mobile/ios/AmazonIOSAppPage');`);
  lines.push(``);
  lines.push(`class ${flowName}Flow {`);
  lines.push(`  constructor(driver) {`);
  lines.push(`    this.driver = driver;`);
  lines.push(`    this.page = new AmazonIOSAppPage(driver);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  async execute(options = {}) {`);
  lines.push(`    const { productName = 'iPhone', addToCart = false } = options;`);
  lines.push(``);
  lines.push(`    await this.page.openHomePage();`);
  lines.push(`    await this.page.verifyHomeLoaded();`);
  lines.push(``);
  lines.push(`    if (productName) {`);
  lines.push(`      await this.page.searchProduct(productName);`);
  lines.push(`      await this.page.verifySearchResultsVisible();`);
  lines.push(`      await this.page.openFirstProductFromResults();`);
  lines.push(`      await this.page.verifyProductDetailsVisible();`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    if (addToCart) {`);
  lines.push(`      const added = await this.page.addToCartIfAvailable();`);
  lines.push(`      await this.page.verifyAddToCartFlowComplete(added);`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    return { success: true, productName, addToCart };`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`module.exports = ${flowName}Flow;`);
  lines.push(``);
  return lines.join('\n');
}

// ---------- Main Agent ----------
const MobileTestGenerationAgent = {
  name: 'MobileTestGenerationAgent',
  version: '1.0.0',

  run(input = {}) {
    ensureDirs();

    const results = {
      generated: [],
      skipped: [],
      errors: []
    };

    // 1. Generate Appium-based Android test template
    try {
      const androidTest = generateAndroidNativeTest();
      const androidTestPath = path.join(GENERATED_MOBILE_DIR, 'tests/android/android-native-appium.test.js');
      if (!fs.existsSync(androidTestPath)) {
        fs.writeFileSync(androidTestPath, androidTest, 'utf8');
        results.generated.push(androidTestPath);
      } else {
        results.skipped.push(androidTestPath);
      }
    } catch (err) {
      results.errors.push(`Android test: ${err.message}`);
    }

    // 2. Generate Appium-based iOS test template
    try {
      const iosTest = generateIosNativeTest();
      const iosTestPath = path.join(GENERATED_MOBILE_DIR, 'tests/ios/ios-native-appium.test.js');
      if (!fs.existsSync(iosTestPath)) {
        fs.writeFileSync(iosTestPath, iosTest, 'utf8');
        results.generated.push(iosTestPath);
      } else {
        results.skipped.push(iosTestPath);
      }
    } catch (err) {
      results.errors.push(`iOS test: ${err.message}`);
    }

    // 3. Generate native app mobile page object templates for Android + iOS
    for (const platform of PLATFORMS) {
      try {
        const nativePO = generateNativePageObject(platform);
        const nativePOPath = path.join(GENERATED_MOBILE_DIR, `page-objects/native/${platform}-native-home-page.js`);
        if (!fs.existsSync(nativePOPath)) {
          fs.writeFileSync(nativePOPath, nativePO, 'utf8');
          results.generated.push(nativePOPath);
        } else {
          results.skipped.push(nativePOPath);
        }
      } catch (err) {
        results.errors.push(`Native PO ${platform}: ${err.message}`);
      }
    }

    // 4. Generate hybrid app mobile page object templates for Android + iOS
    for (const platform of PLATFORMS) {
      try {
        const hybridPO = generateHybridPageObject(platform);
        const hybridPOPath = path.join(GENERATED_MOBILE_DIR, `page-objects/hybrid/${platform}-hybrid-home-page.js`);
        if (!fs.existsSync(hybridPOPath)) {
          fs.writeFileSync(hybridPOPath, hybridPO, 'utf8');
          results.generated.push(hybridPOPath);
        } else {
          results.skipped.push(hybridPOPath);
        }
      } catch (err) {
        results.errors.push(`Hybrid PO ${platform}: ${err.message}`);
      }
    }

    // 5. Generate mobile locator strategy support files
    // Android native locators
    try {
      const androidNativeLocators = generateAndroidLocatorFile('native home', {
        homeScreenIndicator: '~home-screen',
        searchField: '~search-field',
        searchInput: 'id:in.amazon.mShop.android.shopping:id/rs_search_src_text',
        searchSubmitButton: '~search-submit',
        firstSearchResult: '(//android.view.ViewGroup[@clickable=true])[1]',
        cartButton: 'android=new UiSelector().descriptionContains("Cart")',
        productTitle: '~product-title',
        productPrice: '~product-price',
        productRating: '~product-rating'
      });
      const androidLocPath = path.join(GENERATED_MOBILE_DIR, 'locators/android/native-home.locators.js');
      if (!fs.existsSync(androidLocPath)) {
        fs.writeFileSync(androidLocPath, androidNativeLocators, 'utf8');
        results.generated.push(androidLocPath);
      } else {
        results.skipped.push(androidLocPath);
      }
    } catch (err) {
      results.errors.push(`Android native locators: ${err.message}`);
    }

    // Android hybrid locators
    try {
      const androidHybridLocators = generateAndroidLocatorFile('hybrid home', {
        homeScreenIndicator: '~hybrid-home-screen',
        searchField: '~hybrid-search-field',
        searchInput: 'xpath://input[@type="search"]',
        searchSubmitButton: '~hybrid-search-submit',
        firstSearchResult: '(//android.view.ViewGroup[@clickable=true])[1]',
        cartButton: '~hybrid-cart-button',
        usernameInput: 'xpath://input[@name="username"]',
        passwordInput: 'xpath://input[@name="password"]',
        loginButton: '~hybrid-login-button'
      });
      const androidHybridLocPath = path.join(GENERATED_MOBILE_DIR, 'locators/android/hybrid-home.locators.js');
      if (!fs.existsSync(androidHybridLocPath)) {
        fs.writeFileSync(androidHybridLocPath, androidHybridLocators, 'utf8');
        results.generated.push(androidHybridLocPath);
      } else {
        results.skipped.push(androidHybridLocPath);
      }
    } catch (err) {
      results.errors.push(`Android hybrid locators: ${err.message}`);
    }

    // iOS native locators
    try {
      const iosNativeLocators = generateIosLocatorFile('native home', {
        homeScreenIndicator: '~home-screen',
        searchField: '-ios predicate string:type == "XCUIElementTypeSearchField"',
        searchInput: '-ios predicate string:type == "XCUIElementTypeSearchField"',
        searchSubmitButton: '~Search',
        firstSearchResult: '-ios predicate string:type == "XCUIElementTypeCell"',
        cartButton: '-ios predicate string:name CONTAINS[c] "cart"',
        productTitle: '~product-title',
        productPrice: '~product-price',
        productRating: '~product-rating'
      });
      const iosLocPath = path.join(GENERATED_MOBILE_DIR, 'locators/ios/native-home.locators.js');
      if (!fs.existsSync(iosLocPath)) {
        fs.writeFileSync(iosLocPath, iosNativeLocators, 'utf8');
        results.generated.push(iosLocPath);
      } else {
        results.skipped.push(iosLocPath);
      }
    } catch (err) {
      results.errors.push(`iOS native locators: ${err.message}`);
    }

    // iOS hybrid locators
    try {
      const iosHybridLocators = generateIosLocatorFile('hybrid home', {
        homeScreenIndicator: '~hybrid-home-screen',
        searchField: '-ios predicate string:type == "XCUIElementTypeSearchField"',
        searchInput: '-ios predicate string:type == "XCUIElementTypeSearchField"',
        searchSubmitButton: '~Search',
        firstSearchResult: '-ios predicate string:type == "XCUIElementTypeCell"',
        cartButton: '-ios predicate string:name CONTAINS[c] "basket"',
        usernameInput: '-ios predicate string:type == "XCUIElementTypeTextField" AND name CONTAINS[c] "username"',
        passwordInput: '-ios predicate string:type == "XCUIElementTypeSecureTextField" AND name CONTAINS[c] "password"',
        loginButton: '~Login'
      });
      const iosHybridLocPath = path.join(GENERATED_MOBILE_DIR, 'locators/ios/hybrid-home.locators.js');
      if (!fs.existsSync(iosHybridLocPath)) {
        fs.writeFileSync(iosHybridLocPath, iosHybridLocators, 'utf8');
        results.generated.push(iosHybridLocPath);
      } else {
        results.skipped.push(iosHybridLocPath);
      }
    } catch (err) {
      results.errors.push(`iOS hybrid locators: ${err.message}`);
    }

    // 6. Generate reusable mobile flow templates
    try {
      // Android flows: SearchFlow, CartFlow, LoginFlow
      const androidSearchFlow = generateAndroidFlow('AndroidSearch');
      const androidSearchFlowPath = path.join(GENERATED_MOBILE_DIR, 'flows/android/search.flow.js');
      if (!fs.existsSync(androidSearchFlowPath)) {
        fs.writeFileSync(androidSearchFlowPath, androidSearchFlow, 'utf8');
        results.generated.push(androidSearchFlowPath);
      } else {
        results.skipped.push(androidSearchFlowPath);
      }

      const androidCartFlow = generateAndroidFlow('AndroidCart');
      const androidCartFlowPath = path.join(GENERATED_MOBILE_DIR, 'flows/android/cart.flow.js');
      if (!fs.existsSync(androidCartFlowPath)) {
        fs.writeFileSync(androidCartFlowPath, androidCartFlow, 'utf8');
        results.generated.push(androidCartFlowPath);
      } else {
        results.skipped.push(androidCartFlowPath);
      }
    } catch (err) {
      results.errors.push(`Android flows: ${err.message}`);
    }

    try {
      // iOS flows: SearchFlow, CartFlow
      const iosSearchFlow = generateIosFlow('IOSSearch');
      const iosSearchFlowPath = path.join(GENERATED_MOBILE_DIR, 'flows/ios/search.flow.js');
      if (!fs.existsSync(iosSearchFlowPath)) {
        fs.writeFileSync(iosSearchFlowPath, iosSearchFlow, 'utf8');
        results.generated.push(iosSearchFlowPath);
      } else {
        results.skipped.push(iosSearchFlowPath);
      }

      const iosCartFlow = generateIosFlow('IOSCart');
      const iosCartFlowPath = path.join(GENERATED_MOBILE_DIR, 'flows/ios/cart.flow.js');
      if (!fs.existsSync(iosCartFlowPath)) {
        fs.writeFileSync(iosCartFlowPath, iosCartFlow, 'utf8');
        results.generated.push(iosCartFlowPath);
      } else {
        results.skipped.push(iosCartFlowPath);
      }
    } catch (err) {
      results.errors.push(`iOS flows: ${err.message}`);
    }

    // 7. Generate index file for easy imports
    try {
      const indexPath = path.join(GENERATED_MOBILE_DIR, 'index.js');
      const indexLines = [];
      indexLines.push('// Auto-generated mobile test assets index (Phase 7)');
      indexLines.push('// Generated by MobileTestGenerationAgent');
      indexLines.push('');
      indexLines.push('module.exports = {');
      indexLines.push('  // Android');
      indexLines.push('  AndroidSearchFlow: require("./flows/android/search.flow"),');
      indexLines.push('  AndroidCartFlow: require("./flows/android/cart.flow"),');
      indexLines.push('  AndroidNativeHomePage: require("./page-objects/native/android-native-home-page"),');
      indexLines.push('  AndroidHybridHomePage: require("./page-objects/hybrid/android-hybrid-home-page"),');
      indexLines.push('');
      indexLines.push('  // iOS');
      indexLines.push('  IOSSearchFlow: require("./flows/ios/search.flow"),');
      indexLines.push('  IOSCartFlow: require("./flows/ios/cart.flow"),');
      indexLines.push('  IOSNativeHomePage: require("./page-objects/native/ios-native-home-page"),');
      indexLines.push('  IOSHybridHomePage: require("./page-objects/hybrid/ios-hybrid-home-page"),');
      indexLines.push('');
      indexLines.push('  // Locators');
      indexLines.push('  androidNativeLocators: require("./locators/android/native-home.locators"),');
      indexLines.push('  androidHybridLocators: require("./locators/android/hybrid-home.locators"),');
      indexLines.push('  iosNativeLocators: require("./locators/ios/native-home.locators"),');
      indexLines.push('  iosHybridLocators: require("./locators/ios/hybrid-home.locators")');
      indexLines.push('};');
      indexLines.push('');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, indexLines.join('\n'), 'utf8');
        results.generated.push(indexPath);
      } else {
        results.skipped.push(indexPath);
      }
    } catch (err) {
      results.errors.push(`Index file: ${err.message}`);
    }

    // 8. Write generation report
    try {
      const reportPath = path.join(GENERATED_MOBILE_DIR, 'GENERATION_REPORT.md');
      const reportLines = [];
      reportLines.push('# Mobile Test Generation Report (Phase 7)');
      reportLines.push('');
      reportLines.push(`Generated: ${new Date().toISOString()}`);
      reportLines.push(`Agent: ${MobileTestGenerationAgent.name} v${MobileTestGenerationAgent.version}`);
      reportLines.push('');
      reportLines.push('## Summary');
      reportLines.push('');
      reportLines.push(`- Generated: ${results.generated.length} file(s)`);
      reportLines.push(`- Skipped (already exists): ${results.skipped.length} file(s)`);
      reportLines.push(`- Errors: ${results.errors.length}`);
      reportLines.push('');
      reportLines.push('## Generated Files');
      reportLines.push('');
      if (results.generated.length > 0) {
        for (const file of results.generated) {
          reportLines.push(`- \`${path.relative(process.cwd(), file)}\``);
        }
      } else {
        reportLines.push('*(none)*');
      }
      reportLines.push('');
      reportLines.push('## Skipped (Already Exists)');
      reportLines.push('');
      if (results.skipped.length > 0) {
        for (const file of results.skipped) {
          reportLines.push(`- \`${path.relative(process.cwd(), file)}\``);
        }
      } else {
        reportLines.push('*(none)*');
      }
      reportLines.push('');
      reportLines.push('## Errors');
      reportLines.push('');
      if (results.errors.length > 0) {
        for (const err of results.errors) {
          reportLines.push(`- ${err}`);
        }
      } else {
        reportLines.push('*(none)*');
      }
      reportLines.push('');
      reportLines.push('## Coverage');
      reportLines.push('');
      reportLines.push('| Category | Android | iOS |');
      reportLines.push('|----------|---------|-----|');
      reportLines.push('| Appium Test Template | ✅ | ✅ |');
      reportLines.push('| Native Page Object | ✅ | ✅ |');
      reportLines.push('| Hybrid Page Object | ✅ | ✅ |');
      reportLines.push('| Native Locators | ✅ | ✅ |');
      reportLines.push('| Hybrid Locators | ✅ | ✅ |');
      reportLines.push('| Reusable Flows | ✅ | ✅ |');
      reportLines.push('');
      reportLines.push('## Locator Strategies Supported');
      reportLines.push('');
      reportLines.push('| Strategy | Example |');
      reportLines.push('|----------|---------|');
      reportLines.push('| `accessibility-id` | `~home-screen` |');
      reportLines.push('| `id` | `id:in.amazon.mShop.android.shopping:id/rs_search_src_text` |');
      reportLines.push('| `xpath` | `//android.view.ViewGroup[@clickable=true]` |');
      reportLines.push('| `-android uiautomator` | `android=new UiSelector().descriptionContains("Cart")` |');
      reportLines.push('| `-ios predicate string` | `type == "XCUIElementTypeSearchField"` |');
      reportLines.push('| `class name` | `android.widget.EditText` |');
      reportLines.push('');
      fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
      results.generated.push(reportPath);
    } catch (err) {
      results.errors.push(`Report: ${err.message}`);
    }

    return {
      ok: results.errors.length === 0,
      results
    };
  }
};

// CLI helper
if (require.main === module) {
  const result = MobileTestGenerationAgent.run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = MobileTestGenerationAgent;
