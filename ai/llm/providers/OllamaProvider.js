/**
 * OllamaProvider.js
 *
 * Local Ollama provider for privacy-sensitive and offline tasks.
 * Default provider - no API key required.
 */

const LLMProvider = require('../LLMProvider');
const http = require('http');

class OllamaProvider extends LLMProvider {
  constructor(options = {}) {
    super({
      name: 'ollama',
      model: options.model || process.env.OLLAMA_LLM_MODEL || 'llama3.2:3b',
      baseUrl: options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      costPerToken: 0,  // Free local
      ...options
    });
    this.embeddingModel = options.embeddingModel || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
  }

  async complete({ systemPrompt, userPrompt, temperature, maxTokens }) {
    const start = Date.now();
    const payload = {
      model: this.model,
      prompt: (systemPrompt ? systemPrompt + '\n\n' : '') + (userPrompt || ''),
      stream: false,
      options: {
        temperature: temperature || 0.2,
        num_predict: maxTokens || 4096
      }
    };

    const data = await this._post('/api/generate', payload);
    const latency = Date.now() - start;
    const tokens = (data && data.eval_count) || 0;
    this._recordCall(tokens, latency, data && data.error);
    return { content: (data && data.response) || '', tokens, model: this.model, provider: 'ollama', latency };
  }

  async embed(text) {
    const payload = { model: this.embeddingModel, prompt: text };
    const data = await this._post('/api/embeddings', payload);
    return (data && data.embedding) || [];
  }

  async isAvailable() {
    try {
      await this._get('/api/tags');
      return true;
    } catch (e) { return false; }
  }

  _post(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({ response: body }); } });
      });
      req.on('error', reject);
      req.setTimeout(this.timeout, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(data);
      req.end();
    });
  }

  _get(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
      }).on('error', reject);
    });
  }
}

module.exports = OllamaProvider;
