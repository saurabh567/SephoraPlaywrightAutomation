const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const appiumConfig = require('../../config/appium.config');

function ensureLogDir() {
  fs.mkdirSync(path.dirname(appiumConfig.logPath), { recursive: true });
}

function appendLog(message) {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(appiumConfig.logPath, line);
}

async function checkStatus() {
  try {
    const response = await fetch(appiumConfig.statusUrl);
    if (!response.ok) {
      return { running: false, healthy: false, statusCode: response.status };
    }

    const body = await response.json().catch(() => ({}));
    const ready = body.value && Object.prototype.hasOwnProperty.call(body.value, 'ready')
      ? body.value.ready !== false
      : true;

    return { running: true, healthy: ready, body };
  } catch (error) {
    return { running: false, healthy: false, error: error.message };
  }
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: appiumConfig.host, port: appiumConfig.port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function writeState(pid) {
  ensureLogDir();
  fs.writeFileSync(appiumConfig.pidPath, String(pid));
  fs.writeFileSync(appiumConfig.statePath, JSON.stringify({
    pid,
    startedByFramework: true,
    host: appiumConfig.host,
    port: appiumConfig.port,
    basePath: appiumConfig.basePath,
    startedAt: new Date().toISOString()
  }, null, 2));
}

function readState() {
  if (!fs.existsSync(appiumConfig.statePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(appiumConfig.statePath, 'utf8'));
  } catch (error) {
    appendLog(`Unable to read Appium state file: ${error.message}`);
    return null;
  }
}

function clearState() {
  for (const filePath of [appiumConfig.pidPath, appiumConfig.statePath]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function waitForHealthyStatus(timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await checkStatus();
    if (status.running && status.healthy) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for Appium server health at ${appiumConfig.statusUrl}`);
}

function spawnAppium() {
  ensureLogDir();
  const logFd = fs.openSync(appiumConfig.logPath, 'a');
  appendLog(`Starting Appium server on ${appiumConfig.host}:${appiumConfig.port}${appiumConfig.basePath}`);

  const child = spawn('npx', [
    'appium',
    '--address',
    appiumConfig.host,
    '--port',
    String(appiumConfig.port),
    '--base-path',
    appiumConfig.basePath
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env
  });

  child.unref();
  writeState(child.pid);
  appendLog(`Appium server process started with pid ${child.pid}`);
  return child;
}

async function startServerIfNeeded() {
  const status = await checkStatus();
  if (status.running && status.healthy) {
    appendLog('Appium server already running');
    return { startedByFramework: false, status };
  }

  if (await isPortOpen()) {
    throw new Error(`Port ${appiumConfig.port} is already in use but ${appiumConfig.statusUrl} is not healthy.`);
  }

  if (!appiumConfig.autoStart) {
    throw new Error(`Appium server is not running and APPIUM_AUTO_START=false. Start it manually at ${appiumConfig.serverUrl}`);
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      appendLog(`Appium startup attempt ${attempt}`);
      spawnAppium();
      const healthyStatus = await waitForHealthyStatus(appiumConfig.startTimeout);
      appendLog('Appium server started successfully');
      return { startedByFramework: true, status: healthyStatus };
    } catch (error) {
      lastError = error;
      appendLog(`Appium startup attempt ${attempt} failed: ${error.message}`);
      await stopServerIfStartedByFramework({ force: true });
    }
  }

  throw lastError;
}

async function stopServerIfStartedByFramework(options = {}) {
  const state = readState();

  if (!state || !state.startedByFramework || !state.pid) {
    appendLog('Appium server stop skipped because it was not started by this framework');
    return { stopped: false, reason: 'not-started-by-framework' };
  }

  if (!appiumConfig.autoStop && !options.force) {
    appendLog('Appium server stop skipped because APPIUM_AUTO_STOP=false');
    return { stopped: false, reason: 'auto-stop-disabled' };
  }

  appendLog(`Stopping Appium server pid ${state.pid}`);

  try {
    process.kill(-state.pid, 'SIGTERM');
  } catch (groupError) {
    try {
      process.kill(state.pid, 'SIGTERM');
    } catch (pidError) {
      appendLog(`Appium server process was already stopped or unavailable: ${pidError.message}`);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const status = await checkStatus();
  if (status.running) {
    try {
      process.kill(-state.pid, 'SIGKILL');
    } catch (error) {
      appendLog(`Unable to force kill Appium process group: ${error.message}`);
    }
  }

  clearState();
  appendLog('Appium server stopped by framework');
  return { stopped: true };
}

module.exports = {
  checkStatus,
  startServerIfNeeded,
  stopServerIfStartedByFramework
};
