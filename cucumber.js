module.exports = {
  default: {
    require: [
      'hooks/hooks.js',
      'step-definitions/**/*.js'
    ],
    paths: ['features/**/*.feature'],
    format: [
      'progress',
      'json:reports/json/cucumber-report.json',
      'html:reports/html/cucumber-report.html'
    ],
    retry: Number(process.env.RETRIES || 0),
    parallel: Number(process.env.PARALLEL || 1),
    timeout: 60 * 1000
  }
};
