import { spawn, spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import config from './vectorConfig';


const PID_PATH = path.join(process.cwd(), 'ai', 'output', 'chroma-server.pid');
const LOG_PATH = path.join(process.cwd(), 'ai', 'output', 'chroma.log');

function writePidFile(obj: any) {
  fs.ensureDirSync(path.dirname(PID_PATH));
  fs.writeJsonSync(PID_PATH, obj, { spaces: 2 });
}

function readPidFile() {
  try {
    return fs.readJsonSync(PID_PATH);
  } catch (e: any) {
    return null;
  }
}

function removePidFile() {
  try { fs.removeSync(PID_PATH); } catch (e: any) { /* ignore */ }
}

function commandExists(cmd: any) {
  try {
    const p = spawnSync('which', [cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
    return p.status === 0;
  } catch (e: any) {
    return false;
  }
}

function pythonHasChromadb() {
  try {
    const probe = spawnSync('python3', ['-c', 'import importlib.util, sys; print(bool(importlib.util.find_spec("chromadb")))'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const out = (probe.stdout || '').trim();
    return out === 'True' || out === 'true' || out === '1';
  } catch (e: any) {
    return false;
  }
}

function venvPythonPath() {
  const candidate = path.join(process.cwd(), 'ai', '.chroma_venv', 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : null;
}

function venvChromaCliPath() {
  const candidate = path.join(process.cwd(), 'ai', '.chroma_venv', 'bin', 'chroma');
  return fs.existsSync(candidate) ? candidate : null;
}

function venvHasChromadb() {
  try {
    const py = venvPythonPath();
    if (!py) return false;
    const probe = spawnSync(py, ['-c', 'import importlib.util, sys; print(bool(importlib.util.find_spec("chromadb")))'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const out = (probe.stdout || '').trim();
    return out === 'True' || out === 'true' || out === '1';
  } catch (e: any) {
    return false;
  }
}

function startProcessCommand() {
  const cmds: any[] = [];
  // Prefer chroma CLI from local venv if present (provides 'run')
  const venvChroma = venvChromaCliPath();
  if (venvChroma) {
    cmds.push({ cmd: venvChroma, args: ['run', '--host', '0.0.0.0', '--port', '8000'] });
  }
  // global 'chroma' CLI
  if (commandExists('chroma')) {
    cmds.push({ cmd: 'chroma', args: ['run', '--host', '0.0.0.0', '--port', '8000'] });
  }
  // legacy 'chromadb' CLI
  if (commandExists('chromadb')) {
    cmds.push({ cmd: 'chromadb', args: ['start', '--host', '0.0.0.0', '--port', '8000'] });
  }
  // python module fallbacks
  if (venvHasChromadb()) {
    const py = venvPythonPath();
    cmds.push({ cmd: py, args: ['-m', 'chromadb.server', '--host', '0.0.0.0', '--port', '8000'] });
  }
  if (pythonHasChromadb()) {
    cmds.push({ cmd: 'python3', args: ['-m', 'chromadb.server', '--host', '0.0.0.0', '--port', '8000'] });
  }
  return cmds;
}

function spawnDetached(cmd: any, args: any[] = []) {
  fs.ensureDirSync(path.dirname(LOG_PATH));
  const out = fs.openSync(LOG_PATH, 'a');
  const err = fs.openSync(LOG_PATH, 'a');
  const child = spawn(cmd, args, {
    detached: true,
    stdio: ['ignore', out, err],
    env: process.env
  });
  child.unref();
  child.on('error', (e) => {
    try { fs.appendFileSync(LOG_PATH, `\n[ChromaServerManager] spawn error: ${e.message}\n`); } catch (_: any) {}
  });
  return child;
}

async function isHealthy(chromaUrl = config.chromaUrl) {
  try {
    const controller = new AbortController();
    const timeoutMs = Number(config.requestTimeoutMs || 5000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${chromaUrl}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    await res.json();
    return true;
  } catch (e: any) {
    return false;
  }
}

async function start(options: any = {}) {
  if (await isHealthy()) {
    return { started: false, reason: 'already_running' };
  }

  const cmds = startProcessCommand();
  if (!cmds || cmds.length === 0) {
    return { started: false, error: 'chroma_not_installed' };
  }

  let child = null;
  let used = null;
  for (const c of cmds) {
    try {
      child = spawnDetached(c.cmd, c.args);
      used = c;
      break;
    } catch (e: any) {
      try { fs.appendFileSync(LOG_PATH, `\\n[ChromaServerManager] spawn attempt failed for ${c.cmd}: ${e.message}\\n`); } catch (_: any) {}
    }
  }

  if (!child) {
    return { started: false, error: 'spawn_failed' };
  }

  const meta = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    cmd: `${used.cmd} ${used.args.join(' ')}`,
    startedByFramework: true,
    log: path.relative(process.cwd(), LOG_PATH)
  };

  writePidFile(meta);

  return { started: true, meta, background: true };
}

async function ensureRunning() {
  if (await isHealthy()) {
    return { ok: true, alreadyRunning: true };
  }
  const started = await start();
  if (!started || !started.started) {
    return { ok: false, error: started && started.error ? started.error : 'start_failed' };
  }

  const maxAttempts = 10;
  const delayMs = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    if (await isHealthy()) {
      return { ok: true, started: true, meta: started.meta };
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, error: 'chroma_not_healthy_after_start', meta: started.meta };
}

async function stop() {
  const data = readPidFile();
  if (!data || !data.pid) {
    return { stopped: false, reason: 'no_pid' };
  }
  if (!data.startedByFramework) {
    return { stopped: false, reason: 'not_started_by_framework' };
  }
  try {
    process.kill(data.pid, 'SIGTERM');
  } catch (e: any) {
    try { fs.appendFileSync(LOG_PATH, `\\n[ChromaServerManager] kill error: ${e.message}\\n`); } catch (_: any) {}
  }
  await new Promise((r) => setTimeout(r, 1000));
  removePidFile();
  return { stopped: true, pid: data.pid };
}

async function status() {
  const healthy = await isHealthy();
  const pidInfo = readPidFile();
  return { healthy, pidInfo };
}

if (require.main === module) {
  const cmd = process.argv[2];
  (async () => {
    try {
      if (cmd === 'start') {
        const res = await start();
        console.log(JSON.stringify(res, null, 2));
      } else if (cmd === 'stop') {
        const res = await stop();
        console.log(JSON.stringify(res, null, 2));
      } else if (cmd === 'status') {
        const res = await status();
        console.log(JSON.stringify(res, null, 2));
      } else if (cmd === 'ensure') {
        const res = await ensureRunning();
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log('Usage: node chromaServerManager.js [start|stop|status|ensure]');
      }
    } catch (err: any) {
      console.error('Chroma server manager error:', err.message);
      process.exit(1);
    }
  })();
}

export { isHealthy, start, stop, ensureRunning, status };
export default { isHealthy, start, stop, ensureRunning, status };
