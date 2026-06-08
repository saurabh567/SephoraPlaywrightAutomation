// Simple OpenAI-compatible client. MOCK_MODE=true keeps demos working without an API key.
require('dotenv').config();

class LLMClient {
  constructor() {
    this.mockMode = String(process.env.MOCK_MODE || 'true').toLowerCase() === 'true';
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'gpt-4.1-mini';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  isMockMode() {
    return this.mockMode;
  }

  async complete({ systemPrompt, userPrompt, mockOutput }) {
    if (this.mockMode) {
      return mockOutput;
    }

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required when MOCK_MODE=false');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

module.exports = LLMClient;
