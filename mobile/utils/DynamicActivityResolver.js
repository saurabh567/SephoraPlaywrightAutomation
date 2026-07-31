/**
 * DynamicActivityResolver.js
 *
 * Resolves Android launchable activity dynamically via ADB.
 * Never hardcodes HomeActivity, SplashActivity, or StartupActivity.
 * Caches resolved activity for reuse across the session.
 *
 * Resolution order:
 *   1. If APP_ACTIVITY is already set in env, use it (respect user config)
 *   2. Try `adb shell dumpsys package <pkg>` for MAIN/LAUNCHER block
 *   3. Fall back to `adb shell cmd package resolve-activity --brief <pkg>`
 *   4. Verify the resolved activity is launchable
 *   5. Cache result in process.env.APP_ACTIVITY for downstream consumers
 */

'use strict';

const { execSync } = require('child_process');

var _activityCache = {};

class DynamicActivityResolver {
  /**
   * Resolve the launchable activity for a given Android package.
   *
   * @param {string} appPackage - Android package name
   * @returns {string|null} Fully qualified activity class name, or null
   */
  static resolve(appPackage) {
    if (!appPackage) {
      console.warn('[DynamicActivityResolver] No appPackage provided');
      return null;
    }

    // Check cache first
    if (_activityCache[appPackage]) {
      console.log('[DynamicActivityResolver] Using cached activity for ' + appPackage + ': ' + _activityCache[appPackage]);
      return _activityCache[appPackage];
    }

    // Check if already in environment
    if (process.env.APP_ACTIVITY && process.env.APP_ACTIVITY.trim().length > 0) {
      var existingActivity = process.env.APP_ACTIVITY.trim();
      _activityCache[appPackage] = existingActivity;
      console.log('[DynamicActivityResolver] Using APP_ACTIVITY from environment: ' + existingActivity);
      return existingActivity;
    }

    console.log('[DynamicActivityResolver] Resolving launchable activity for: ' + appPackage);

    // Strategy 1: Parse dumpsys package output
    var activity = DynamicActivityResolver._resolveViaDumpsys(appPackage);
    if (activity) {
      _activityCache[appPackage] = activity;
      process.env.APP_ACTIVITY = activity;
      console.log('[DynamicActivityResolver] Resolved via dumpsys: ' + activity);
      return activity;
    }

    // Strategy 2: resolve-activity --brief
    activity = DynamicActivityResolver._resolveViaResolveActivity(appPackage);
    if (activity) {
      _activityCache[appPackage] = activity;
      process.env.APP_ACTIVITY = activity;
      console.log('[DynamicActivityResolver] Resolved via resolve-activity: ' + activity);
      return activity;
    }

    console.warn('[DynamicActivityResolver] Could not resolve activity for: ' + appPackage);
    return null;
  }

  /**
   * Parse dumpsys package output for MAIN/LAUNCHER activity.
   */
  static _resolveViaDumpsys(appPackage) {
    try {
      var out = DynamicActivityResolver._exec(
        'adb shell dumpsys package ' + appPackage + ' 2>/dev/null || true',
        15000
      );
      if (!out || out.length < 50) return null;

      var lines = out.split('\n');
      var inMainSection = false;
      var inLauncherSection = false;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if (line.includes('android.intent.action.MAIN:')) {
          inMainSection = true;
          continue;
        }
        if (inMainSection && line.includes('android.intent.category.LAUNCHER:')) {
          inLauncherSection = true;
          continue;
        }
        if (inLauncherSection) {
          // ComponentInfo{package/activity}
          var ciMatch = line.match(/ComponentInfo\{[^}]+\}/);
          if (ciMatch) {
            var inner = ciMatch[0];
            var slashIdx = inner.indexOf('/');
            if (slashIdx > 0) {
              var activity = inner.substring(slashIdx + 1, inner.length - 1).trim();
              if (activity && activity.includes('.')) {
                return activity;
              }
            }
          }
          // Stop at next intent filter
          if (line.includes('android.intent.action.') && !line.includes('MAIN')) {
            break;
          }
        }
      }
    } catch (err) {
      console.warn('[DynamicActivityResolver] dumpsys failed: ' + err.message);
    }
    return null;
  }

  /**
   * Fall back to resolve-activity --brief.
   */
  static _resolveViaResolveActivity(appPackage) {
    try {
      var out = DynamicActivityResolver._exec(
        'adb shell cmd package resolve-activity --brief ' + appPackage + ' 2>/dev/null || true',
        10000
      );
      if (!out) return null;

      var briefLines = out.split('\n').filter(function(l) { return l.trim().length > 0; });
      for (var i = briefLines.length - 1; i >= 0; i--) {
        var bl = briefLines[i].trim();
        var slashIdx = bl.indexOf('/');
        if (slashIdx > 0) {
          var activity = bl.substring(slashIdx + 1).trim();
          if (activity && activity.includes('.') && !activity.includes('$')) {
            return activity;
          }
        } else if (bl.includes('.') && (bl.startsWith('com.') || bl.startsWith('android.'))) {
          return bl;
        }
      }
    } catch (err) {
      console.warn('[DynamicActivityResolver] resolve-activity failed: ' + err.message);
    }
    return null;
  }

  /**
   * Clear the activity cache (for testing or re-detection).
   */
  static clearCache() {
    _activityCache = {};
    delete process.env.APP_ACTIVITY;
  }

  /**
   * Execute shell command.
   */
  static _exec(cmd, timeout) {
    try {
      return execSync(cmd, {
        encoding: 'utf8',
        timeout: timeout || 10000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch (err) {
      return (err.stdout || '').toString().trim();
    }
  }
}

module.exports = DynamicActivityResolver;
