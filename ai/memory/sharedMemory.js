// Shared memory stores framework summaries, generated artifacts, and agent handoffs.
const fs = require('fs-extra');
const config = require('../config/ai.config');

class SharedMemory {
  constructor(memoryPath = config.paths.memory) {
    this.memoryPath = memoryPath;
    fs.ensureFileSync(this.memoryPath);
    try {
      const raw = fs.readFileSync(this.memoryPath, 'utf8').trim();
      let parsed = {};
      if (raw) parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.agents) {
        fs.writeJsonSync(this.memoryPath, { framework: {}, agents: {}, workflows: [] }, { spaces: 2 });
      }
    } catch (e) {
      fs.writeJsonSync(this.memoryPath, { framework: {}, agents: {}, workflows: [] }, { spaces: 2 });
    }
  }

  read() {
    return fs.readJsonSync(this.memoryPath);
  }

  write(nextMemory) {
    fs.writeJsonSync(this.memoryPath, nextMemory, { spaces: 2 });
  }

  set(namespace, value) {
    const memory = this.read();
    memory[namespace] = value;
    this.write(memory);
  }

  updateAgent(agentName, value) {
    const memory = this.read();
    memory.agents[agentName] = {
      ...(memory.agents[agentName] || {}),
      ...value,
      updatedAt: new Date().toISOString()
    };
    this.write(memory);
  }

  appendWorkflow(entry) {
    const memory = this.read();
    memory.workflows.push({ ...entry, createdAt: new Date().toISOString() });
    this.write(memory);
  }
}

module.exports = SharedMemory;
