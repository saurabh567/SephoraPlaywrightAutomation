import fs from 'fs-extra';
import path from 'path';
/**
 * AgentRegistry.js
 *
 * Enterprise agent registry with auto-discovery, metadata declaration, dependency resolution,
 * capability-based querying, topological ordering, and cycle detection.
 *
 * Replaces the static hardcoded agent maps with filesystem-based auto-discovery.
 * Each agent declares metadata via module.exports.metadata.
 */


const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const EXCLUDED_DIRS = new Set(['locator-healing']);
const EXCLUDED_FILES = new Set(['index.js', 'baseAgent.js', 'index.ts', 'baseAgent.ts']);
const PLUGIN_AGENTS_DIR = path.join(__dirname, '..', '..', 'plugins', 'agents');
const PLUGIN_EXTENSIONS_DIR = path.join(__dirname, '..', '..', 'plugins', 'extensions');
const SCAN_DIRS = [AGENTS_DIR, PLUGIN_AGENTS_DIR, PLUGIN_EXTENSIONS_DIR];

class AgentRegistry {
  [key: string]: any;
  constructor() {
    this._agents = new Map();
    this._byName = new Map();
    this._discovered = false;
  }

  async discover() {
    if (this._discovered) return;

    const files: any[] = [];
    for (const dir of SCAN_DIRS) {
      if (fs.existsSync(dir)) {
        files.push(...this._walkDirectory(dir));
      }
    }
    for (const filePath of files) {
      try {
        this._registerAgent(filePath);
      } catch (err: any) {
        // Silently skip files that fail to load
      }
    }

    for (const [, entry] of this._agents) {
      this._resolveDependencyNames(entry);
    }

    this._discovered = true;
    return this._agents.size;
  }

  _walkDirectory(dir: any) {
    const results: any = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry)) results.push(...this._walkDirectory(fullPath));
      } else if (stat.isFile() && (entry.endsWith('.js') || entry.endsWith('.ts'))) {
        if (!EXCLUDED_FILES.has(entry)) results.push(fullPath);
      }
    }
    return results;
  }

  _registerAgent(filePath: any) {
    const agentModule = require(filePath);
    const metadata = agentModule.metadata || this._inferMetadata(agentModule, filePath);
    if (!metadata) return null;

    const key = metadata.key || path.basename(filePath, '.js');
    const name = metadata.name || key;

    const hasRun = typeof agentModule.run === 'function' ||
                   (agentModule.prototype && typeof agentModule.prototype.run === 'function');

    const entry = {
      key, name,
      filePath: path.relative(process.cwd(), filePath),
      metadata, module: agentModule,
      methods: Object.keys(agentModule).filter(m => typeof agentModule[m] === 'function' && m !== 'metadata'),
      hasRun,
      registeredAt: new Date().toISOString()
    };

    this._agents.set(key, entry);
    this._byName.set(name.toLowerCase(), key);
    return entry;
  }

  _inferMetadata(agentModule: any, filePath: any) {
    const baseName = path.basename(filePath, '.js');
    return {
      key: baseName, name: this._toName(baseName),
      version: '1.0.0', description: 'AI agent: ' + this._toName(baseName),
      dependencies: [] as any[], platforms: ['WEB', 'ANDROID', 'IOS', 'API'],
      tags: ['ai'], executionStage: 'analysis', priority: 50,
      conditions: [] as any[], retryPolicy: { maxRetries: 0, backoff: 'none' },
      lifecycle: 'active', _inferred: true
    };
  }

  _toName(camelCase: any) {
    return camelCase.replace(/([A-Z])/g, ' $1').replace(/^./, (s: any) => s.toUpperCase()).replace(/Agent$/, '').trim() + ' Agent';
  }

  _resolveDependencyNames(entry: any) {
    const deps = entry.metadata.dependencies || [];
    entry._dependencyKeys = deps.map((dep: any) => {
      if (this._agents.has(dep)) return dep;
      const byName = this._byName.get(dep.toLowerCase());
      return byName || dep;
    });
  }

  getAll(): any[] { return Array.from(this._agents.values()); }
  get(key: any) { return this._agents.get(key) || null; }

  getByName(name: any) {
    const key = this._byName.get(name.toLowerCase());
    return key ? this._agents.get(key) : null;
  }

  getByPlatform(platform: any) {
    const upper = platform.toUpperCase();
    return this.getAll().filter(a =>
      a.metadata.platforms && a.metadata.platforms.some((p: any) => p.toUpperCase() === upper)
    );
  }

  getByStage(stage: any) {
    return this.getAll()
      .filter(a => a.metadata.executionStage === stage)
      .sort((a, b) => (a.metadata.priority || 50) - (b.metadata.priority || 50));
  }

  getByTag(tag: any) {
    return this.getAll().filter(a =>
      a.metadata.tags && a.metadata.tags.some((t: any) => t.toLowerCase() === tag.toLowerCase())
    );
  }

  getByLifecycle(status: any) {
    return this.getAll().filter(a => a.metadata.lifecycle === status);
  }

  resolveDependencies(agentKey: any) {
    const entry = this._agents.get(agentKey);
    if (!entry) return [];
    const visited = new Set();
    const chain: any = [];
    const dfs = (key: any) => {
      if (visited.has(key)) return;
      visited.add(key);
      const agent = this._agents.get(key);
      if (agent && agent._dependencyKeys) {
        for (const dep of agent._dependencyKeys) { dfs(dep); }
        chain.push(key);
      }
    };
    if (entry._dependencyKeys) {
      for (const dep of entry._dependencyKeys) { dfs(dep); }
    }
    return chain;
  }

  detectCircularDependencies() {
    const cycles = new Set();
    for (const [startKey] of this._agents) {
      const color = new Map();
      for (const [k] of this._agents) color.set(k, 0);
      const stack = [{ key: startKey, path: [startKey] }];
      while (stack.length > 0) {
        const { key, path } = stack.pop() as { key: any; path: any[] };
        if (color.get(key) === 1) {
          const cs = path.indexOf(key);
          if (cs !== -1 && cs < path.length - 1) cycles.add(path.slice(cs).join(' -> '));
          continue;
        }
        if (color.get(key) === 2) continue;
        color.set(key, 1);
        const agent = this._agents.get(key);
        if (agent && agent._dependencyKeys) {
          for (const dep of agent._dependencyKeys) {
            if (this._agents.has(dep)) stack.push({ key: dep, path: [...path, dep] });
          }
        }
        color.set(key, 2);
      }
    }
    return [...cycles];
  }

  getTopologicalOrder() {
    const inDegree = new Map();
    const adjList = new Map();
    for (const [key] of this._agents) { inDegree.set(key, 0); adjList.set(key, []); }
    for (const [key, entry] of this._agents) {
      const deps = entry._dependencyKeys || [];
      for (const dep of deps) {
        if (adjList.has(dep)) {
          adjList.get(dep).push(key);
          inDegree.set(key, (inDegree.get(key) || 0) + 1);
        }
      }
    }
    const queue: any[] = [];
    for (const [key, degree] of inDegree) { if (degree === 0) queue.push(key); }
    const order: any[] = [];
    while (queue.length > 0) {
      const node = queue.shift();
      order.push(node);
      for (const neighbor of (adjList.get(node) || [])) {
        const nd = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, nd);
        if (nd === 0) queue.push(neighbor);
      }
    }
    return order;
  }

  getStats() {
    const all = this.getAll();
    const byStage: Record<string, any> = {}; const byLifecycle: Record<string, any> = {}; const byPlatform: Record<string, any> = {};
    for (const a of all) {
      const stage = a.metadata.executionStage || 'unknown';
      byStage[stage] = (byStage[stage] || 0) + 1;
      const lifecycle = a.metadata.lifecycle || 'active';
      byLifecycle[lifecycle] = (byLifecycle[lifecycle] || 0) + 1;
      const platforms = a.metadata.platforms || [];
      for (const p of platforms) byPlatform[p] = (byPlatform[p] || 0) + 1;
    }
    return { totalAgents: all.length, byStage, byLifecycle, byPlatform, discovered: this._discovered };
  }
}

const instance = new AgentRegistry();
export default instance;
export { AgentRegistry };
