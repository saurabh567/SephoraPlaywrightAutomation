require('dotenv').config();
const crypto = require('crypto');
const config = require('./vectorConfig');

class EmbeddingService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = config.embeddingModel;
    this.mockMode = config.mockMode;
  }

  async embedText(text) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return this.createLocalEmbedding('empty');
    }

    if (this.mockMode) {
      return this.createLocalEmbedding(normalizedText);
    }

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required when MOCK_MODE=false for OpenAI embeddings.');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: normalizedText
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embedding request failed: ${response.status} ${response.statusText}\n${body}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  }

  async embedMany(texts) {
    const embeddings = [];
    for (const text of texts) {
      embeddings.push(await this.embedText(text));
    }
    return embeddings;
  }

  createLocalEmbedding(text) {
    const dimensions = 384;
    const vector = new Array(dimensions).fill(0);
    const tokens = String(text).toLowerCase().split(/[^a-z0-9_./-]+/).filter(Boolean);

    for (const token of tokens) {
      const hash = crypto.createHash('sha256').update(token).digest();
      for (let index = 0; index < hash.length; index += 1) {
        const position = hash[index] % dimensions;
        vector[position] += index % 2 === 0 ? 1 : -1;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(8)));
  }
}

module.exports = EmbeddingService;
