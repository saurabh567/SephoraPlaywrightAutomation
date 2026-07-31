import fs from 'fs-extra';
import config from '../config/ai.config';
// Shared memory stores framework summaries, generated artifacts, and agent handoffs.

class SharedMemory {
  [key: string]: any;
  constructor(memoryPath = config.paths.memory) {
    this.memoryPath = memoryPath;
    fs.ensureFileSync(this.memoryPath);
    try {
      const raw = fs.readFileSync(this.memoryPath, 'utf8').trim();
      let parsed: Record<string, any> = {};
      if (raw) parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.agents) {
        fs.writeJsonSync(this.memoryPath, { framework: {} as Record<string, any>, agents: {} as Record<string, any>, workflows: [] as any[] }, { spaces: 2 });
      }
    } catch (e: any) {
      fs.writeJsonSync(this.memoryPath, { framework: {} as Record<string, any>, agents: {} as Record<string, any>, workflows: [] as any[] }, { spaces: 2 });
    }
  }

  read() {
    return fs.readJsonSync(this.memoryPath);
  }

  write(nextMemory: any) {
    fs.writeJsonSync(this.memoryPath, nextMemory, { spaces: 2 });
  }

  set(namespace: any, value: any) {
    const memory = this.read();
    memory[namespace] = value;
    this.write(memory);
  }

  updateAgent(agentName: any, value: any) {
    const memory = this.read();
    memory.agents[agentName] = {
      ...(memory.agents[agentName] || {}),
      ...value,
      updatedAt: new Date().toISOString()
    };
    this.write(memory);
  }

  appendWorkflow(entry: any) {
    const memory = this.read();
    memory.workflows.push({ ...entry, createdAt: new Date().toISOString() });
    this.write(memory);
  }
}

export default SharedMemory;
