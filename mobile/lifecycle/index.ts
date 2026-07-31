/**
 * mobile/lifecycle/index.ts
 *
 * Central export point for the enterprise-grade startup lifecycle framework.
 *
 * Architecture:
 *
 *   AndroidBootManager      — Boot verification + app launch lifecycle (phases 1–7)
 *   AndroidStartupPipeline  — Full Android pipeline (boot + Appium + driver + tests)
 *   IosStartupPipeline      — Full iOS pipeline (boot + WDA + driver + tests)
 *   StartupOrchestrator     — Platform-aware orchestrator entry point
 *   StepLogger              — Per-phase instrumentation
 *   EnvironmentValidator    — Pre-flight environment validation
 *   DeviceManager           — ADB/simctl device discovery + management
 *   AppiumLifecycleManager  — Appium server lifecycle
 *   WdaLifecycleManager     — WebDriverAgent lifecycle
 *   DriverManager           — Shared driver registry for hooks/tests
 */

import StartupOrchestrator from './StartupOrchestrator';
export { StartupOrchestrator };
import StepLogger from './StepLogger';
export { StepLogger };
import AndroidBootManager from './AndroidBootManager';
export { AndroidBootManager };
import EnvironmentValidator from './EnvironmentValidator';
export { EnvironmentValidator };
import DeviceManager from './DeviceManager';
export { DeviceManager };
import AppiumLifecycleManager from './AppiumLifecycleManager';
export { AppiumLifecycleManager };
import WdaLifecycleManager from './WdaLifecycleManager';
export { WdaLifecycleManager };
import DriverManager from './DriverManager';
export { DriverManager };
import AndroidStartupPipeline from './AndroidStartupPipeline';
export { AndroidStartupPipeline };
import IosStartupPipeline from './IosStartupPipeline';
export { IosStartupPipeline };

export default {
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
