/**
 * LLMClient.js
 *
 * Enterprise LLM client that routes through LLMProviderManager.
 * All existing agents automatically benefit from multi-LLM routing,
 * fallback, retry, and rate-limit handling.
 *
 * Usage (unchanged from previous API):
 *   const llm = new LLMClient();
 *   const output = await llm.complete({ systemPrompt, userPrompt });
 */

const llmManager = require('../llm/LLMProviderManager');
const { getRoute } = require('../llm/taskRouting');

class LLMClient {
  constructor(options = {}) {
    this.taskType = options.taskType || 'code-generation';
    this.options = options;
  }

  /**
   * Complete a prompt using the optimal LLM provider.
   * @param {Object} params - { systemPrompt, userPrompt }
   * @returns {Object} { content, ... }
   */
  async complete({ systemPrompt, userPrompt }) {
    const result = await llmManager.complete(this.taskType, {
      systemPrompt,
      userPrompt,
      temperature: this.options.temperature
    });
    return result;
  }
}

module.exports = LLMClient;
