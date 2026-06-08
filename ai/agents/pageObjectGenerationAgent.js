const BaseAgent = require('../core/BaseAgent');

class PageObjectGenerationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'PageObjectGenerationAgent',
      inputPath: 'ai/input/page-requirement.txt',
      outputPath: 'ai/output/generated-page-object.js',
      promptPath: 'ai/prompts/page-object-generation.prompt.md',
      purpose: 'Generate Playwright Page Object Model class.'
    });
  }

  getMockOutput() {
    return [
      "const BasePage = require('./BasePage');",
      '',
      'class GeneratedPage extends BasePage {',
      '  constructor(page) {',
      '    super(page);',
      "    this.searchInput = page.locator(\"//input[contains(@placeholder, 'Search')]\");",
      "    this.firstProduct = page.locator('(//a[contains(@href, \"/product\")])[1]');",
      "    this.addToBagButton = page.locator(\"//button[contains(normalize-space(), 'Add')]\");",
      '  }',
      '',
      '  async searchProduct(productName) {',
      '    await this.searchInput.fill(productName);',
      "    await this.page.keyboard.press('Enter');",
      '  }',
      '',
      '  async openFirstProduct() {',
      '    await this.firstProduct.click();',
      '  }',
      '',
      '  async addToBag() {',
      '    await this.addToBagButton.click();',
      '  }',
      '}',
      '',
      'module.exports = GeneratedPage;'
    ].join('\n');
  }
}

module.exports = PageObjectGenerationAgent;
