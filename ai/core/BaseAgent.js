// Base class used by every beginner-friendly AI agent.
const fs = require('fs-extra');
const path = require('path');
const LLMClient = require('./LLMClient');

class BaseAgent {
  constructor({ name, inputPath, outputPath, promptPath, purpose }) {
    this.name = name;
    this.inputPath = inputPath;
    this.outputPath = outputPath;
    this.promptPath = promptPath;
    this.purpose = purpose;
    this.llm = new LLMClient();
    this.rootDir = process.cwd();
  }

  absolute(relativePath) {
    return path.join(this.rootDir, relativePath);
  }

  readText(relativePath, fallback = '') {
    const fullPath = this.absolute(relativePath);
    if (!fs.existsSync(fullPath)) return fallback;
    return fs.readFileSync(fullPath, 'utf8');
  }

  readInput() {
    return this.readText(this.inputPath, '');
  }

  readPrompt() {
    return this.readText(this.promptPath, `You are ${this.name}. ${this.purpose}`);
  }

  writeOutput(content) {
    const fullPath = this.absolute(this.outputPath);
    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  buildUserPrompt(input) {
    return [
      `Agent: ${this.name}`,
      `Purpose: ${this.purpose}`,
      '',
      'Input:',
      input
    ].join('\n');
  }

  async run() {
    console.log(`[AI] Starting ${this.name}`);
    console.log(`[AI] Reading input from ${this.inputPath}`);
    const input = await this.readInput();
    console.log('[AI] Generating output ...');

    const output = await this.llm.complete({
      systemPrompt: this.readPrompt(),
      userPrompt: this.buildUserPrompt(input)
    });

    this.writeOutput(output);
    console.log(`[AI] Completed ${this.name}`);
    return {
      agent: this.name,
      inputPath: this.inputPath,
      outputPath: this.outputPath
    };
  }
}

module.exports = BaseAgent;
