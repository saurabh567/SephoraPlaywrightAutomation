/**
 * ClaudeProvider.js
 *
 * Anthropic Claude provider for architecture reviews and reasoning.
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku.
 */

const LLMProvider = require('../LLMProvider');
const https = require('https');

class ClaudeProvider extends LLMProvider {
  constructor(options = {}) {
    super({
      name: 'claude',
      model: options.model || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY || '',
      baseUrl: options.baseUrl || 'https://api.anthropic.com/v1',
      costPerToken: options.costPerToken || 0.00003,
      ...options
    });
  }

  async complete({ systemPrompt, userPrompt, temperature, maxTokens }) {
    const start = Date.now();
    const messages = [{ role: 'user', content: userPrompt || '' }];

    const data = await this._post('/messages', {
      model: this.model,
      messages,
      system: systemPrompt || undefined,
      max_tokens: maxTokens || 8192,
      temperature: temperature || 0.2
    });

    const latency = Date.now() - start;
    const content = (data && data.content && data.content[0] && data.content[0].text) || '';
    const usage = data && data.usage || {};
    const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    this._recordCall(tokens, latency, data && data.error && data.error.message);
    return { content, tokens, model: this.model, provider: 'claude', latency };
  }

  _post(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const data = JSON.stringify(body);
      const req = https.request({
        hostname: url.hostname, path: url.pathname, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
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

module.exports = ClaudeProvider;
