// Central AI configuration for OpenAI-compatible providers and framework paths.
require('dotenv').config();

module.exports = {
  llm: {
    // Prefer Ollama-local model env var, then OpenAI-style env, then a sensible Ollama default
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OLLAMA_LLM_MODEL || process.env.OPENAI_MODEL || 'llama3.2:3b',
    temperature: Number(process.env.AI_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.AI_MAX_TOKENS || 4000)
  },

  paths: {
    root: process.cwd(),
    features: 'features',
    stepDefinitions: 'step-definitions',
    pages: 'pages',
    testData: 'test-data',
    reports: 'reports',
    logs: 'logs',
    aiOutput: 'ai/output',
    memory: 'ai/memory/shared-memory.json',
    prompts: 'ai/prompts'
  }
};
