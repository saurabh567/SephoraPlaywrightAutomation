// Base class for all specialized AI automation agents.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');
const LlmClient = require('../tools/llmClient');
const SharedMemory = require('../memory/sharedMemory');
const { scanFramework } = require('../tools/frameworkScanner');

class BaseAgent {
  constructor({ name, role, promptFile, outputType }) {
    this.name = name;
    this.role = role;
    this.promptFile = promptFile;
    this.outputType = outputType;
    this.llm = new LlmClient();
    this.memory = new SharedMemory();
  }

  loadPrompt() {
    return fs.readFileSync(path.join(config.paths.root, config.paths.prompts, this.promptFile), 'utf8');
  }

  buildUserPrompt(input = {}) {
    const framework = scanFramework();
    const memory = this.memory.read();
    return JSON.stringify(
      {
        agent: this.name,
        role: this.role,
        expectedOutput: this.outputType,
        input,
        framework,
        memory
      },
      null,
      2
    );
  }

  async run(input = {}) {
    const system = this.loadPrompt();
    const user = this.buildUserPrompt(input);
    const output = await this.llm.complete({ system, user });
    this.memory.updateAgent(this.name, { input, outputType: this.outputType, outputPreview: output.slice(0, 1000) });
    return output;
  }
}

module.exports = BaseAgent;
