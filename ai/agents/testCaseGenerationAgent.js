const BaseAgent = require('../core/BaseAgent');

function splitRequirements(input) {
  const cleanedInput = input.trim();
  if (!cleanedInput) return ['User should be able to search products on Sephora.'];

  return cleanedInput
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean);
}

function getRequirementContext(requirement) {
  const lower = requirement.toLowerCase();

  if (lower.includes('footer') && lower.includes('link')) {
    return {
      featureName: 'footer links',
      validAction: 'all footer links are visible and clickable',
      result: 'each footer link has a different valid URL',
      invalidAction: 'footer link with missing or empty URL',
      emptyAction: 'footer section with no available links',
      edgeOne: 'duplicate footer URLs',
      edgeTwo: 'external footer URLs opening safely'
    };
  }

  if (lower.includes('search')) {
    return {
      featureName: 'product search',
      validAction: 'valid product search',
      result: 'search results displayed',
      invalidAction: 'invalid product search',
      emptyAction: 'empty search',
      edgeOne: 'special characters in search text',
      edgeTwo: 'very long search text'
    };
  }

  if (lower.includes('login') || lower.includes('sign in')) {
    return {
      featureName: 'sign in',
      validAction: 'valid user sign in',
      result: 'user is signed in successfully',
      invalidAction: 'invalid credentials',
      emptyAction: 'empty username or password',
      edgeOne: 'special characters in email field',
      edgeTwo: 'very long email and password values'
    };
  }

  if (lower.includes('cart') || lower.includes('bag')) {
    return {
      featureName: 'shopping bag',
      validAction: 'adding a product to the shopping bag',
      result: 'product is visible in the shopping bag',
      invalidAction: 'opening shopping bag with no product added',
      emptyAction: 'removing all items from shopping bag',
      edgeOne: 'maximum allowed product quantity',
      edgeTwo: 'quantity update repeated multiple times'
    };
  }

  return {
    featureName: requirement.replace(/^user should be able to\s+/i, '').replace(/\.$/, ''),
    validAction: 'valid user action from the requirement',
    result: 'expected result from the requirement is displayed',
    invalidAction: 'invalid input or invalid action',
    emptyAction: 'empty input or missing required data',
    edgeOne: 'special characters or unusual input',
    edgeTwo: 'very long input value'
  };
}

function classifyFeature(requirement) {
  const lower = requirement.toLowerCase();

  if (lower.includes('checkout') || lower.includes('payment') || lower.includes('place order')) {
    return { key: 'checkout', title: 'Checkout Page', fileName: 'checkout.feature' };
  }

  if (lower.includes('product detail') || lower.includes('product details') || lower.includes('pincode') || lower.includes('add to bag')) {
    return { key: 'product-details', title: 'Product Details Page', fileName: 'product_details.feature' };
  }

  if (lower.includes('cart') || lower.includes('bag')) {
    return { key: 'cart', title: 'Cart Page', fileName: 'cart.feature' };
  }

  return { key: 'home', title: 'Home Page', fileName: 'home.feature' };
}

function buildTestCasesForRequirement(requirement) {
  const context = getRequirementContext(requirement);

  return [
    `### Requirement: ${requirement}`,
    '',
    '#### Positive',
    `- Verify ${context.validAction}`,
    `- Verify ${context.result}`,
    '',
    '#### Negative',
    `- Verify ${context.invalidAction}`,
    `- Verify ${context.emptyAction}`,
    '',
    '#### Edge',
    `- Verify ${context.edgeOne}`,
    `- Verify ${context.edgeTwo}`,
    ''
  ];
}

class TestCaseGenerationAgent extends BaseAgent {
  constructor() {
    super({
      name: 'TestCaseGenerationAgent',
      inputPath: 'ai/input/requirement.txt',
      outputPath: 'ai/output/generated-test-cases.md',
      promptPath: 'ai/prompts/test-case-generation.prompt.md',
      purpose: 'Convert requirement into positive, negative, and edge test cases.'
    });
  }

  getMockOutput(input) {
    const groupedRequirements = splitRequirements(input).reduce((groups, requirement) => {
      const feature = classifyFeature(requirement);
      groups[feature.key] = groups[feature.key] || { ...feature, requirements: [] };
      groups[feature.key].requirements.push(requirement);
      return groups;
    }, {});

    const lines = [
      '# Generated Test Cases',
      '',
      'Source: ai/input/requirement.txt',
      '',
      '## Feature Mapping',
      '',
      '| Page Area | Target Feature File | Requirement Count |',
      '|---|---|---|'
    ];

    for (const group of Object.values(groupedRequirements)) {
      lines.push(`| ${group.title} | ${group.fileName} | ${group.requirements.length} |`);
    }

    lines.push('');

    for (const group of Object.values(groupedRequirements)) {
      lines.push(`## ${group.title}`, '', `Target Feature File: ${group.fileName}`, '');
      for (const requirement of group.requirements) {
        lines.push(...buildTestCasesForRequirement(requirement));
      }
    }

    return lines.join('\n');
  }
}

module.exports = TestCaseGenerationAgent;
