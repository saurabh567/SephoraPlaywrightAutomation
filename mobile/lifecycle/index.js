/**
 * mobile/lifecycle/index.js
 *
 * Central export point for the enterprise-grade startup lifecycle framework.
 *
 * Architecture:
 *
 *   AndroidBootManager      — Boot verification + app launch lifecycle (phases 1–7)
 *   AndroidStartupPipeline  — Full Android pipeline (boot + Appium + driver + tests)
 *   IosStartupPipeline      — Full iOS pipeline (boot + WDA + driver + tests)
 *   StartupOrchestrator     — Unified entry point for both platforms
 *   StepLogger              — Structured [STEP N] logging
 *   EnvironmentValidator    — Prerequisite tooling checks
 *   DeviceManager           — Device/emulator/simulator lifecycle
 *   AppiumLifecycleManager  — Appium server start/stop/health
 *   WdaLifecycleManager     — WebDriverAgent lifecycle (iOS)
 *   DriverManager           — Singleton driver creation (native + web)
 *
 * Usage:
 *   const {
 *     StartupOrchestrator,
 *     StepLogger,
 *     AndroidBootManager,
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
const AndroidBootManager = require('./AndroidBootManager');
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
  AndroidBootManager,
  EnvironmentValidator,
  DeviceManager,
  AppiumLifecycleManager,
  WdaLifecycleManager,
  DriverManager,
  AndroidStartupPipeline,
  IosStartupPipeline
};
