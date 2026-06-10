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

module.exports = {
  TEST_PLATFORMS,
  normalizePlatform,
  isWeb,
  isAndroid,
  isIOS
};
