/**
 * AmazonFirstLaunchHandler
 *
 * Handles the Amazon Android app first-launch onboarding flow.
 * Every time a new Appium session starts with noReset=false, the Amazon app
 * opens the onboarding screen and asks the user to:
 *   1. Select language (English)
 *   2. Tap "Continue in English"
 *   3. Skip the Sign In screen
 *
 * This module detects whether onboarding is displayed and handles it
 * automatically. If onboarding is not displayed, it continues immediately.
 *
 * Locator strategies use multiple fallbacks to support different Amazon
 * app versions. Each step uses explicit waits. Never fails if onboarding
 * is absent.
 *
 * Log tags: [Android] — all log messages use this tag for clarity in the
 * execution pipeline.
 */

const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Wait constants
// ─────────────────────────────────────────────────────────────────────────────

const SHORT_WAIT_MS = 3000;
const MEDIUM_WAIT_MS = 8000;

// ─────────────────────────────────────────────────────────────────────────────
// Fallback locator groups
//
// Each group is tried in order. The first locator that matches on the
// current screen is used. This supports multiple Amazon app versions.
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_TITLE_LOCATORS = [
  // Accessibility / content-desc based
  '~Select your language',
  '~Choose your language',
  '~Language selection',
  // Text-based (exact)
  'android=new UiSelector().text("Select your language")',
  'android=new UiSelector().text("Choose your language")',
  // Text-based (contains)
  'android=new UiSelector().textContains("Select your language")',
  'android=new UiSelector().textContains("Choose your language")',
  'android=new UiSelector().textContains("language")',
  // XPath fallbacks
  'xpath=//android.widget.TextView[contains(@text, "language")]',
];

const ENGLISH_OPTION_LOCATORS = [
  '~English',
  'android=new UiSelector().text("English")',
  'android=new UiSelector().textContains("English")',
  'xpath=//android.widget.RadioButton[@text="English"]',
  'xpath=//android.widget.CheckedTextView[@text="English"]',
  'xpath=//android.widget.TextView[@text="English"]',
  // Last resort: find any TextView containing "English"
  'xpath=//*[@text="English"]',
];

const CONTINUE_BUTTON_LOCATORS = [
  '~Continue',
  '~Continue in English',
  'android=new UiSelector().text("Continue")',
  'android=new UiSelector().text("Continue in English")',
  'android=new UiSelector().textContains("Continue")',
  'xpath=//android.widget.Button[contains(@text, "Continue")]',
  'xpath=//*[contains(@text, "Continue")]',
];

const SKIP_SIGNIN_LOCATORS = [
  '~Skip sign in',
  '~Skip',
  '~Not now',
  '~Continue without signing in',
  'android=new UiSelector().text("Skip sign in")',
  'android=new UiSelector().text("Skip")',
  'android=new UiSelector().text("Not now")',
  'android=new UiSelector().text("Continue without signing in")',
  'android=new UiSelector().textContains("Skip")',
  'android=new UiSelector().textContains("Not now")',
  'android=new UiSelector().textContains("Continue without signing")',
  'xpath=//android.widget.Button[contains(@text, "Skip")]',
  'xpath=//android.widget.Button[contains(@text, "Not now")]',
  'xpath=//android.widget.Button[contains(@text, "Continue without")]',
  'xpath=//*[contains(@text, "Skip")]',
];

// ─────────────────────────────────────────────────────────────────────────────
// Generic element helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find an element using the given locator. Returns the element or null.
 */
async function findElement(driver, locator) {
  try {
    const elements = await driver.$$(locator);
    if (elements && elements.length > 0) {
      const displayed = await elements[0].isDisplayed();
      if (displayed) return elements[0];
    }
  } catch {
    // Element not found or not displayed — try next locator
  }
  return null;
}

/**
 * Try a list of locators in order. Returns the first matching element.
 */
async function findFirstVisible(driver, locators) {
  for (const locator of locators) {
    const el = await findElement(driver, locator);
    if (el) return el;
  }
  return null;
}

/**
 * Wait for any of the given locators to appear, with a maximum wait.
 */
async function waitForAnyLocator(driver, locators, timeoutMs = MEDIUM_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const el = await findElement(driver, locator);
      if (el) return el;
    }
    await driver.pause(500);
  }
  return null;
}

/**
 * Tap an element safely. Returns true if tap succeeded.
 */
async function tapSafely(driver, element, label) {
  if (!element) return false;
  try {
    await element.click();
    return true;
  } catch (err) {
    logger.warn(`[AmazonFirstLaunch] Tap failed for "${label}": ${err.message}`);
    return false;
  }
}

/**
 * Tap by coordinates (fallback when element tap fails).
 */
async function tapByCoordinates(driver, x, y) {
  try {
    await driver.execute('mobile: clickGesture', { x, y });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether the language selection screen is currently displayed.
 */
async function isLanguageSelectionScreen(driver) {
  const title = await waitForAnyLocator(driver, LANGUAGE_TITLE_LOCATORS, MEDIUM_WAIT_MS);
  return title !== null;
}

/**
 * Detect whether the sign-in screen is currently displayed.
 * Checks for common sign-in UI elements like email/phone input or sign-in button.
 */
async function isSignInScreen(driver) {
  const signInLocators = [
    '~Sign-In',
    '~Sign in',
    'android=new UiSelector().textContains("Sign in")',
    'android=new UiSelector().textContains("Sign-In")',
    'android=new UiSelector().textContains("Email")',
    'android=new UiSelector().textContains("phone number")',
    'xpath=//android.widget.EditText[contains(@text, "Email") or contains(@text, "phone")]',
  ];
  const found = await waitForAnyLocator(driver, signInLocators, SHORT_WAIT_MS);
  return found !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Select English language on the language selection screen.
 */
async function selectEnglish(driver) {
  const englishOption = await findFirstVisible(driver, ENGLISH_OPTION_LOCATORS);
  if (englishOption) {
    await tapSafely(driver, englishOption, 'English language option');
    await driver.pause(1000);
    return true;
  }

  // Fallback: try tapping by coordinates (center of screen ~ position of English)
  logger.warn('[AmazonFirstLaunch] English option not found via locators — trying coordinate tap');
  await tapByCoordinates(driver, 540, 600);
  await driver.pause(1000);
  return false;
}

/**
 * Step 2: Tap the "Continue in English" button.
 */
async function tapContinueButton(driver) {
  // Wait briefly for the continue button to appear after language selection
  await driver.pause(1500);

  const continueBtn = await findFirstVisible(driver, CONTINUE_BUTTON_LOCATORS);
  if (continueBtn) {
    await tapSafely(driver, continueBtn, 'Continue button');
    await driver.pause(1000);
    return true;
  }

  // Fallback: try coordinate tap near bottom-center
  logger.warn('[AmazonFirstLaunch] Continue button not found via locators — trying coordinate tap');
  await tapByCoordinates(driver, 540, 1800);
  await driver.pause(1000);
  return false;
}

/**
 * Step 3: Skip the sign-in screen if it appears.
 */
async function skipSignIn(driver) {
  await driver.pause(2000);

  // Check if sign-in screen is showing
  if (!(await isSignInScreen(driver))) {
    return true;
  }

  // Try explicit skip buttons first
  const skipBtn = await findFirstVisible(driver, SKIP_SIGNIN_LOCATORS);
  if (skipBtn) {
    await tapSafely(driver, skipBtn, 'Skip/Not now button');
    await driver.pause(2000);
    return true;
  }

  // Fallback: try pressing back button (common dismiss on older versions)
  try {
    await driver.back();
    await driver.pause(1500);
  } catch {
    // ignore
  }

  // Last resort: coordinate tap in bottom area where skip/dismiss typically is
  await tapByCoordinates(driver, 540, 1900);
  await driver.pause(1000);

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the Amazon first-launch onboarding flow if it is displayed.
 *
 * Detects whether the onboarding screen (language selection or sign-in) is
 * present. If so, it automatically steps through:
 *   1. Select English language
 *   2. Tap "Continue in English"
 *   3. Skip/dismiss the Sign-In screen
 *
 * If onboarding is not displayed, the method returns immediately without
 * any action. It never fails if onboarding is absent.
 *
 * Multiple fallback locators support different Amazon app versions.
 * All steps use explicit waits and degrade gracefully to coordinate taps.
 *
 * Log messages use [Android] tags for clarity in the execution pipeline.
 *
 * @param {object} driver - WebDriverIO driver instance
 * @returns {Promise<boolean>} true if onboarding was handled, false if no onboarding detected
 */
async function handleFirstLaunchIfNeeded(driver) {
  if (!driver) {
    logger.warn('[AmazonFirstLaunch] No driver provided — skipping');
    return false;
  }

  try {
    // Step 0: Wait briefly for the screen to settle after app launch
    await driver.pause(2000);

    // Check if language selection screen is showing
    const onLanguageScreen = await isLanguageSelectionScreen(driver);

    if (!onLanguageScreen) {
      // No language screen — check if we're on sign-in directly (some versions skip language)
      const onSignIn = await isSignInScreen(driver);
      if (onSignIn) {
        logger.info('[Android] Sign-in skipped.');
        await skipSignIn(driver);
        return true;
      }

      return false;
    }

    logger.info('[Android] First launch detected.');

    // Step 1: Select English
    await selectEnglish(driver);
    logger.info('[Android] Language selected.');
    await driver.pause(1500);

    // Step 2: Tap Continue
    await tapContinueButton(driver);
    logger.info('[Android] Continue in English clicked.');
    await driver.pause(2000);

    // Step 3: Skip sign-in
    await skipSignIn(driver);
    logger.info('[Android] Sign-in skipped.');

    // Final settle
    await driver.pause(2000);

    return true;
  } catch (err) {
    // Never fail if onboarding handling encounters an error
    // The onboarding may have already been completed or the app version
    // doesn't show the screens we're looking for.
    logger.warn(`[AmazonFirstLaunch] Onboarding handling encountered an issue (non-fatal): ${err.message}`);
    return false;
  }
}

module.exports = { handleFirstLaunchIfNeeded };
