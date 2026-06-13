require('dotenv').config();
const { spawnSync } = require('child_process');

class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || process.env.AI_REQUEST_TIMEOUT_MS || 120000);
  }

  // HTTP request with optional "allowNotOk" to let callers inspect non-200 bodies
  async request(endpoint, options = {}, allowNotOk = false) {
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

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      // Log error details for debugging
      try {
        const fs = require('fs');
        const p = require('path').join(process.cwd(), 'ai', 'output', 'ollama-error.log');
        fs.appendFileSync(p, `[${new Date().toISOString()}] ${endpoint} ${response.status} ${response.statusText} - ${text}\n`);
      } catch (e) { /* ignore */ }
      if (allowNotOk) return { ok: false, status: response.status, statusText: response.statusText, body: text };
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}\n${text}`);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  // healthCheck will try multiple endpoints for compatibility across Ollama versions
  async healthCheck() {
    const endpoints = ['/api/tags', '/api/models', '/api/list', '/'];
    for (const ep of endpoints) {
      try {
        const res = await this.request(ep, {}, true);
        if (!res || res.ok === false) {
          // non-200, continue to next
          continue;
        }
        // Normalize various shapes to a models array
        if (Array.isArray(res.models) || Array.isArray(res)) {
          const models = Array.isArray(res.models) ? res.models : res;
          const names = models.map((m) => (m && m.name) ? m.name : String(m));
          return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: names };
        }
        // some endpoints return object with images or tags
        if (res.tags || res.images) {
          const arr = res.tags || res.images;
          const names = arr.map((t) => (t && t.name) ? t.name : String(t));
          return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: names };
        }
        // fallback: treat body as OK but no structured models list
        return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: [] };
      } catch (e) {
        // continue to next endpoint
      }
    }
    // As a last resort, try CLI 'ollama list' if available
    try {
      const cli = spawnSync('ollama', ['list'], { encoding: 'utf8' });
      if (cli.status === 0 && cli.stdout) {
        // parse lines like: "llama3.2:3b   (pulled)"
        const names = cli.stdout.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean);
        return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: names };
      }
    } catch (e) {
      // ignore
    }
    throw new Error('Ollama health check failed: no compatible API endpoint responded');
  }

  async ensureModel(model) {
    const health = await this.healthCheck();
    const available = (health.models || []).some((name) =>
      name === model || name.replace(/:latest$/, '') === model.replace(/:latest$/, '')
    );
    if (!available) {
      // attempt to pull via HTTP API first
      try {
        await this.pullModel(model);
      } catch (e) {
        // fallback to CLI pull
        try {
          const res = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
          if (res.status !== 0) throw new Error('ollama CLI pull failed');
        } catch (err) {
          throw new Error(`Ollama model "${model}" is not installed and auto-pull failed: ${err.message || err}`);
        }
      }
      // re-check
      const health2 = await this.healthCheck();
      const nowAvail = (health2.models || []).some((name) =>
        name === model || name.replace(/:latest$/, '') === model.replace(/:latest$/, '')
      );
      if (!nowAvail) throw new Error(`Ollama model "${model}" is not available after pull attempt.`);
      return health2;
    }
    return health;
  }

  async pullModel(model) {
    if (!model) throw new Error('An Ollama model name is required.');
    // Prefer HTTP pull, but tolerate failures
    const res = await this.request('/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: false }) }, true);
    if (res && res.ok === false) throw new Error(`Ollama pull endpoint failed: ${res.status} ${res.statusText}`);
    return res;
  }
}

module.exports = OllamaClient;
