require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const host = process.env.APPIUM_HOST || '127.0.0.1';
const port = Number(process.env.APPIUM_PORT || 4723);
const basePath = process.env.APPIUM_BASE_PATH || process.env.APPIUM_PATH || '/';
const protocol = process.env.APPIUM_PROTOCOL || 'http';

module.exports = {
  protocol,
  host,
  port,
  basePath,
  statusUrl: `${protocol}://${host}:${port}/status`,
  serverUrl: `${protocol}://${host}:${port}${basePath}`,
  autoStart: process.env.APPIUM_AUTO_START !== 'false',
  autoStop: process.env.APPIUM_AUTO_STOP !== 'false',
  startTimeout: Number(process.env.APPIUM_START_TIMEOUT || 30000),
  logPath: process.env.APPIUM_LOG_PATH || 'mobile/logs/appium-server.log',
  pidPath: process.env.APPIUM_PID_PATH || 'mobile/logs/appium-server.pid',
  statePath: process.env.APPIUM_STATE_PATH || 'mobile/logs/appium-server-state.json'
};
