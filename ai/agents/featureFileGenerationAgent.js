const fs = require('fs-extra');
const BaseAgent = require('../core/BaseAgent');

function extractRequirement(input) {
  const match = input.match(/Requirement:\s*(.+)/i);
  return (match?.[1] || input.split('\n').find((line) => line.trim()) || 'AI generated requirement').trim();
}

function extractBullets(input, heading, level = '##') {
  const pattern = new RegExp(`${level} ${heading}\\s+([\\s\\S]*?)(?=\\n${level} |\\n## |$)`, 'i');
  const section = input.match(pattern)?.[1] || '';
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function extractFeatureGroups(input) {
  const groupPattern = /## (Home Page|Cart Page|Product Details Page|Checkout Page)\s+Target Feature File: ([^\n]+)\s+([\s\S]*?)(?=\n## (?:Home Page|Cart Page|Product Details Page|Checkout Page)|$)/g;
  const groups = [];
  let match;

  while ((match = groupPattern.exec(input)) !== null) {
    const [, title, fileName, body] = match;
    groups.push({ title, fileName: fileName.trim(), body });
  }

  return groups;
}

function extractRequirementsFromGroup(groupBody) {
  const requirementPattern = /### Requirement: ([^\n]+)\s+([\s\S]*?)(?=\n### Requirement: |$)/g;
  const requirements = [];
  let match;

  while ((match = requirementPattern.exec(groupBody)) !== null) {
    const [, requirement, body] = match;
    requirements.push({
      requirement: requirement.trim(),
      positiveCases: extractBullets(body, 'Positive', '####'),
      negativeCases: extractBullets(body, 'Negative', '####'),
      edgeCases: extractBullets(body, 'Edge', '####')
    });
  }

  return requirements;
}

function toScenarioName(testCase) {
  return testCase.replace(/^Verify\s+/i, 'Verify ');
}

function buildWhenStep(testCase) {
  const lower = testCase.toLowerCase();
  if (isProductDetailsAddToBagFlow(testCase)) return 'When I add the Amazon product to cart if possible';
  if (lower.includes('footer')) return 'When I collect all footer links';
  if (lower.includes('duplicate footer')) return 'When I collect all footer links';
  if (lower.includes('external footer')) return 'When I collect all footer links';
  if (lower.includes('invalid product search')) return 'When I search for an invalid product "@@@invalid-product@@@"';
  if (lower.includes('valid product search')) return 'When I search for a valid product "lipstick"';
  if (lower.includes('search results displayed')) return 'When I search for a valid product "lipstick"';
  if (lower.includes('empty search')) return 'When I submit an empty search';
  if (lower.includes('special characters')) return 'When I search using special characters "@@@###"';
  if (lower.includes('very long')) return 'When I search using very long text';
  return `When I perform "${testCase}"`;
}

function isProductDetailsAddToBagFlow(testCase) {
  const lower = testCase.toLowerCase();
  return lower.includes('quantity') && lower.includes('add') && lower.includes('cart');
}

function buildThenStep(testCase) {
  const lower = testCase.toLowerCase();
  if (isProductDetailsAddToBagFlow(testCase)) return 'Then the Amazon add to cart flow should complete';
  if (lower.includes('different valid url') || lower.includes('duplicate footer')) {
    return 'Then each footer link should have a different valid URL';
  }
  if (lower.includes('footer link with missing') || lower.includes('footer section with no')) {
    return 'Then footer links should be available with valid URLs';
  }
  if (lower.includes('external footer')) return 'Then footer external links should use valid URLs';
  if (lower.includes('footer')) return 'Then footer links should be available with valid URLs';
  if (lower.includes('cart') || lower.includes('bag')) return 'Then I should see the expected cart result';
  if (lower.includes('product')) return 'Then I should see the expected product details result';
  if (lower.includes('checkout') || lower.includes('payment')) return 'Then I should see the expected checkout result';
  if (lower.includes('invalid') || lower.includes('empty')) return 'Then I should see search handled without application error';
  if (lower.includes('special characters') || lower.includes('very long')) return 'Then I should see search handled without application error';
  if (lower.includes('valid product search') || lower.includes('results')) return 'Then I should see relevant search results';
  return 'Then I should see the expected result';
}

function buildBackgroundStep(title) {
  if (title === 'Product Details Page') return '    Given I open the first Amazon product from search results';
  if (title === 'Cart Page') return '    Given I am on the Amazon cart page';
  return '    Given I am on the Amazon home page';
}

function buildScenarioSteps(testCase) {
  if (isProductDetailsAddToBagFlow(testCase)) {
    return [
      '    When I increase product quantity to 2',
      '    And I add the Amazon product to cart if possible',
      '    Then the Amazon add to cart flow should complete'
    ];
  }

  return [`    ${buildWhenStep(testCase)}`, `    ${buildThenStep(testCase)}`];
}

class FeatureFileGenerationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'FeatureFileGenerationAgent',
      inputPath: 'ai/output/generated-test-cases.md',
      outputPath: 'ai/output/generated-feature.feature',
      promptPath: 'ai/prompts/feature-file-generation.prompt.md',
      purpose: 'Generate Cucumber Gherkin feature file.'
    });
  }

  readInput() {
    if (fs.existsSync(this.absolute('ai/output/generated-test-cases.md'))) {
      return this.readText('ai/output/generated-test-cases.md');
    }
    this.inputPath = 'ai/input/requirement.txt';
    return this.readText('ai/input/requirement.txt');
  }

  buildFeatureContent(title, requirements) {
    const scenarios = requirements.flatMap(({ positiveCases, negativeCases, edgeCases }) => [
      ...positiveCases.map((testCase) => ({ tag: '@positive', testCase })),
      ...negativeCases.map((testCase) => ({ tag: '@negative', testCase })),
      ...edgeCases.map((testCase) => ({ tag: '@edge', testCase }))
    ]);

    return [
      '@ai @generated',
      `Feature: ${title}`,
      '',
      '  Background:',
      buildBackgroundStep(title),
      '',
      ...scenarios.flatMap(({ tag, testCase }) => [
        `  ${tag}`,
        `  Scenario: ${toScenarioName(testCase)}`,
        ...buildScenarioSteps(testCase),
        ''
      ])
    ].join('\n');
  }

  writeOutput(content) {
    const fullPath = super.writeOutput(content);
    const groups = extractFeatureGroups(this.latestInput || '');

    if (groups.length > 0) {
      for (const group of groups) {
        const requirements = extractRequirementsFromGroup(group.body);
        const featureContent = this.buildFeatureContent(group.title, requirements);
        const generatedFeaturePath = this.absolute(`ai/output/generated-features/${group.fileName}`);
        fs.ensureDirSync(require('path').dirname(generatedFeaturePath));
        fs.writeFileSync(generatedFeaturePath, featureContent);
      }
    }

    return fullPath;
  }

  getMockOutput(input) {
    this.latestInput = input;
    const groups = extractFeatureGroups(input);

    if (groups.length > 0) {
      return groups
        .map((group) => this.buildFeatureContent(group.title, extractRequirementsFromGroup(group.body)))
        .join('\n\n');
    }

    const requirement = extractRequirement(input);
    const positiveCases = extractBullets(input, 'Positive');
    const negativeCases = extractBullets(input, 'Negative');
    const edgeCases = extractBullets(input, 'Edge');
    const scenarios = [
      ...positiveCases.map((testCase) => ({ tag: '@positive', testCase })),
      ...negativeCases.map((testCase) => ({ tag: '@negative', testCase })),
      ...edgeCases.map((testCase) => ({ tag: '@edge', testCase }))
    ];

    return [
      '@ai @generated',
      `Feature: ${requirement}`,
      '',
      '  Background:',
      '    Given I am on the Amazon home page',
      '',
      ...scenarios.flatMap(({ tag, testCase }) => [
        `  ${tag}`,
        `  Scenario: ${toScenarioName(testCase)}`,
        ...buildScenarioSteps(testCase),
        ''
      ])
    ].join('\n');
  }
}

module.exports = FeatureFileGenerationAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Feature File Generation Agent",
  "version": "1.0.0",
  "description": "Generates Cucumber Gherkin feature files from test cases",
  "dependencies": ["testCaseGenerationAgent"],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "generation",
    "gherkin"
  ],
  "executionStage": "execution",
  "priority": 35,
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
