const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Failure Analysis Agent',
  role: 'Analyze Cucumber/Playwright failures from logs, screenshots, traces, and reports.',
  promptFile: 'failure-analysis.md',
  outputType: 'Failure analysis report'
});
