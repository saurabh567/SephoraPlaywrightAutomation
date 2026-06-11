require('dotenv').config();
const LlmService = require('../rag/llmService');

class LLMClient {
  constructor(options = {}) {
    this.client = new LlmService(options);
  }

  isMockMode() {
    return false;
  }

  async complete({ systemPrompt, userPrompt }) {
    const result = await this.client.complete({ systemPrompt, userPrompt });
    return result.content;
  }
}

module.exports = LLMClient;
