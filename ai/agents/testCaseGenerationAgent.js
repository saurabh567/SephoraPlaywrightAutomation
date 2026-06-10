const BaseAgent = require('../core/BaseAgent');
const fs = require('fs-extra');
const path = require('path');
const RetrievalService = require('../vector-db/retrievalService');

function splitRequirements(input) {
  const cleanedInput = input.trim();
  if (!cleanedInput) return ['User should be able to search products on Amazon India.'];

  return cleanedInput
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean);
}

function getRequirementContext(requirement) {
  const lower = requirement.toLowerCase();

  if (
    lower.includes('product detail') &&
    lower.includes('quantity') &&
    lower.includes('add to cart') &&
    lower.includes('cart')
  ) {
    return {
      featureName: 'product details add to cart flow',
      validAction: 'product quantity can be selected and added to cart from product details page',
      result: 'cart page can be opened after adding the product',
      singleScenario: true
    };
  }

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
      featureName: 'shopping cart',
      validAction: 'adding a product to the shopping cart',
      result: 'product is visible in the shopping cart',
      invalidAction: 'opening shopping cart with no product added',
      emptyAction: 'removing all items from shopping cart',
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

  if (lower.includes('product detail') || lower.includes('product details') || lower.includes('add to cart')) {
    return { key: 'product-details', title: 'Product Details Page', fileName: 'product_details.feature' };
  }

  if (lower.includes('cart') || lower.includes('bag')) {
    return { key: 'cart', title: 'Cart Page', fileName: 'cart.feature' };
  }

  return { key: 'home', title: 'Home Page', fileName: 'home.feature' };
}

function buildTestCasesForRequirement(requirement) {
  const context = getRequirementContext(requirement);

  if (context.singleScenario) {
    return [
      `### Requirement: ${requirement}`,
      '',
      '#### Positive',
      `- Verify ${context.validAction} and ${context.result}`,
      ''
    ];
  }

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

  async generateFeatureWithVectorDb(requirementText) {
    console.log('[AI] Running TestCaseGenerationAgent with Vector DB context');
    const requirement = requirementText && requirementText.trim()
      ? requirementText.trim()
      : this.readInput();
    const retrieval = new RetrievalService();
    const similarFeatures = await retrieval.searchFeatureFiles(requirement, 3);
    const feature = classifyFeature(requirement);
    const gherkin = this.buildVectorBackedFeature(requirement, feature, similarFeatures);
    const outputPath = path.join(process.cwd(), 'ai/generated-features', feature.fileName);

    fs.ensureDirSync(path.dirname(outputPath));
    fs.writeFileSync(outputPath, gherkin);

    return {
      outputPath: path.relative(process.cwd(), outputPath),
      similarFeatureCount: similarFeatures.length
    };
  }

  buildVectorBackedFeature(requirement, feature, similarFeatures) {
    const context = getRequirementContext(requirement);
    const scenarioTitle = context.singleScenario
      ? `Verify ${context.validAction} and ${context.result}`
      : `Verify ${context.validAction}`;

    const lines = [
      `Feature: ${feature.title} AI Generated Scenarios`,
      '',
      '  # Generated from ai/input/requirement.txt using Vector DB retrieval.',
      `  # Target existing feature file: features/${feature.fileName}`,
      `  # Similar feature examples found: ${similarFeatures.length}`,
      '',
      '  @ai-generated @vector-db',
      `  Scenario: ${scenarioTitle}`,
      '    Given I am on the Amazon home page'
    ];

    if (feature.key === 'product-details') {
      lines.push(
        '    When I open the first product from Amazon search results',
        '    And I increase the product quantity to 2',
        '    And I add the Amazon product to cart if possible',
        '    Then the Amazon add to cart flow should complete'
      );
    } else if (feature.key === 'cart') {
      lines.push(
        '    When I open the Amazon cart from header',
        '    Then the Amazon cart page should be visible'
      );
    } else if (feature.key === 'checkout') {
      lines.push(
        '    When I proceed to checkout',
        '    Then checkout page should be displayed'
      );
    } else {
      lines.push(
        `    When I perform the requirement action "${requirement.replace(/"/g, '\\"')}"`,
        '    Then the expected requirement result should be visible'
      );
    }

    if (similarFeatures.length > 0) {
      lines.push('', '  # Similar Vector DB context:');
      for (const match of similarFeatures) {
        lines.push(`  # - ${match.metadata?.sourcePath || 'unknown source'} score=${match.score ?? ''}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = TestCaseGenerationAgent;
