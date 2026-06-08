const fs = require('fs-extra');
const BaseAgent = require('../core/BaseAgent');

class SelfHealingAutomationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'SelfHealingAutomationAgent',
      inputPath: 'ai/input/failed-locators.json',
      outputPath: 'ai/output/self-healing-suggestions.md',
      promptPath: 'ai/prompts/self-healing.prompt.md',
      purpose: 'Suggest better locators for failed elements.'
    });
  }

  readInput() {
    if (fs.existsSync(this.absolute('ai/input/failed-locators.json'))) {
      return this.readText('ai/input/failed-locators.json');
    }

    const reportPath = 'reports/json/cucumber-report.json';
    this.inputPath = reportPath;
    return this.readText(reportPath, '[]');
  }

  getMockOutput(input) {
    return [
      '# Self-Healing Locator Suggestions',
      '',
      'Mode: dry-run suggestion only. No framework files were changed automatically.',
      '',
      '| Problem | Suggested Locator Strategy | Reason |',
      '|---|---|---|',
      '| Text locator is missing or hidden | Use role, label, placeholder, test id, or a stable XPath based on nearby unique attributes. | Text can change or exist in hidden desktop/mobile DOM variants. |',
      '| Product/card locator is unstable | Use a product container XPath and then locate child elements inside that container. | Keeps the locator scoped to the correct card. |',
      '| Button text changes by state | Use role button with accessible name, or XPath with `contains(normalize-space(), ...)`. | Handles extra spaces and minor text changes. |',
      '',
      '## Input Used',
      '',
      '```json',
      input.slice(0, 2000),
      '```'
    ].join('\n');
  }
}

module.exports = SelfHealingAutomationAgent;
