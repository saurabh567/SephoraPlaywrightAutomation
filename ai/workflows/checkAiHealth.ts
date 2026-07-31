import fs from 'fs-extra';
import path from 'path';
import agents from '../agents';
import config from '../config/ai.config';
// Validates local AI agent registration and simulated MCP configuration for demo readiness.

function mdEscape(value = '') {
  return String(value).replace(/\|/g, '\\|');
}

function buildHealthMarkdown(agentNames: any, mcpHealth: any) {
  const lines = [
    '# AI Health Check',
    '',
    `- Checked At: ${mcpHealth.checkedAt}`,
    `- Registered Agents: ${agentNames.length}`,
    `- MCP Mode: ${mcpHealth.mode}`,
    `- MCP Config Exists: ${mcpHealth.configExists}`,
    '',
    '## Registered Agents',
    '',
    '| Agent Key | Status |',
    '|---|---|'
  ];

  for (const agentName of agentNames) {
    lines.push(`| ${mdEscape(agentName)} | registered |`);
  }

  lines.push(
    '',
    '## MCP Connectivity',
    '',
    '| MCP Server | Status | Connectivity | Purpose |',
    '|---|---|---|---|'
  );

  for (const server of mcpHealth.servers) {
    lines.push(
      `| ${mdEscape(server.name)} | ${mdEscape(server.status)} | ${mdEscape(server.connectivity)} | ${mdEscape(server.purpose)} |`
    );
  }

  return lines.join('\n');
}

async function run() {
  console.log('[AI] Starting Agentic AI layer');
  console.log('[AI] Running MCPHealthCheckAgent');

  const agentNames = Object.keys(agents).sort();
  const mcpHealth = await agents.mcpHealthCheck.run();
  const outputPath = path.join(config.paths.root, 'ai/output/mcp-health-check.md');

  fs.ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, buildHealthMarkdown(agentNames, mcpHealth));

  console.log('[AI] AI execution completed');

  return {
    registeredAgents: agentNames,
    mcpHealthCheckPath: 'ai/output/mcp-health-check.md',
    mcpHealth
  };
}

export { run };
export default { run: run };
