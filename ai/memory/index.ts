/**
 * ai/memory/index.ts
 *
 * Central export for all memory stores.
 * Every execution enriches these stores for trend analysis and historical tracking.
 */

import FailureMemoryStore from './FailureMemoryStore';
export { FailureMemoryStore };
import EnvironmentMemoryStore from './EnvironmentMemoryStore';
export { EnvironmentMemoryStore };
import DeviceMemoryStore from './DeviceMemoryStore';
export { DeviceMemoryStore };
import PerformanceMemoryStore from './PerformanceMemoryStore';
export { PerformanceMemoryStore };
import executionHistory from '../agents/executionMemoryAgent';
export { executionHistory };
import sharedMemory from './sharedMemory';
export { sharedMemory };

export default {
  FailureMemoryStore,
  EnvironmentMemoryStore,
  DeviceMemoryStore,
  PerformanceMemoryStore,
  executionHistory,
  sharedMemory
};
