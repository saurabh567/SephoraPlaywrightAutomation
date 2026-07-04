/**
 * DeviceMemoryStore.js
 *
 * Tracks device/emulator/simulator state across executions.
 * Stores: device type, OS version, availability, session duration, errors.
 */

const fs = require('fs-extra');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'device-memory.json');

class DeviceMemoryStore {
  constructor() {
    this._ensure();
  }

  _ensure() {
    fs.ensureDirSync(path.dirname(STORE_PATH));
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeJsonSync(STORE_PATH, { devices: [], sessions: [] }, { spaces: 2 });
    }
  }

  _read() { return fs.readJsonSync(STORE_PATH); }
  _write(data) { fs.writeJsonSync(STORE_PATH, data, { spaces: 2 }); }

  /**
   * Record a device session.
   */
  recordSession(sessionData) {
    const data = this._read();

    const session = {
      id: `session-${Date.now()}`,
      timestamp: new Date().toISOString(),
      runId: sessionData.runId || `run-${Date.now()}`,
      platform: sessionData.platform || process.env.TEST_PLATFORM || 'unknown',
      deviceName: sessionData.deviceName || process.env.DEVICE_NAME || 'unknown',
      deviceType: sessionData.deviceType || 'emulator',
      osVersion: sessionData.osVersion || process.env.PLATFORM_VERSION || '',
      appiumHost: process.env.APPIUM_HOST || '127.0.0.1',
      appiumPort: Number(process.env.APPIUM_PORT || 4723),
      sessionDuration: sessionData.sessionDuration || 0,
      success: sessionData.success !== false,
      error: sessionData.error || null
    };

    data.sessions.push(session);

    // Update device registry
    const deviceKey = `${session.platform}:${session.deviceName}`;
    const existing = data.devices.find(d => `${d.platform}:${d.deviceName}` === deviceKey);
    if (existing) {
      existing.lastUsed = session.timestamp;
      existing.sessionCount = (existing.sessionCount || 0) + 1;
      existing.lastSuccess = session.success;
    } else {
      data.devices.push({
        platform: session.platform,
        deviceName: session.deviceName,
        deviceType: session.deviceType,
        osVersion: session.osVersion,
        firstUsed: session.timestamp,
        lastUsed: session.timestamp,
        sessionCount: 1,
        lastSuccess: session.success
      });
    }

    this._write(data);
    return session;
  }

  /**
   * Get device statistics.
   */
  getStats() {
    const data = this._read();
    return {
      totalSessions: data.sessions.length,
      uniqueDevices: data.devices.length,
      successRate: data.sessions.length > 0
        ? Math.round((data.sessions.filter(s => s.success).length / data.sessions.length) * 100)
        : 0,
      devices: data.devices
    };
  }
}

module.exports = DeviceMemoryStore;
