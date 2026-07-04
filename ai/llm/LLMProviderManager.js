/**
 * LLMProviderManager.js
 *
 * Enterprise Multi-LLM Intelligence Layer.
 *
 * Features:
 *   - Automatic provider selection based on task type
 *   - Fallback chain on provider failure
 *   - Retry with exponential backoff
 *   - Rate-limit handling
 *   - Cost tracking per provider/task
 *   - Prompt versioning
 *   - Provider health monitoring
 *
 * Usage:
 *   const llm = require('./llm/LLMProviderManager');
 *   const result = await llm.complete('failure-analysis', {
 *     systemPrompt: 'Analyze this failure...',
 *     userPrompt: 'Error: Timeout waiting for element...'
 *   });
 */

const fs = require('fs-extra');
const path = require('path');

// Provider classes
const OllamaProvider = require('./providers/OllamaProvider');
const OpenAIProvider = require('./providers/OpenAIProvider');
const GeminiProvider = require('./providers/GeminiProvider');
const ClaudeProvider = require('./providers/ClaudeProvider');
const { getRoute, getModelForProvider } = require('./taskRouting');

const COST_LOG_PATH = path.join(__dirname, '..', 'memory', 'llm-cost-tracking.json');

class LLMProviderManager {
  constructor(options = {}) {
    this._providers = {};
    this._promptVersion = options.promptVersion || '1.0.0';
    this._rateLimitDelay = options.rateLimitDelay || 2000;

    // Initialize providers
    this._registerProvider('ollama', new OllamaProvider(options.ollama));
    this._registerProvider('openai', new OpenAIProvider(options.openai));
    this._registerProvider('gemini', new GeminiProvider(options.gemini));
    this._registerProvider('claude', new ClaudeProvider(options.claude));

    this._initCostLog();
  }

  _registerProvider(name, provider) {
    this._providers[name] = provider;
  }

  _initCostLog() {
    fs.ensureDirSync(path.dirname(COST_LOG_PATH));
    if (!fs.existsSync(COST_LOG_PATH)) {
      fs.writeJsonSync(COST_LOG_PATH, { sessions: [], totalCost: 0, totalTokens: 0 }, { spaces: 2 });
    }
  }

  /**
   * Complete a task using the appropriate LLM provider.
   * @param {string} taskType - Task type from taskRouting.js
   * @param {Object} params - { systemPrompt, userPrompt, temperature, maxTokens }
   * @param {Object} options - { preferredProvider, promptVersion, skipCache }
   * @returns {Object} { content, tokens, model, provider, latency, cost }
   */
  async complete(taskType, params = {}, options = {}) {
    const route = getRoute(taskType, options);

    // Try providers in order: preferred -> fallback -> any available
    const providerOrder = [
      route.preferredProvider,
      route.fallbackProvider,
      ...Object.keys(this._providers).filter(p => p !== route.preferredProvider && p !== route.fallbackProvider)
    ].filter(Boolean);

    let lastError = null;

    for (const providerName of providerOrder) {
      const provider = this._providers[providerName];
      if (!provider) continue;

      // Check if provider has API key configured
      if (providerName !== 'ollama' && !provider.apiKey) {
        continue; // Skip providers without keys
      }

      const model = options.model || getModelForProvider(route, providerName) || provider.model;

      try {
        const result = await this._attemptWithRetry(provider, {
          systemPrompt: params.systemPrompt || '',
          userPrompt: params.userPrompt || '',
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          model
        }, options);

        // Track cost
        this._trackCost(taskType, providerName, result);

        return {
          ...result,
          taskType,
          route: route.preferredProvider,
          promptVersion: options.promptVersion || this._promptVersion
        };

      } catch (err) {
        lastError = err;
        console.warn('[LLMProviderManager] ' + providerName + ' failed for ' + taskType + ': ' + err.message);

        // If this was the preferred provider, log and try fallback
        if (providerName === route.preferredProvider) {
          console.log('[LLMProviderManager] Falling back from ' + providerName);
        }
      }
    }

    // All providers failed
    throw new Error('All LLM providers failed for task "' + taskType + '". Last error: ' + (lastError ? lastError.message : 'unknown'));
  }

  /**
   * Attempt completion with retry logic.
   */
  async _attemptWithRetry(provider, params, options) {
    const maxRetries = options.maxRetries || 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const start = Date.now();
        const result = await provider.complete({
          systemPrompt: params.systemPrompt,
          userPrompt: params.userPrompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        });
        return result;

      } catch (err) {
        lastError = err;
        const isRateLimit = err.message && (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota'));
        const isTimeout = err.message && (err.message.includes('Timeout') || err.message.includes('timed out'));

        if (isRateLimit) {
          // Rate limit: wait longer
          const delay = this._rateLimitDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.log('[LLMProviderManager] Rate limited, waiting ' + delay + 'ms (attempt ' + attempt + ')');
          await new Promise(r => setTimeout(r, delay));
        } else if (isTimeout) {
          // Timeout: retry with shorter timeout
          console.log('[LLMProviderManager] Timeout, retrying (attempt ' + attempt + ')');
          await new Promise(r => setTimeout(r, 1000));
        } else if (attempt <= maxRetries) {
          // Other error: brief wait then retry
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Track cost for billing/analytics.
   */
  _trackCost(taskType, provider, result) {
    try {
      const data = fs.readJsonSync(COST_LOG_PATH);
      const providerObj = this._providers[provider];
      const costPerToken = providerObj ? providerObj.costPerToken : 0;
      const cost = (result.tokens || 0) * costPerToken;

      data.sessions.push({
        timestamp: new Date().toISOString(),
        taskType,
        provider,
        model: result.model,
        tokens: result.tokens || 0,
        latency: result.latency || 0,
        cost
      });
      data.totalCost += cost;
      data.totalTokens += result.tokens || 0;

      // Keep last 1000 entries
      if (data.sessions.length > 1000) data.sessions = data.sessions.slice(-1000);
      fs.writeJsonSync(COST_LOG_PATH, data, { spaces: 2 });
    } catch (e) {}
  }

  /**
   * Get provider statistics.
   */
  getStats() {
    const stats = {};
    for (const [name, provider] of Object.entries(this._providers)) {
      stats[name] = provider.getStats();
    }
    return stats;
  }

  /**
   * Get cost tracking data.
   */
  getCostReport() {
    try {
      return fs.readJsonSync(COST_LOG_PATH);
    } catch (e) {
      return { sessions: [], totalCost: 0, totalTokens: 0 };
    }
  }

  /**
   * Get available (configured) providers.
   */
  getAvailableProviders() {
    const available = [];
    for (const [name, provider] of Object.entries(this._providers)) {
      if (name === 'ollama' || provider.apiKey) {
        available.push(name);
      }
    }
    return available;
  }

  /**
   * Get the current prompt version.
   */
  getPromptVersion() {
    return this._promptVersion;
  }

  /**
   * Set a new prompt version.
   */
  setPromptVersion(version) {
    this._promptVersion = version;
  }
}

// Singleton
const instance = new LLMProviderManager();
module.exports = instance;
module.exports.LLMProviderManager = LLMProviderManager;
