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
    try {
      const result = await this.client.complete({
        systemPrompt: system,
        userPrompt: user
      });
      return result.content;
    } catch (e) {
      // Fail gracefully: log and return a fallback response so agents can continue.
      try {
        const fs = require('fs');
        const p = require('path').join(process.cwd(), 'ai', 'output', 'ollama-error.log');
        fs.appendFileSync(p, `[${new Date().toISOString()}] LlmClient.complete error: ${e.message}\n`);
      } catch (e2) { /* ignore */ }
      return `LLM unavailable: ${e.message}. Agent proceeding with best-effort fallback.`;
    }
  }
}

module.exports = LlmClient;
