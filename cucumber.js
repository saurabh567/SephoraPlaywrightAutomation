// Cucumber runtime configuration for features, step definitions, hooks, reports, retries, parallel runs, and timeouts.
const reportDir = process.env.REPORT_DIR || 'reports';

module.exports = {
  default: {
    require: [
      'hooks/hooks.js',
      'step-definitions/**/*.js'
    ],
    paths: ['features/**/*.feature'],
    format: [
      'progress',
      `json:${reportDir}/json/cucumber-report.json`,
      `html:${reportDir}/html/cucumber-report.html`
    ],
    retry: Number(process.env.RETRIES || 0),
    parallel: Number(process.env.PARALLEL || 1),
    timeout: Number(process.env.TIMEOUT || 60000) + 10000
  }
};
