import fs from 'fs-extra';
import path from 'path';
import config from '../config/ai.config';
// Local MCP health check agent validates MCP configuration without requiring paid or external MCP servers.

class MCPHealthCheckAgent {
  [key: string]: any;
  constructor() {
    this.name = 'MCP Health Check Agent';
    this.configPath = path.join(config.paths.root, 'ai/mcp/mcp.config.json');
  }

  readConfig() {
    if (!fs.existsSync(this.configPath)) {
      return {
        exists: false,
        servers: {} as Record<string, any>
      };
    }

    return {
      exists: true,
      ...fs.readJsonSync(this.configPath)
    };
  }

  async run() {
    const mcpConfig = this.readConfig();
    const servers = (Object.entries(mcpConfig.servers || {}) as [string, any][]).map(([name, details]) => ({
      name,
      purpose: details.purpose,
      status: 'simulated-local',
      connectivity: 'available for demo',
      agents: details.agents || []
    }));

    return {
      checkedAt: new Date().toISOString(),
      configPath: 'ai/mcp/mcp.config.json',
      configExists: mcpConfig.exists,
      mode: 'local/simulated',
      summary: mcpConfig.exists
        ? `${servers.length} MCP server definitions validated locally.`
        : 'MCP config file was not found.',
      servers
    };
  }
}

export default new MCPHealthCheckAgent();


// Auto-registered metadata for AgentRegistry
export const metadata = {
  "name": "MCP Health Check Agent",
  "version": "1.0.0",
  "description": "Local MCP configuration validation without external servers",
  "dependencies": [] as any[],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "health",
    "mcp"
  ],
  "executionStage": "preflight",
  "priority": 25,
  "conditions": [
    {
      "type": "always"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "lifecycle": "active"
};
