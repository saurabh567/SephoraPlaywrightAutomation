require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const host = process.env.APPIUM_HOST || '127.0.0.1';
const port = Number(process.env.APPIUM_PORT || 4723);
const basePath = process.env.APPIUM_BASE_PATH || process.env.APPIUM_PATH || '/';
const protocol = process.env.APPIUM_PROTOCOL || 'http';

export { protocol, host, port, basePath };
export const statusUrl = `${protocol}://${host}:${port}/status`;
export const serverUrl = `${protocol}://${host}:${port}${basePath}`;
export const autoStart = process.env.APPIUM_AUTO_START !== 'false';
export const autoStop = process.env.APPIUM_AUTO_STOP !== 'false';
export const startTimeout = Number(process.env.APPIUM_START_TIMEOUT || 30000);
export const logPath = process.env.APPIUM_LOG_PATH || 'mobile/logs/appium-server.log';
export const pidPath = process.env.APPIUM_PID_PATH || 'mobile/logs/appium-server.pid';
export const statePath = process.env.APPIUM_STATE_PATH || 'mobile/logs/appium-server-state.json';

export default { protocol, host, port, basePath, statusUrl, serverUrl, autoStart, autoStop, startTimeout, logPath, pidPath, statePath };
