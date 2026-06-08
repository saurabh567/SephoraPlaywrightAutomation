// Minimal OpenAI-compatible chat completions client using Node.js fetch.
const config = require('../config/ai.config');

class LlmClient {
  constructor(llmConfig = config.llm) {
    this.config = llmConfig;
  }

  async complete({ system, user, temperature = this.config.temperature, maxTokens = this.config.maxTokens }) {
    if (!this.config.apiKey) {
      if (config.safety.dryRunWhenNoApiKey) {
        return [
          'AI dry run: OPENAI_API_KEY is not configured.',
          'Set OPENAI_API_KEY, OPENAI_MODEL, and optionally OPENAI_BASE_URL to receive live LLM output.',
          '',
          'Prompt preview:',
          user.slice(0, 2000)
        ].join('\n');
      }
      throw new Error('OPENAI_API_KEY is required for live AI execution.');
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

module.exports = LlmClient;
