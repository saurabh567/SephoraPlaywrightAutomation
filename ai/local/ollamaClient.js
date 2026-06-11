require('dotenv').config();

class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || process.env.AI_REQUEST_TIMEOUT_MS || 120000);
  }

  async request(endpoint, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers
        },
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms: ${endpoint}`);
      }
      throw new Error(`Ollama is not reachable at ${this.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    return response.json();
  }

  async healthCheck() {
    const payload = await this.request('/api/tags');
    return {
      status: 'connected',
      provider: 'ollama',
      url: this.baseUrl,
      models: (payload.models || []).map((model) => model.name)
    };
  }

  async ensureModel(model) {
    const health = await this.healthCheck();
    const available = health.models.some((name) =>
      name === model || name.replace(/:latest$/, '') === model.replace(/:latest$/, '')
    );
    if (!available) {
      throw new Error(`Ollama model "${model}" is not installed. Run: ollama pull ${model}`);
    }
    return health;
  }

  async pullModel(model) {
    if (!model) throw new Error('An Ollama model name is required.');
    return this.request('/api/pull', {
      method: 'POST',
      body: JSON.stringify({ model, stream: false })
    });
  }
}

module.exports = OllamaClient;
