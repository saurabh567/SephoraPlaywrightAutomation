/**
 * mobile/lifecycle/index.js
 *
 * Central export point for the enterprise-gade startup lifecycle framework.
 *
 * Usage:
 *   const {
 *     StartupOrchestrator,
 *     StepLogger,
 *     EnvironmentValidator,
 *     DeviceManager,
 *     AppiumLifecycleManager,
 *     WdaLifecycleManager,
 *     DriverManager,
 *     AndroidStartupPipeline,
 *     IosStartupPipeline
 *   } = require('./mobile/lifecycle');
 */

'use strict';

const StartupOrchestrator = require('./StartupOrchestrator');
const StepLogger = require('./StepLogger');
const EnvironmentValidator = require('./EnvironmentValidator');
const DeviceManager = require('./DeviceManager');
const AppiumLifecycleManager = require('./AppiumLifecycleManager');
const WdaLifecycleManager = require('./WdaLifecycleManager');
const DriverManager = require('./DriverManager');
const AndroidStartupPipeline = require('./AndroidStartupPipeline');
const IosStartupPipeline = require('./IosStartupPipeline');

module.exports = {
  StartupOrchestrator,
  StepLogger,
  EnvironmentValidator,
  DeviceManager,
  AppiumLifecycleManager,
  WdaLifecycleManager,
  DriverManager,
  AndroidStartupPipeline,
  IosStartupPipeline
};
