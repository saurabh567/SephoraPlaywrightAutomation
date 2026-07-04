const BaseAgent = require('./baseAgent');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

const agent = new BaseAgent({
  name: 'Report Summarization Agent',
  promptFile: 'report-summarization.md',
  outputType: 'Executive test report summary'
});

module.exports = {
  run: async function(input = {}) {
    const output = await agent.run(input);
    try {
      const outDir = path.join(process.cwd(), 'reports', 'ai');
      fs.ensureDirSync(outDir);
      const outPath = path.join(outDir, 'execution-summary.md');
      const header = `# AI Execution Summary\n\nGenerated At: ${new Date().toISOString()}\n\n`;
      // Write the raw LLM output under the header
      fs.writeFileSync(outPath, header + output + '\n', 'utf8');
      console.log('[ReportSummarizationAgent] Wrote summary to', outPath);
    } catch (e) {
      console.warn('[ReportSummarizationAgent] Failed to write summary file:', e.message);
    }
    return output;
  },
  agent
};


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Report Summarization Agent",
  "version": "1.0.0",
  "description": "LLM-based executive test report summary generation",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "reporting",
    "llm"
  ],
  "executionStage": "reporting",
  "priority": 70,
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
