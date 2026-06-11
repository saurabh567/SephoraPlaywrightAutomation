const config = require('../config/ai.config');
const LlmService = require('../rag/llmService');

class LlmClient {
  constructor(llmConfig = config.llm) {
    this.client = new LlmService({
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens
    });
  }

  async complete({ system, user }) {
    const result = await this.client.complete({
      systemPrompt: system,
      userPrompt: user
    });
    return result.content;
  }
}

module.exports = LlmClient;
