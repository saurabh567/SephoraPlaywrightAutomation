import fs from 'fs-extra';
import path from 'path';
import BaseAgent from '../core/BaseAgent';
import RagService from '../rag/ragService';

function slugify(value: any) {
  return String(value || 'generated-feature')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'generated-feature';
}

function extractFeatureName(content: any) {
  const match = String(content).match(/^\s*Feature:\s*(.+)$/mi);
  return match ? slugify(match[1]) : `generated-feature-${Date.now()}`;
}

function stripMarkdownFence(content: any) {
  return String(content).trim()
    .replace(/^```(?:gherkin|feature)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

class TestCaseGenerationAgent extends BaseAgent {
  [key: string]: any;
  constructor() {
    super({
      name: 'TestCaseGenerationAgent',
      inputPath: 'ai/input/requirement.txt',
      outputPath: 'ai/output/generated-test-cases.md',
      promptPath: 'ai/prompts/test-case-generation.prompt.md',
      purpose: 'Generate executable Gherkin scenarios from requirements and retrieved framework examples.'
    });
  }

  async generateFeatureWithRag(requirementText: any) {
    const requirement = String(requirementText || this.readInput()).trim();
    if (!requirement) throw new Error('A requirement is required for RAG test generation.');

    const rag = new RagService();
    const result = await rag.generate({
      task: 'Generate a new Cucumber Gherkin feature for the supplied requirement using the project conventions in retrieved examples.',
      input: requirement,
      topK: Number(process.env.TEST_GENERATION_RAG_TOP_K || 5),
      systemPrompt: this.readPrompt(),
      instructions: [
        '- Return valid Gherkin only, without Markdown fences or explanatory prose.',
        '- Reuse existing step wording when retrieved evidence supports it.',
        '- Include positive, negative, and edge scenarios relevant to the requirement.',
        '- Do not invent unsupported application capabilities.'
      ].join('\n'),
      retrieve: async (retrieval: any, topK: any) => {
        const [features, requirements] = await Promise.all([
          retrieval.searchFeatureFiles(requirement, topK),
          retrieval.searchRequirements(requirement, Math.max(2, Math.ceil(topK / 2)))
        ]);
        return [...features, ...requirements]
          .sort((left, right) => (right.similarityScore || 0) - (left.similarityScore || 0))
          .slice(0, topK);
      }
    });

    const gherkin = stripMarkdownFence(result.content);
    if (!/^\s*Feature:/mi.test(gherkin)) {
      throw new Error('LLM response is not valid Gherkin because it does not contain a Feature declaration.');
    }
    const outputPath = path.join(process.cwd(), 'ai/generated-features', `${extractFeatureName(gherkin)}.feature`);
    fs.ensureDirSync(path.dirname(outputPath));
    fs.writeFileSync(outputPath, gherkin);

    return {
      agent: this.name,
      outputPath: path.relative(process.cwd(), outputPath),
      response: gherkin,
      retrievalEvidence: result.promptEvidence,
      model: result.model,
      usage: result.usage
    };
  }

  generateFeatureWithVectorDb(requirementText: any) {
    return this.generateFeatureWithRag(requirementText);
  }

  async run() {
    return this.generateFeatureWithRag(this.readInput());
  }
}

export default TestCaseGenerationAgent;


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "Test Case Generation Agent",
  "version": "1.0.0",
  "description": "RAG-based Gherkin test case generation from requirements",
  "dependencies": [] as any[],
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
  "priority": 40,
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
