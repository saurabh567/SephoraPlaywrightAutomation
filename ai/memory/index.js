const fs = require('fs-extra');
const path = require('path');
const MEMORY_PATH = path.join(process.cwd(), 'ai', 'memory', 'shared-memory.json');

fs.ensureDirSync(path.dirname(MEMORY_PATH));
if (!fs.existsSync(MEMORY_PATH)) {
  fs.writeJsonSync(MEMORY_PATH, { framework: {}, agents: {}, workflows: [] }, { spaces: 2 });
}

module.exports = {
  read: () => fs.readJsonSync(MEMORY_PATH),
  write: (obj) => fs.writeJsonSync(MEMORY_PATH, obj, { spaces: 2 }),
  updateAgent: (name, value) => {
    const mem = fs.readJsonSync(MEMORY_PATH);
    mem.agents = mem.agents || {};
    mem.agents[name] = Object.assign({}, mem.agents[name] || {}, value, { updatedAt: new Date().toISOString() });
    fs.writeJsonSync(MEMORY_PATH, mem, { spaces: 2 });
    return mem.agents[name];
  }
};
