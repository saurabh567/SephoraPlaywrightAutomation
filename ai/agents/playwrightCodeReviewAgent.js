const fs = require('fs-extra');
const path = require('path');
const BaseAgent = require('../core/BaseAgent');

class PlaywrightCodeReviewAgent extends BaseAgent {
  constructor() {
    super({
      name: 'PlaywrightCodeReviewAgent',
      inputPath: 'framework files',
      outputPath: 'ai/output/code-review-report.md',
      promptPath: 'ai/prompts/playwright-code-review.prompt.md',
      purpose: 'Review Playwright framework for hardcoding, poor locators, duplicate code, waits, and POM violations.'
    });
  }

  collectFiles(dir, files = []) {
    if (!fs.existsSync(this.absolute(dir))) return files;
    for (const item of fs.readdirSync(this.absolute(dir))) {
      const fullPath = path.join(this.absolute(dir), item);
      const relativePath = path.relative(this.rootDir, fullPath);
      if (fs.statSync(fullPath).isDirectory()) {
        this.collectFiles(relativePath, files);
      } else if (item.endsWith('.js') || item.endsWith('.feature')) {
        files.push(relativePath);
      }
    }
    return files;
  }

  readInput() {
    const files = [
      ...this.collectFiles('pages'),
      ...this.collectFiles('step-definitions'),
      ...this.collectFiles('features'),
      'hooks/hooks.js',
      'cucumber.js'
    ].filter((file) => fs.existsSync(this.absolute(file)));

    return files
      .map((file) => [`FILE: ${file}`, this.readText(file).slice(0, 3000)].join('\n'))
      .join('\n\n---\n\n');
  }

  getMockOutput(input) {
    const findings = [];
    if (input.includes('waitForTimeout')) {
      findings.push('| High | Hard wait found | Replace `waitForTimeout` with locator/action based waits. |');
    }
    if (input.includes('getByText')) {
      findings.push('| Medium | Text locator usage found | Prefer role, label, test id, or stable XPath/CSS when text changes often. |');
    }
    if (input.includes('http')) {
      findings.push('| Medium | Possible hardcoded URL | Move URLs into `.env` or config files. |');
    }
    if (findings.length === 0) {
      findings.push('| Low | No obvious mock-rule issue found | Continue reviewing selectors and duplicated actions during PR review. |');
    }

    return [
      '# Playwright Code Review Report',
      '',
      '| Severity | Finding | Recommendation |',
      '|---|---|---|',
      ...findings,
      '',
      '## Review Checklist',
      '',
      '- Page classes should contain locators and page actions.',
      '- Step definitions should call page actions, not duplicate UI logic.',
      '- Avoid hard waits.',
      '- Keep test data in `test-data` or `.env`.',
      '- Prefer stable locators.'
    ].join('\n');
  }
}

module.exports = PlaywrightCodeReviewAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Playwright Code Review Agent",
  "version": "1.0.0",
  "description": "Reviews Playwright framework code for best practices",
  "dependencies": ["pageObjectGenerationAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "review",
    "quality"
  ],
  "executionStage": "multi-agent",
  "priority": 30,
  "conditions": [
    {
      "type": "onDemand"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
