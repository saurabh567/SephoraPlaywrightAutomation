require('dotenv').config();
const config = require('../vector-db/vectorConfig');
const OllamaClient = require('../local/ollamaClient');

class LlmService {
  constructor(options = {}) {
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

  async complete({ systemPrompt, userPrompt }) {
    this.validateConfiguration();
    if (!String(userPrompt || '').trim()) throw new Error('LLM user prompt cannot be empty.');
    await this.ollama.ensureModel(this.model);

    const payload = await this.ollama.request('/api/chat', {
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

module.exports = LlmService;
