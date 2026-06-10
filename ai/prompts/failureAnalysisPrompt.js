module.exports = {
  system: 'Analyze Playwright, Cucumber, Jenkins, and locator failures using retrieved historical context.',
  outputFormat: [
    '# Failure Analysis Summary',
    '',
    '## Root Cause',
    '## Similar Past Failures',
    '## Suggested Fix',
    '## Next Debugging Steps'
  ].join('\n')
};
