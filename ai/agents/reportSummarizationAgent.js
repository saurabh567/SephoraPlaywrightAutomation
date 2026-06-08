const BaseAgent = require('./baseAgent');

module.exports = new BaseAgent({
  name: 'Report Summarization Agent',
  role: 'Summarize Cucumber, Allure, Jenkins, and execution reports for stakeholders.',
  promptFile: 'report-summarization.md',
  outputType: 'Executive test report summary'
});
