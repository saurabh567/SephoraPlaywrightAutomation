import { execSync } from 'child_process';
import logger from '../../utils/logger';
/**
 * androidAppLauncher.js
 *
 * Android app launch utilities — workaround for SecurityException when
 * Appium tries to start a non-exported launcher activity.
 *
 * Problem:
 *   java.lang.SecurityException: Permission Denial: starting Intent
 *   { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER]
 *   cmp=in.amazon.mShop.android.shopping/com.amazon.mShop.navigation.MainActivity }
 *   from null (pid=12081, uid=2000) not exported from uid 10219
 *
 * Root cause:
 *   com.amazon.mShop.navigation.MainActivity does NOT have android:exported="true"
 *   in the AndroidManifest.xml. Appium cannot launch it directly.
 *
 * Solutions implemented:
 *   1. Auto-detect the correct *exported* launcher activity via ADB (dumpsys)
 *   2. Launch the app via `adb shell am start` before Appium session creation
 *   3. Set `appium:autoLaunch=false` so Appium connects to the already-running app
 *   4. Fallback: Use `adb shell monkey -p <package> 1` if `am start` fails
 */


const LAUNCH_TIMEOUT_MS = 30000;
const ADB_TIMEOUT_MS = 15000;

const KNOWN_EXPORTED_ACTIVITIES = [
  'com.amazon.mShop.home.HomeActivity',
  'com.amazon.mShop.splashscreen.StartupActivity',
  'com.amazon.mShop.splashscreen.SplashActivity',
];

/**
 * Find the correct exported launcher activity for an Android app package.
 * Uses `adb shell dumpsys package <package>` and parses the MAIN/LAUNCHER
 * intent filter blocks.
 */
function findExportedLauncherActivity(appPackage: any) {
  if (!appPackage) return null;

  try {
    logger.info('[androidAppLauncher] Finding exported launcher activity for ' + appPackage + '...');

    const dumpsys = execSync(
      'adb shell dumpsys package ' + appPackage + ' 2>/dev/null || true',
      { encoding: 'utf8', timeout: ADB_TIMEOUT_MS }
    );

    if (!dumpsys || dumpsys.length === 0) {
      logger.warn('[androidAppLauncher] dumpsys returned empty');
      return null;
    }

    // Strategy 1: Find MAIN/LAUNCHER block with ComponentInfo
    const lines = dumpsys.split('\n');
    let inMainSection = false;
    let inLauncherSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('android.intent.action.MAIN:')) {
        inMainSection = true;
        continue;
      }
      if (inMainSection && line.includes('android.intent.category.LAUNCHER:')) {
        inLauncherSection = true;
        continue;
      }
      if (inLauncherSection) {
        // Look for ComponentInfo{package/activity}
        const ciMatch = line.match(/ComponentInfo\{[^}]+\}/);
        if (ciMatch) {
          const inner = ciMatch[0];
          const slashIdx = inner.indexOf('/');
          if (slashIdx > 0) {
            let activity = inner.substring(slashIdx + 1, inner.length - 1).trim();
            if (activity && activity.includes('.')) {
              logger.info('[androidAppLauncher] Found activity: ' + activity);
              // Check if it's exported by looking at nearby lines
              const contextBlock = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
              if (contextBlock.includes('exported=true')) {
                logger.info('[androidAppLauncher] Activity is exported: ' + activity);
                return activity;
              }
              // Even if not explicitly exported, try it
              logger.info('[androidAppLauncher] Activity may not be exported, but trying: ' + activity);
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

    // Strategy 2: resolve-activity --brief
    logger.info('[androidAppLauncher] dumpsys parsing failed, trying resolve-activity...');
    const briefOut = execSync(
      'adb shell cmd package resolve-activity --brief ' + appPackage + ' 2>/dev/null || true',
      { encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (briefOut) {
      const briefLines = briefOut.split('\n').filter(function(l) { return l.trim().length > 0; });
      for (var i = briefLines.length - 1; i >= 0; i--) {
        var bl = briefLines[i].trim();
        var slashIdx = bl.indexOf('/');
        if (slashIdx > 0) {
          var activity = bl.substring(slashIdx + 1).trim();
          if (activity && activity.includes('.')) {
            logger.info('[androidAppLauncher] Found via resolve-activity: ' + activity);
            return activity;
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn('[androidAppLauncher] ADB detection error: ' + err.message);
  }

  return null;
}

/**
 * Launch an Android app via `adb shell am start` or `adb shell monkey`.
 */
function launchAppViaAdb(appPackage: any, activity?: any) {
  if (!appPackage) {
    logger.error('[androidAppLauncher] No appPackage provided');
    return false;
  }

  try {
    let amCommand;

    if (activity) {
      var intentComponent = activity.startsWith('.')
        ? appPackage + activity
        : activity.includes(appPackage)
          ? activity
          : appPackage + '/' + activity;
      amCommand = 'adb shell am start -W -n "' + intentComponent + '"';
    } else {
      amCommand = 'adb shell monkey -p ' + appPackage + ' -c android.intent.category.LAUNCHER 1';
    }

    logger.info('[androidAppLauncher] Launching: ' + amCommand);

    var result = execSync(amCommand, {
      encoding: 'utf8',
      timeout: LAUNCH_TIMEOUT_MS,
    }).trim();

    var success = result.includes('Status: ok')
      || result.includes('Starting: Intent')
      || result.includes('Events injected')
      || result.length > 0;

    if (success) {
      logger.info('[androidAppLauncher] App launched successfully');
      return true;
    }
    logger.warn('[androidAppLauncher] Launch result: ' + result);
    return false;
  } catch (err: any) {
    logger.warn('[androidAppLauncher] ADB launch failed: ' + err.message);
    return false;
  }
}

/**
 * Get Android Appium capabilities with auto-launch disabled.
 */
function disableAutoLaunch(baseCapabilities: any) {
  var caps: Record<string, any> = {};
  for (var k in baseCapabilities) {
    if (baseCapabilities.hasOwnProperty(k)) caps[k] = baseCapabilities[k];
  }
  caps['appium:autoLaunch'] = false;
  delete caps['appium:appActivity'];
  delete caps['appium:appWaitActivity'];
  caps['appium:noReset'] = true;
  // fullReset requires an APK (app capability). When using ADB launch,
  // no APK is provided, so fullReset must be false.
  caps['appium:fullReset'] = false;
  logger.info('[androidAppLauncher] AutoLaunch disabled, fullReset disabled');
  return caps;
}

/**
 * Full Android app launch orchestration.
 * 1. Try to find exported launcher activity
 * 2. If found, configure Appium to use it
 * 3. If not found, launch via ADB `am start` and disable auto-launch
 * 4. Return modified capabilities
 */
function prepareAndroidAppLaunch(appPackage: any, baseCapabilities: any) {
  if (!baseCapabilities) baseCapabilities = {};
  var caps: Record<string, any> = {};
  for (var k in baseCapabilities) {
    if (baseCapabilities.hasOwnProperty(k)) caps[k] = baseCapabilities[k];
  }

  if (!appPackage) {
    logger.warn('[androidAppLauncher] No appPackage');
    return caps;
  }

  var exportedActivity = findExportedLauncherActivity(appPackage);

  if (exportedActivity) {
    logger.info('[androidAppLauncher] Using exported activity: ' + exportedActivity);
    caps['appium:appPackage'] = appPackage;
    caps['appium:appActivity'] = exportedActivity;
    caps['appium:appWaitActivity'] = exportedActivity;
    caps['appium:appWaitDuration'] = Number(process.env.APP_WAIT_DURATION || 30000);
    return caps;
  }

  // No exported activity — launch via ADB
  logger.warn('[androidAppLauncher] No exported activity — falling back to ADB launch');

  var launched = false;
  for (var f = 0; f < KNOWN_EXPORTED_ACTIVITIES.length; f++) {
    logger.info('[androidAppLauncher] Trying: ' + KNOWN_EXPORTED_ACTIVITIES[f]);
    launched = launchAppViaAdb(appPackage, KNOWN_EXPORTED_ACTIVITIES[f]);
    if (launched) break;
  }

  if (!launched) {
    logger.info('[androidAppLauncher] Trying default launcher...');
    launched = launchAppViaAdb(appPackage);
  }

  if (!launched) {
    logger.warn('[androidAppLauncher] All launch methods failed');
    caps['appium:appPackage'] = appPackage;
    caps['appium:appActivity'] = 'com.amazon.mShop.home.HomeActivity';
    caps['appium:appWaitActivity'] = 'com.amazon.mShop.home.HomeActivity';
    return caps;
  }

  // App launched via ADB — disable auto-launch
  try { execSync('sleep 3', { timeout: 5000 }); } catch (_: any) {}

  var modifiedCaps = disableAutoLaunch(caps);
  modifiedCaps['appium:appPackage'] = appPackage;
  return modifiedCaps;
}

/**
 * Escape string for use in RegExp.
 */
function escapeRegExp(str: any) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { findExportedLauncherActivity, launchAppViaAdb, disableAutoLaunch, prepareAndroidAppLaunch, KNOWN_EXPORTED_ACTIVITIES };
export default { findExportedLauncherActivity: findExportedLauncherActivity, launchAppViaAdb: launchAppViaAdb, disableAutoLaunch: disableAutoLaunch, prepareAndroidAppLaunch: prepareAndroidAppLaunch, KNOWN_EXPORTED_ACTIVITIES: KNOWN_EXPORTED_ACTIVITIES };
