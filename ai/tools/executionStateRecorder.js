// Records hook-level runtime metadata that post-execution AI agents can read later.
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/ai.config');

function recordAfterAll({ workerId, browser, reportDir }) {
  const statePath = path.join(config.paths.root, 'ai/memory/hook-execution-state.json');
  fs.ensureFileSync(statePath);

  const state = fs.readFileSync(statePath, 'utf8').trim() ? fs.readJsonSync(statePath) : [];
  state.push({
    event: 'AfterAll',
    workerId,
    browser,
    reportDir,
    recordedAt: new Date().toISOString()
  });

  fs.writeJsonSync(statePath, state, { spaces: 2 });
}

module.exports = { recordAfterAll };
