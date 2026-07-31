/**
 * platforms.js
 *
 * Platform constants and helpers.
 * For execution mode enum, see ExecutionMode.js.
 */

const TEST_PLATFORMS = {
  WEB: 'WEB',
  ANDROID: 'ANDROID',
  IOS: 'IOS'
};

function normalizePlatform(platform = process.env.TEST_PLATFORM || TEST_PLATFORMS.WEB) {
  return String(platform).trim().toUpperCase();
}

function isWeb(platform = process.env.TEST_PLATFORM) {
  return normalizePlatform(platform) === TEST_PLATFORMS.WEB;
}

function isAndroid(platform = process.env.TEST_PLATFORM) {
  return normalizePlatform(platform) === TEST_PLATFORMS.ANDROID;
}

function isIOS(platform = process.env.TEST_PLATFORM) {
  return normalizePlatform(platform) === TEST_PLATFORMS.IOS;
}

export { TEST_PLATFORMS, normalizePlatform, isWeb, isAndroid, isIOS };
export default { TEST_PLATFORMS: TEST_PLATFORMS, normalizePlatform: normalizePlatform, isWeb: isWeb, isAndroid: isAndroid, isIOS: isIOS };
