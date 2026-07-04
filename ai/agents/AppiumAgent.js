const appiumConfig = require('../../config/appium.config');
const appiumServerManager = require('../../mobile/utils/appiumServerManager');

class AppiumAgent {
  static async status() {
    const status = await appiumServerManager.checkStatus();
    if (status.running && status.healthy) {
      console.log(`Appium server is running: ${appiumConfig.statusUrl}`);
    } else {
      console.log(`Appium server is not running: ${appiumConfig.statusUrl}`);
    }
    return status;
  }

  static async startServerIfNeeded() {
    return appiumServerManager.startServerIfNeeded();
  }

  static async stopServerIfStartedByFramework() {
    return appiumServerManager.stopServerIfStartedByFramework();
  }
}

async function runCli() {
  const command = process.argv[2] || 'status';

  if (command === 'status') {
    await AppiumAgent.status();
    return;
  }

  if (command === 'start') {
    const result = await AppiumAgent.startServerIfNeeded();
    console.log(result.startedByFramework
      ? 'Appium server started by framework'
      : 'Appium server already running');
    return;
  }

  if (command === 'stop') {
    const result = await AppiumAgent.stopServerIfStartedByFramework();
    console.log(result.stopped
      ? 'Appium server stopped by framework'
      : `Appium server stop skipped: ${result.reason}`);
    return;
  }

  throw new Error(`Unsupported AppiumAgent command: ${command}`);
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(`AppiumAgent failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = AppiumAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Appium Server Agent",
  "version": "1.0.0",
  "description": "Appium server lifecycle management (start/stop/status)",
  "dependencies": [],
  "platforms": [
    "ANDROID",
    "IOS"
  ],
  "tags": [
    "mobile",
    "infrastructure"
  ],
  "executionStage": "preflight",
  "priority": 95,
  "conditions": [
    {
      "type": "platform",
      "value": "mobile"
    }
  ],
  "retryPolicy": {
    "maxRetries": 3,
    "backoff": "exponential"
  },
  "lifecycle": "active"
};
