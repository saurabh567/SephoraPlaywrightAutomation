const BaseAgent = require('../core/BaseAgent');

function hasSearchScenarios(input) {
  return input.toLowerCase().includes('search');
}

function hasFooterScenarios(input) {
  return input.toLowerCase().includes('footer');
}

class StepDefinitionGenerationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'StepDefinitionGenerationAgent',
      inputPath: 'ai/output/generated-feature.feature',
      outputPath: 'ai/output/generated-step-definitions.js',
      promptPath: 'ai/prompts/step-definition-generation.prompt.md',
      purpose: 'Generate reusable Cucumber step definitions in JavaScript.'
    });
  }

  getMockOutput(input) {
    if (hasFooterScenarios(input)) {
      return [
        "const { When, Then } = require('@cucumber/cucumber');",
        "const HomePage = require('../pages/HomePage');",
        '',
        "When('I collect all footer links', async function () {",
        '  const homePage = new HomePage(this.page);',
        '  this.footerLinks = await homePage.getFooterLinks();',
        '});',
        '',
        "Then('footer links should be available with valid URLs', async function () {",
        '  const homePage = new HomePage(this.page);',
        '  await homePage.verifyFooterLinksHaveValidUrls(this.footerLinks);',
        '});',
        '',
        "Then('each footer link should have a different valid URL', async function () {",
        '  const homePage = new HomePage(this.page);',
        '  await homePage.verifyFooterLinksHaveUniqueUrls(this.footerLinks);',
        '});',
        '',
        "Then('footer external links should use valid URLs', async function () {",
        '  const homePage = new HomePage(this.page);',
        '  await homePage.verifyFooterLinksHaveValidUrls(this.footerLinks);',
        '});'
      ].join('\n');
    }

    if (!hasSearchScenarios(input)) {
      return [
        "const { Given, When, Then } = require('@cucumber/cucumber');",
        "const { expect } = require('@playwright/test');",
        "const HomePage = require('../pages/HomePage');",
        '',
        "Given('I am on the Sephora home page', async function () {",
        '  const homePage = new HomePage(this.page);',
        '  await homePage.openHomePage();',
        '});',
        '',
        "When('I perform {string}', async function (actionName) {",
        '  this.aiActionName = actionName;',
        '});',
        '',
        "Then('I should see the expected result', async function () {",
        "  await expect(this.page.locator('body')).toBeVisible();",
        '});'
      ].join('\n');
    }

    return [
      "const { Given, When, Then } = require('@cucumber/cucumber');",
      "const { expect } = require('@playwright/test');",
      "const HomePage = require('../pages/HomePage');",
      '',
      "Given('I am on the Sephora home page', async function () {",
      '  const homePage = new HomePage(this.page);',
      '  await homePage.openHomePage();',
      '});',
      '',
      "When('I search for a valid product {string}', async function (productName) {",
      '  const homePage = new HomePage(this.page);',
      '  await homePage.searchProduct(productName);',
      '});',
      '',
      "When('I search for an invalid product {string}', async function (productName) {",
      '  const homePage = new HomePage(this.page);',
      '  await homePage.searchProduct(productName);',
      '});',
      '',
      "When('I submit an empty search', async function () {",
      '  const homePage = new HomePage(this.page);',
      "  await homePage.searchProduct('');",
      '});',
      '',
      "When('I search using special characters {string}', async function (searchText) {",
      '  const homePage = new HomePage(this.page);',
      '  await homePage.searchProduct(searchText);',
      '});',
      '',
      "When('I search using very long text', async function () {",
      '  const homePage = new HomePage(this.page);',
      "  await homePage.searchProduct('lipstick'.repeat(40));",
      '});',
      '',
      "Then('I should see relevant search results', async function () {",
      "  await expect(this.page.locator('body')).toBeVisible();",
      '});',
      '',
      "Then('I should see search handled without application error', async function () {",
      "  await expect(this.page.locator('body')).toBeVisible();",
      '});'
    ].join('\n');
  }
}

module.exports = StepDefinitionGenerationAgent;
