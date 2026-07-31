import { spawnSync } from 'child_process';
require('dotenv').config();

class OllamaClient {
  [key: string]: any;
  constructor(options: any = {}) {
    this.baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || process.env.AI_REQUEST_TIMEOUT_MS || 120000);
  }

  // HTTP request with optional "allowNotOk" to let callers inspect non-200 bodies
  async request(endpoint: any, options: any = {}, allowNotOk = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {} as Record<string, any>),
          ...options.headers
        },
        signal: controller.signal
      });
    } catch (error: any) {
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
      } catch (e: any) { /* ignore */ }
      if (allowNotOk) return { ok: false, status: response.status, statusText: response.statusText, body: text };
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}\n${text}`);
    }

    try {
      return JSON.parse(text);
    } catch (e: any) {
      return text;
    }
  }

  /**
   * Create embeddings with automatic endpoint fallback.
   * Ollama v0.1.x-0.2.x uses /api/embeddings (with 's').
   * Ollama v0.3.x+ uses /api/embed (without 's').
   * This method tries /api/embed first, then falls back to /api/embeddings.
   */
  async requestEmbeddings(model: any, input: any, options: any = {}) {
    const payload = {
      model,
      input,
      ...(options.truncate !== undefined ? { truncate: options.truncate } : { truncate: true }),
    };

    // Try /api/embed first (Ollama 0.3.x+), fall back to /api/embeddings (Ollama 0.1.x-0.2.x)
    const endpoints = ['/api/embed', '/api/embeddings'];
    let lastError;

    for (const ep of endpoints) {
      try {
        const result = await this.request(ep, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Handle different response shapes
        // /api/embed returns { model, embeddings: [[...], ...] }
        // /api/embeddings returns { embeddings: [{ embedding: [...] }, ...] }
        if (result.embeddings) {
          if (Array.isArray(result.embeddings)) {
            if (result.embeddings.length > 0 && Array.isArray(result.embeddings[0])) {
              // /api/embed format: { embeddings: [[...], ...] }
              return result.embeddings;
            } else if (result.embeddings.length > 0 && result.embeddings[0].embedding) {
              // /api/embeddings format: { embeddings: [{ embedding: [...] }, ...] }
              return result.embeddings.map((e: any) => e.embedding);
            }
          }
          // Single embedding
          if (Array.isArray(result.embeddings)) {
            return [result.embeddings];
          }
        }

        // If we got here with a 200 but unexpected shape, return as-is
        if (Array.isArray(result)) {
          return result;
        }

        // Shape unknown - try to extract any array of numbers
        if (result.embedding && Array.isArray(result.embedding)) {
          return [result.embedding];
        }

        throw new Error(`Unexpected embedding response shape from ${ep}`);
      } catch (err: any) {
        lastError = err;
        // If endpoint not found (404) or method not allowed (405), try next
        if (err.message && (err.message.includes('404') || err.message.includes('405'))) {
          continue;
        }
        // For connection/other errors, try next endpoint
        continue;
      }
    }

    throw lastError || new Error(`All embedding endpoints failed for model ${model}`);
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
          const names = models.map((m: any) => (m && m.name) ? m.name : String(m));
          return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: names };
        }
        // some endpoints return object with images or tags
        if (res.tags || res.images) {
          const arr = res.tags || res.images;
          const names = arr.map((t: any) => (t && t.name) ? t.name : String(t));
          return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: names };
        }
        // fallback: treat body as OK but no structured models list
        return { status: 'connected', provider: 'ollama', url: this.baseUrl, models: [] as any[] };
      } catch (e: any) {
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
    } catch (e: any) {
      // ignore
    }
    throw new Error('Ollama health check failed: no compatible API endpoint responded');
  }

  async ensureModel(model: any) {
    const health = await this.healthCheck();
    const available = (health.models || []).some((name: any) =>
      name === model || name.replace(/:latest$/, '') === model.replace(/:latest$/, '')
    );
    if (!available) {
      // attempt to pull via HTTP API first
      try {
        await this.pullModel(model);
      } catch (e: any) {
        // fallback to CLI pull
        try {
          const res = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
          if (res.status !== 0) throw new Error('ollama CLI pull failed');
        } catch (err: any) {
          throw new Error(`Ollama model "${model}" is not installed and auto-pull failed: ${err.message || err}`);
        }
      }
      // re-check
      const health2 = await this.healthCheck();
      const nowAvail = (health2.models || []).some((name: any) =>
        name === model || name.replace(/:latest$/, '') === model.replace(/:latest$/, '')
      );
      if (!nowAvail) throw new Error(`Ollama model "${model}" is not available after pull attempt.`);
      return health2;
    }
    return health;
  }

  async pullModel(model: any) {
    if (!model) throw new Error('An Ollama model name is required.');
    // Prefer HTTP pull, but tolerate failures
    const res = await this.request('/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: false }) }, true);
    if (res && res.ok === false) throw new Error(`Ollama pull endpoint failed: ${res.status} ${res.statusText}`);
    return res;
  }
}

export default OllamaClient;
