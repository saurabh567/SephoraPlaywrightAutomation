/**
 * ai/memory/index.js
 *
 * Central export for all memory stores.
 * Every execution enriches these stores for trend analysis and historical tracking.
 */

const FailureMemoryStore = require('./FailureMemoryStore');
const EnvironmentMemoryStore = require('./EnvironmentMemoryStore');
const DeviceMemoryStore = require('./DeviceMemoryStore');
const PerformanceMemoryStore = require('./PerformanceMemoryStore');
const executionHistory = require('../agents/executionMemoryAgent');
const sharedMemory = require('./sharedMemory');

module.exports = {
  FailureMemoryStore,
  EnvironmentMemoryStore,
  DeviceMemoryStore,
  PerformanceMemoryStore,
  executionHistory,
  sharedMemory
};
