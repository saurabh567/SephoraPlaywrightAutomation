/**
 * GeminiProvider.js
 *
 * Google Gemini provider for large-context code analysis and documentation.
 * Supports Gemini 1.5 Pro (1M token context), Gemini 1.5 Flash, Gemini 2.0.
 */

const LLMProvider = require('../LLMProvider');
const https = require('https');

class GeminiProvider extends LLMProvider {
  constructor(options = {}) {
    super({
      name: 'gemini',
      model: options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      apiKey: options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      baseUrl: options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      costPerToken: options.costPerToken || 0.000005,
      ...options
    });
  }

  async complete({ systemPrompt, userPrompt, temperature, maxTokens }) {
    const start = Date.now();
    const contents = [];
    if (systemPrompt) contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'user', parts: [{ text: userPrompt || '' }] });

    const url = '/models/' + this.model + ':generateContent?key=' + this.apiKey;
    const data = await this._post(url, {
      contents,
      generationConfig: {
        temperature: temperature || 0.2,
        maxOutputTokens: maxTokens || 8192
      }
    });

    const latency = Date.now() - start;
    const candidate = data && data.candidates && data.candidates[0];
    const content = (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) || '';
    const usage = data && data.usageMetadata || {};
    const tokens = (usage.totalTokenCount || 0);
    this._recordCall(tokens, latency, !candidate);

    return { content, tokens, model: this.model, provider: 'gemini', latency };
  }

  async embed(text) {
    const url = '/models/' + (process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004') + ':embedContent?key=' + this.apiKey;
    const data = await this._post(url, { content: { parts: [{ text }] } });
    return (data && data.embedding && data.embedding.values) || [];
  }

  _post(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const data = JSON.stringify(body);
      const req = https.request({
        hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
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

module.exports = GeminiProvider;
