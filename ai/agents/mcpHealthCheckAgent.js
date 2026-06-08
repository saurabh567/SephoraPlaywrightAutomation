// Local MCP health check agent validates MCP configuration without requiring paid or external MCP servers.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

class MCPHealthCheckAgent {
  constructor() {
    this.name = 'MCP Health Check Agent';
    this.configPath = path.join(config.paths.root, 'ai/mcp/mcp.config.json');
  }

  readConfig() {
    if (!fs.existsSync(this.configPath)) {
      return {
        exists: false,
        servers: {}
      };
    }

    return {
      exists: true,
      ...fs.readJsonSync(this.configPath)
    };
  }

  async run() {
    const mcpConfig = this.readConfig();
    const servers = Object.entries(mcpConfig.servers || {}).map(([name, details]) => ({
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

module.exports = new MCPHealthCheckAgent();
