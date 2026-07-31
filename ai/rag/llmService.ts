import config from '../vector-db/vectorConfig';
import OllamaClient from '../local/ollamaClient';
require('dotenv').config();

class LlmService {
  [key: string]: any;
  constructor(options: any = {}) {
    this.model = options.model || config.llmModel;
    this.temperature = Number(options.temperature ?? process.env.AI_TEMPERATURE ?? 0.2);
    this.maxTokens = Number(options.maxTokens || process.env.AI_MAX_TOKENS || 4000);
    this.ollama = options.ollama || new OllamaClient({
      baseUrl: options.baseUrl || config.ollamaBaseUrl,
      timeoutMs: options.timeoutMs || config.requestTimeoutMs
    });
  }

  validateConfiguration() {
    if (!this.model) throw new Error('OLLAMA_LLM_MODEL is required for RAG generation.');
  }

  async healthCheck() {
    const health = await this.ollama.ensureModel(this.model);
    return {
      status: 'connected',
      provider: 'ollama',
      url: health.url,
      model: this.model
    };
  }

  async complete({ systemPrompt, userPrompt }: any) {
    this.validateConfiguration();
    if (!String(userPrompt || '').trim()) throw new Error('LLM user prompt cannot be empty.');
    await this.ollama.ensureModel(this.model);

    // Try calling several possible completion endpoints with retries for transient failures
    const endpoints = ['/api/chat', '/api/completions', '/api/generate', '/api/complete'];
    let payload = null;
    let lastErr = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const ep of endpoints) {
        try {
          payload = await this.ollama.request(ep, {
            method: 'POST',
            body: JSON.stringify({
              model: this.model,
              stream: false,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              options: {
                temperature: this.temperature,
                num_predict: this.maxTokens
              }
            })
          });
          lastErr = null;
          break;
        } catch (e: any) {
          lastErr = e;
          const msg = String(e.message || '').toLowerCase();
          if (msg.includes('404') || msg.includes('not installed') || msg.includes('not available')) {
            try { await this.ollama.ensureModel(this.model); } catch (_: any) {}
          }
          // try next endpoint
        }
      }
      if (payload) break;
      // exponential backoff before next attempt
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
    if (!payload && lastErr) throw lastErr;

    const content = payload.message?.content;
    if (!content) throw new Error('Ollama response did not contain generated content.');
    return {
      content,
      model: payload.model || this.model,
      usage: {
        promptTokens: payload.prompt_eval_count || 0,
        completionTokens: payload.eval_count || 0
      }
    };
  }
}

export default LlmService;
