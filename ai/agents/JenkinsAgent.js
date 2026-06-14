// JenkinsAgent - Analyzes Jenkins/CI pipeline failures and recommends fixes
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  run: async function run(input = {}) {
    console.log('[JenkinsAgent] Analyzing CI/CD pipeline');

    const consoleLogPath = input.consoleLogPath || path.join(process.cwd(), 'ai/input/jenkins-console.log');
    let consoleLog = '';

    if (fs.existsSync(consoleLogPath)) {
      consoleLog = fs.readFileSync(consoleLogPath, 'utf8');
    } else {
      consoleLog = input.consoleLog || 'No Jenkins console log provided';
    }

    // Analyze the log for common failure patterns
    const analysis = {
      failures: [],
      warnings: [],
      recommendations: []
    };

    const lowerLog = consoleLog.toLowerCase();

    // Build failures
    if (lowerLog.includes('build failed') || lowerLog.includes('error:') && (lowerLog.includes('npm') || lowerLog.includes('node'))) {
      analysis.failures.push({
        type: 'BUILD_FAILURE',
        severity: 'critical',
        description: 'Build process failed. Check npm/node dependencies and build scripts.',
        evidence: extractContext(consoleLog, /(error.*npm|error.*build|build failed)/i)
      });
      analysis.recommendations.push('Run `npm ci` to clean install dependencies', 'Check package.json for version conflicts');
    }

    // Test failures
    if (lowerLog.includes('test failed') || lowerLog.includes('cucumber') && lowerLog.includes('failing') ||
        lowerLog.includes('scenarios failed') || lowerLog.includes('failed scenarios')) {
      analysis.failures.push({
        type: 'TEST_FAILURE',
        severity: 'high',
        description: 'One or more test scenarios failed during the CI run.',
        evidence: extractContext(consoleLog, /(\d+ failed|\d+ scenarios? failed|failing scenarios)/i)
      });
      analysis.recommendations.push('Check the Cucumber HTML report for failure details',
        'Run the failed tests locally with `npm run test:core`',
        'Review screenshots in reports/screenshots/');
    }

    // Timeout issues
    if (lowerLog.includes('timeout') || lowerLog.includes('timed out')) {
      analysis.failures.push({
        type: 'TIMEOUT',
        severity: 'high',
        description: 'Pipeline or test timed out.',
        evidence: extractContext(consoleLog, /(timed? ?out|timeout)/i)
      });
      analysis.recommendations.push('Increase timeout values in playwright.config.js',
        'Check if the application is slow to respond',
        'Consider adding wait strategies in page objects');
    }

    // Environment issues
    if (lowerLog.includes('environment') || lowerLog.includes('not found') && (lowerLog.includes('command') || lowerLog.includes('binary'))) {
      analysis.failures.push({
        type: 'ENVIRONMENT',
        severity: 'critical',
        description: 'Required environment, tool, or dependency not found.',
        evidence: extractContext(consoleLog, /(not found|command not found|no such file)/i)
      });
      analysis.recommendations.push('Verify CI agent has all required tools installed (Node, browsers, etc.)',
        'Check PATH environment variable',
        'Review CI configuration in Jenkinsfile');
    }

    // Infrastructure issues
    if (lowerLog.includes('disk') || lowerLog.includes('memory') || lowerLog.includes('out of') ||
        lowerLog.includes('resource') || lowerLog.includes('quota')) {
      analysis.failures.push({
        type: 'INFRASTRUCTURE',
        severity: 'critical',
        description: 'CI agent running out of resources.',
        evidence: extractContext(consoleLog, /(out of|disk|memory|resource|quota)/i)
      });
      analysis.recommendations.push('Increase CI agent resources (memory, disk)',
        'Clean up old workspaces',
        'Implement artifact cleanup in Jenkins pipeline');
    }

    // Git issues
    if (lowerLog.includes('git') && (lowerLog.includes('failed') || lowerLog.includes('error'))) {
      analysis.failures.push({
        type: 'GIT',
        severity: 'high',
        description: 'Git operation failed.',
        evidence: extractContext(consoleLog, /(git.*fail|git.*error)/i)
      });
      analysis.recommendations.push('Check git credentials and SSH keys on CI agent',
        'Verify the branch exists and is accessible',
        'Check for merge conflicts');
    }

    // If no specific failure found
    if (analysis.failures.length === 0) {
      if (lowerLog.includes('success') || lowerLog.includes('passed')) {
        analysis.status = 'SUCCESS';
        analysis.summary = 'Pipeline completed successfully.';
      } else {
        analysis.failures.push({
          type: 'UNKNOWN',
          severity: 'medium',
          description: 'Pipeline failure could not be specifically classified.',
          evidence: consoleLog.slice(0, 500)
        });
        analysis.recommendations.push('Review the full Jenkins console output manually',
          'Check Jenkins configuration and plugin versions',
          'Enable verbose logging for better diagnostics');
      }
    }

    // Categorize warnings
    if (lowerLog.includes('warning') || lowerLog.includes('deprecated')) {
      analysis.warnings.push({
        type: 'DEPRECATION',
        description: 'Deprecated features or warnings detected in the build.'
      });
    }

    // Write report
    const outPath = path.join(process.cwd(), 'reports/ai', 'jenkins-analysis.md');
    fs.ensureDirSync(path.dirname(outPath));

    const lines = [];
    lines.push('# Jenkins Pipeline Analysis');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Status: ${analysis.status || 'FAILURE'}`);
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    if (analysis.failures.length > 0) {
      for (const f of analysis.failures) {
        lines.push(`### ${f.type} (${f.severity})`);
        lines.push(`- **Description**: ${f.description}`);
        lines.push(`- **Evidence**: \`\`\`\n${f.evidence || 'N/A'}\n\`\`\``);
        lines.push('');
      }
    } else {
      lines.push('No failures detected.');
      lines.push('');
    }

    if (analysis.warnings.length > 0) {
      lines.push('## Warnings');
      lines.push('');
      for (const w of analysis.warnings) {
        lines.push(`- **${w.type}**: ${w.description}`);
      }
      lines.push('');
    }

    if (analysis.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const r of analysis.recommendations) {
        lines.push(`1. ${r}`);
      }
      lines.push('');
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    return {
      ok: true,
      report: path.relative(process.cwd(), outPath),
      failureCount: analysis.failures.length,
      status: analysis.status || 'FAILURE',
      recommendations: analysis.recommendations
    };
  }
};

function extractContext(text, pattern, contextLines = 2) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      return lines.slice(start, end).join('\n');
    }
  }
  return '';
}
