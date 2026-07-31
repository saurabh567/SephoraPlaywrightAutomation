import llmManager from '../llm/LLMProviderManager';
import { getRoute } from '../llm/taskRouting';
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


class LLMClient {
  [key: string]: any;
  constructor(options: any = {}) {
    this.taskType = options.taskType || 'code-generation';
    this.options = options;
  }

  /**
   * Complete a prompt using the optimal LLM provider.
   * @param {Object} params - { systemPrompt, userPrompt }
   * @returns {Object} { content, ... }
   */
  async complete({ systemPrompt, userPrompt }: any) {
    const result = await llmManager.complete(this.taskType, {
      systemPrompt,
      userPrompt,
      temperature: this.options.temperature
    });
    return result;
  }
}

export default LLMClient;
