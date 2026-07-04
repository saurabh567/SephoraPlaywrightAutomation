/**
 * LLMProvider.js
 *
 * Abstract base class for all LLM providers.
 * Each provider implements: complete(), embed(), and exposes metadata.
 */

class LLMProvider {
  constructor(options = {}) {
    this.name = options.name || 'base';
    this.model = options.model || 'unknown';
    this.apiKey = options.apiKey || process.env[this._envKey()] || '';
    this.baseUrl = options.baseUrl || '';
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 60000;
    this.costPerToken = options.costPerToken || 0;
    this._stats = { calls: 0, tokens: 0, cost: 0, errors: 0, lastLatency: 0 };
  }

  async complete({ systemPrompt, userPrompt, temperature, maxTokens }) {
    throw new Error('complete() must be implemented by subclass');
  }

  async embed(text) {
    throw new Error('embed() must be implemented by subclass');
  }

  getStats() { return { ...this._stats, name: this.name, model: this.model }; }
  resetStats() { this._stats = { calls: 0, tokens: 0, cost: 0, errors: 0, lastLatency: 0 }; }

  _envKey() { return this.name.toUpperCase() + '_API_KEY'; }
  _recordCall(tokens, latency, error) {
    this._stats.calls++;
    this._stats.tokens += tokens || 0;
    this._stats.cost += (tokens || 0) * this.costPerToken;
    this._stats.lastLatency = latency;
    if (error) this._stats.errors++;
  }
}

module.exports = LLMProvider;
