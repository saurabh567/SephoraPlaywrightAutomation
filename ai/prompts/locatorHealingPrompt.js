module.exports = {
  system: 'Suggest stable Playwright or Appium locators without changing source files automatically.',
  outputFormat: [
    '# Locator Healing Suggestions',
    '',
    '| Failed Locator/Error | Similar Existing Locator | Suggested Locator | Reason |',
    '|---|---|---|---|'
  ].join('\n')
};
