/**
 * OpenAIProvider.js
 *
 * OpenAI-compatible provider (works with OpenAI, Azure OpenAI, and compatible proxies).
 * Handles GPT-4, GPT-4o, GPT-4-turbo, GPT-3.5-turbo models.
 */

const LLMProvider = require('../LLMProvider');
const https = require('https');
const http = require('http');

class OpenAIProvider extends LLMProvider {
  constructor(options = {}) {
    super({
      name: 'openai',
      model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
      costPerToken: options.costPerToken || 0.00001,
      ...options
    });
  }

  async complete({ systemPrompt, userPrompt, temperature, maxTokens }) {
    const start = Date.now();
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt || '' });

    const data = await this._post('/chat/completions', {
      model: this.model,
      messages,
      temperature: temperature || 0.2,
      max_tokens: maxTokens || 4096
    });

    const latency = Date.now() - start;
    const choice = data && data.choices && data.choices[0];
    const content = (choice && choice.message && choice.message.content) || '';
    const usage = data && data.usage || {};
    const tokens = (usage.total_tokens || 0);
    this._recordCall(tokens, latency, data && data.error);

    return { content, tokens, model: this.model, provider: 'openai', latency };
  }

  async embed(text) {
    const data = await this._post('/embeddings', {
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text
    });
    return (data && data.data && data.data[0] && data.data[0].embedding) || [];
  }

  _post(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const data = JSON.stringify(body);
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request({
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.apiKey,
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
      });
      req.on('error', reject);
      req.setTimeout(this.timeout, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(data);
      req.end();
    });
  }
}

module.exports = OpenAIProvider;
