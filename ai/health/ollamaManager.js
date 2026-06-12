const { spawnSync, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const config = require('../vector-db/vectorConfig');

const PID_PATH = path.join(process.cwd(), 'ai', 'output', 'ollama-server.pid');
const LOG_PATH = path.join(process.cwd(), 'ai', 'output', 'ollama.log');

function writePidFile(obj) {
  fs.ensureDirSync(path.dirname(PID_PATH));
  fs.writeJsonSync(PID_PATH, obj, { spaces: 2 });
}
function readPidFile() {
  try { return fs.readJsonSync(PID_PATH); } catch (e) { return null; }
}
function removePidFile() { try { fs.removeSync(PID_PATH); } catch (e) {} }

function commandExists(cmd) {
  try { return spawnSync('which', [cmd], { stdio: ['ignore', 'pipe', 'ignore'] }).status === 0; } catch (e) { return false; }
}

function spawnDetached(cmd, args = []) {
  fs.ensureDirSync(path.dirname(LOG_PATH));
  const out = fs.openSync(LOG_PATH, 'a');
  const err = fs.openSync(LOG_PATH, 'a');
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', out, err], env: process.env });
  child.unref();
  child.on('error', (e) => { try { fs.appendFileSync(LOG_PATH, `\n[OllamaManager] spawn error: ${e.message}\n`); } catch (_) {} });
  return child;
}

async function isHealthy() {
  try {
    const base = process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs || 5000);
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch (e) {
    return false;
  }
}

function installWithBrew() {
  if (!commandExists('brew')) return { ok: false, error: 'brew_missing' };
  const r = spawnSync('brew', ['install', 'ollama'], { stdio: 'inherit' });
  return r.status === 0 ? { ok: true } : { ok: false, error: 'brew_failed' };
}

function pullModelSync(model) {
  if (!commandExists('ollama')) return { ok: false, error: 'ollama_missing' };
  const res = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
  return res.status === 0 ? { ok: true } : { ok: false, error: 'pull_failed' };
}

async function start() {
  if (await isHealthy()) return { started: false, reason: 'already_running' };
  if (!commandExists('ollama')) {
    const installed = installWithBrew();
    if (!installed.ok) return { started: false, error: installed.error };
  }
  // start ollama serve in background
  const child = spawnDetached('ollama', ['serve']);
  const meta = { pid: child.pid, startedByFramework: true, cmd: 'ollama serve', startedAt: new Date().toISOString(), log: path.relative(process.cwd(), LOG_PATH) };
  writePidFile(meta);

  // poll briefly for health
  const max = 20;
  const delay = 1000;
  for (let i = 0; i < max; i++) {
    if (await isHealthy()) return { started: true, meta };
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, delay));
  }
  return { started: false, error: 'not_healthy_after_start', meta };
}

async function stop() {
  const info = readPidFile();
  if (!info || !info.pid) return { stopped: false, reason: 'no_pid' };
  if (!info.startedByFramework) return { stopped: false, reason: 'not_started_by_framework' };
  try { process.kill(info.pid, 'SIGTERM'); } catch (e) { try { fs.appendFileSync(LOG_PATH, `\n[OllamaManager] kill error: ${e.message}\n`); } catch (_) {} }
  removePidFile();
  return { stopped: true, pid: info.pid };
}

async function ensureRunning() { if (await isHealthy()) return { ok: true, alreadyRunning: true }; return await start(); }

module.exports = { isHealthy, start, stop, ensureRunning, pullModelSync, readPidFile };
