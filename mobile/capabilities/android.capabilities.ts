import ExecutionMode from '../../framework/common/ExecutionMode';
import androidNativeCapabilities from './androidNativeCapabilities';
import androidWebCapabilities from './androidWebCapabilities';
/**
 * android.capabilities.js
 *
 * Top-level Android capabilities builder.
 * Delegates to the correct capability builder based on execution mode:
 *
 *   ANDROID_NATIVE → androidNativeCapabilities (no browserName)
 *   ANDROID_WEB    → androidWebCapabilities (no appPackage/activity)
 *
 * This ensures backward compatibility while enforcing clear separation.
 */

'use strict';


function androidCapabilities() {
  var executionMode = ExecutionMode.getExecutionMode();

  if (executionMode === 'ANDROID_NATIVE') {
    return androidNativeCapabilities();
  }

  if (executionMode === 'ANDROID_WEB') {
    return androidWebCapabilities();
  }

  // Fallback: detect from environment
  if (process.env.BROWSER_NAME && process.env.BROWSER_NAME.toLowerCase() === 'chrome') {
    return androidWebCapabilities();
  }

  if (process.env.APP_PACKAGE || process.env.APP_PATH) {
    return androidNativeCapabilities();
  }

  // Default: web (backward compatible)
  return androidWebCapabilities();
}

export default androidCapabilities;
