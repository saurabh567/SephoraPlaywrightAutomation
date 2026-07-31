import fs from 'fs-extra';
import path from 'path';
import config from '../config/ai.config';
import LlmClient from '../tools/llmClient';
import SharedMemory from '../memory/sharedMemory';
import { scanFramework } from '../tools/frameworkScanner';
// Base class for all specialized AI automation agents.

class BaseAgent {
  [key: string]: any;
  constructor({ name, role, promptFile, outputType }: any) {
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

  buildUserPrompt(input: any = {}) {
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

  async run(input: any = {}) {
    const system = this.loadPrompt();
    const user = this.buildUserPrompt(input);
    const output = await this.llm.complete({ system, user });
    this.memory.updateAgent(this.name, { input, outputType: this.outputType, outputPreview: output.slice(0, 1000) });
    return output;
  }
}

export default BaseAgent;
