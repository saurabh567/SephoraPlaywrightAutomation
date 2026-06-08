const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Locator Healing Agent',
  role: 'Analyze broken locators and suggest stable Playwright locator replacements.',
  promptFile: 'locator-healing.md',
  outputType: 'Locator healing recommendation'
});
