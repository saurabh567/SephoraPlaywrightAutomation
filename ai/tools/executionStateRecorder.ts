import fs from 'fs-extra';
import path from 'path';
import config from '../config/ai.config';
// Records hook-level runtime metadata that post-execution AI agents can read later.

function recordAfterAll({ workerId, browser, reportDir }: any) {
  const statePath = path.join(config.paths.root, 'ai/memory/hook-execution-state.json');
  fs.ensureFileSync(statePath);

  const state = fs.readFileSync(statePath, 'utf8').trim() ? fs.readJsonSync(statePath) : [] as any[];
  state.push({
    event: 'AfterAll',
    workerId,
    browser,
    reportDir,
    recordedAt: new Date().toISOString()
  });

  fs.writeJsonSync(statePath, state, { spaces: 2 });
}

export { recordAfterAll };
export default { recordAfterAll: recordAfterAll };
