#!/usr/bin/env node
const orchestrator = require('./orchestrator');
(async ()=>{
  try {
    await orchestrator();
  } catch (e) {
    console.error('[fullAuto] failed', e.stack || e);
    process.exit(2);
  }
})();
