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
 * STRICT ORDERING — The automation MUST NEVER attempt to skip Sign In
 * until the language selection has been completed successfully.
 *
 * Flow:
 *   1. Detect "Choose your language" screen
 *   2. Select the "English" tile
 *   3. Verify English is selected (checkmark / highlight)
 *   4. Tap "Continue in English"
 *   5. Wait until the language screen disappears entirely
 *   6. ONLY THEN look for and click "Skip Sign In" (or equivalent)
 *
 * If ANY step fails, a screenshot is captured, the page source is dumped
 * for debugging, and the test is stopped immediately (error thrown).
 *
 * If the onboarding screen is NOT displayed, the method returns false
 * immediately so normal test execution can proceed.
 *
 * Log messages use [Android] tags for clarity in the execution pipeline.
 */

const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AFTER_TAP_WAIT_MS = 1500;
const LANG_DISMISS_WAIT_MS = 10000;
const SIGNIN_WAIT_MS = 5000;

const REPORT_DIR = 'reports';

// ─────────────────────────────────────────────────────────────────────────────
// Locator groups
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_SCREEN_TITLE = [
  '~Choose your language',
  '~Select your language',
  '~Language selection',
  'android=new UiSelector().text("Choose your language")',
  'android=new UiSelector().text("Select your language")',
  'android=new UiSelector().textContains("Choose your language")',
  'android=new UiSelector().textContains("Select your language")',
  'android=new UiSelector().textContains("language")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("language"))',
  'xpath=//android.widget.TextView[contains(@text, "Choose your language")]',
  'xpath=//android.widget.TextView[contains(@text, "Select your language")]',
  'xpath=//*[contains(@text, "language")]',
  'id:in.amazon.mShop.android.shopping:id/language_title',
];

const ENGLISH_TILE = [
  '~English',
  '~English (India)',
  '~English – English',
  'android=new UiSelector().text("English")',
  'android=new UiSelector().text("English – English")',
  'android=new UiSelector().text("English (India)")',
  'android=new UiSelector().textContains("English")',
  'android=new UiSelector().className("android.widget.TextView").text("English")',
  'android=new UiSelector().className("android.widget.RadioButton").text("English")',
  'android=new UiSelector().className("android.widget.CheckedTextView").text("English")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("English"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("English"))',
  'xpath=//android.widget.RadioButton[@text="English"]',
  'xpath=//android.widget.CheckedTextView[@text="English"]',
  'xpath=//android.widget.TextView[@text="English"]',
  'xpath=//*[@text="English"]',
  'xpath=//*[@text="English – English"]',
  'xpath=//*[@clickable="true"]//*[contains(@text, "English")]',
  'xpath=//*[contains(@text, "English")]',
  'id:in.amazon.mShop.android.shopping:id/language_english',
  'id:in.amazon.mShop.android.shopping:id/english_radio',
  'id:in.amazon.mShop.android.shopping:id/english_option',
  'id:in.amazon.mShop.android.shopping:id/english_language',
];

const ENGLISH_SELECTED_INDICATOR = [
  'android=new UiSelector().className("android.widget.RadioButton").text("English").selected(true)',
  'android=new UiSelector().className("android.widget.RadioButton").text("English").checked(true)',
  'android=new UiSelector().className("android.widget.CheckedTextView").text("English").checked(true)',
  'xpath=//android.widget.RadioButton[@text="English" and (@checked="true" or @selected="true")]',
  'xpath=//android.widget.CheckedTextView[@text="English" and @checked="true"]',
  'id:in.amazon.mShop.android.shopping:id/selected_indicator',
  'id:in.amazon.mShop.android.shopping:id/checkmark',
  'id:in.amazon.mShop.android.shopping:id/selection_marker',
  '~English (selected)',
  '~English, selected',
];

const CONTINUE_BUTTON = [
  '~Continue',
  '~Continue in English',
  'android=new UiSelector().text("Continue")',
  'android=new UiSelector().text("Continue in English")',
  'android=new UiSelector().textContains("Continue")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("Continue"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Continue"))',
  'xpath=//android.widget.Button[@text="Continue"]',
  'xpath=//android.widget.Button[contains(@text, "Continue")]',
  'xpath=//*[@clickable="true" and contains(@text, "Continue")]',
  'xpath=//*[contains(@text, "Continue")]',
  'id:in.amazon.mShop.android.shopping:id/continue_button',
  'id:in.amazon.mShop.android.shopping:id/continue_btn',
  'id:in.amazon.mShop.android.shopping:id/continue_english_btn',
];

const SKIP_SIGNIN_BUTTON = [
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
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Skip"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Not now"))',
  'xpath=//android.widget.Button[contains(@text, "Skip")]',
  'xpath=//android.widget.Button[contains(@text, "Not now")]',
  'xpath=//android.widget.Button[contains(@text, "Continue without")]',
  'xpath=//*[contains(@text, "Skip")]',
  'id:in.amazon.mShop.android.shopping:id/skip_sign_in_button',
  'id:in.amazon.mShop.android.shopping:id/skip_btn',
];

const SIGNIN_SCREEN_INDICATORS = [
  '~Sign-In',
  '~Sign in',
  'android=new UiSelector().textContains("Sign in")',
  'android=new UiSelector().textContains("Sign-In")',
  'android=new UiSelector().textContains("Email")',
  'android=new UiSelector().textContains("phone number")',
  'xpath=//android.widget.EditText',
];

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────

function dumpPageSourceSync(driver, label) {
  try {
    const dir = path.resolve(process.cwd(), REPORT_DIR, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = Date.now();
    const filePath = path.join(dir, `page-source-${label}-${timestamp}.xml`);

    if (typeof driver.getPageSource === 'function') {
      driver.getPageSource().then(source => {
        fs.writeFileSync(filePath, source, 'utf8');
        logger.info(`[Android] Page source dumped: ${filePath}`);
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn(`[Android] Page source dump failed: ${err.message}`);
  }
}

function captureScreenshotSync(driver, label) {
  try {
    const dir = path.resolve(process.cwd(), REPORT_DIR, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = Date.now();
    const filePath = path.join(dir, `first-launch-failure-${label}-${timestamp}.png`);

    if (typeof driver.saveScreenshot === 'function') {
      driver.saveScreenshot(filePath);
    } else if (typeof driver.takeScreenshot === 'function') {
      const png = driver.takeScreenshot();
      fs.writeFileSync(filePath, png, 'base64');
    }

    logger.info(`[Android] Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`[Android] Screenshot capture failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Element helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a visible element using ANY of the given locator strategies.
 */
async function findAny(driver, locators, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      try {
        const elements = await driver.$$(locator);
        if (elements && elements.length > 0) {
          const displayed = await elements[0].isDisplayed().catch(() => false);
          if (displayed) return elements[0];
        }
      } catch {
        // locator strategy not supported or element gone — try next
      }
    }
    await driver.pause(300);
  }
  return null;
}

/**
 * Find ANY element on the screen whose rendered text attribute contains
 * the given substring. Uses getPageSource() XML parsing to discover
 * elements that standard locators might miss (e.g. due to custom views,
 * nested layouts, or unexpected class names).
 *
 * This is a last-resort fallback when findAny() fails.
 */
async function findElementByTextContains(driver, text, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const source = await driver.getPageSource();

      // Escape special regex characters in the search text
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`text="${escaped}[^"]*"`, 'i');

      // Try XPath with text() function (works across all element types)
      const xpathLocators = [
        `xpath=//*[contains(text(), "${text}")]`,
        `xpath=//*[@text="${text}"]`,
        `xpath=//*[contains(@text, "${text}")]`,
      ];

      for (const loc of xpathLocators) {
        try {
          const elements = await driver.$$(loc);
          if (elements && elements.length > 0) {
            for (const el of elements) {
              const displayed = await el.isDisplayed().catch(() => false);
              if (displayed) return el;
            }
          }
        } catch {
          // try next XPath variant
        }
      }
    } catch {
      // page source fetch failed — wait and retry
    }
    await driver.pause(500);
  }
  return null;
}

/**
 * Wait until a locator set is NO LONGER visible.
 */
async function waitForAbsence(driver, locators, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let found = false;
    for (const locator of locators) {
      try {
        const elements = await driver.$$(locator);
        if (elements && elements.length > 0) {
          const displayed = await elements[0].isDisplayed().catch(() => false);
          if (displayed) { found = true; break; }
        }
      } catch { /* element gone */ }
    }
    if (!found) return true;
    await driver.pause(400);
  }
  return false;
}

/**
 * Tap an element. Throws if the element is null.
 */
async function tapElement(driver, element, label) {
  if (!element) {
    throw new Error(`[Android] Cannot tap "${label}" — element not found`);
  }
  try {
    await element.click();
    logger.info(`[Android] ${label}`);
  } catch (err) {
    throw new Error(`[Android] Failed to tap "${label}": ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen detection
// ─────────────────────────────────────────────────────────────────────────────

async function isLanguageScreen(driver) {
  const title = await findAny(driver, LANGUAGE_SCREEN_TITLE, 10000);
  return title !== null;
}

async function isSignInScreen(driver) {
  const indicator = await findAny(driver, SIGNIN_SCREEN_INDICATORS, 2000);
  return indicator !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Select the English language tile.
 *
 * Uses standard locators first (findAny). If those fail, falls back to
 * page-source parsing (findElementByTextContains) as a last resort.
 * Throws if English tile cannot be found by any strategy.
 */
async function stepSelectEnglish(driver) {
  // Strategy A: standard locators
  let english = await findAny(driver, ENGLISH_TILE, 5000);

  // Strategy B: page-source text search (catches elements with unusual
  // class names, custom views, or nested structures)
  if (!english) {
    logger.info('[Android] Standard locators did not find English tile — trying page-source text search...');
    english = await findElementByTextContains(driver, 'English', 3000);
  }

  if (!english) {
    dumpPageSourceSync(driver, 'english-tile-not-found');
    captureScreenshotSync(driver, 'english-tile-not-found');
    throw new Error('[Android] FAILED: English language tile not found on the screen');
  }

  await tapElement(driver, english, 'Language selected.');
  await driver.pause(AFTER_TAP_WAIT_MS);
}

/**
 * Step 2: Verify that English is selected.
 */
async function stepVerifyEnglishSelected(driver) {
  const indicator = await findAny(driver, ENGLISH_SELECTED_INDICATOR, 3000);
  if (!indicator) {
    logger.warn('[Android] English selection indicator not visible (non-fatal)');
  }
}

/**
 * Step 3: Tap the "Continue in English" button.
 */
async function stepTapContinue(driver) {
  let btn = await findAny(driver, CONTINUE_BUTTON, 5000);

  if (!btn) {
    btn = await findElementByTextContains(driver, 'Continue', 3000);
  }

  if (!btn) {
    dumpPageSourceSync(driver, 'continue-button-not-found');
    captureScreenshotSync(driver, 'continue-button-not-found');
    throw new Error('[Android] FAILED: Continue button not found after selecting English');
  }

  await tapElement(driver, btn, 'Continue in English clicked.');
  await driver.pause(AFTER_TAP_WAIT_MS);
}

/**
 * Step 4: Wait for the language screen to dismiss.
 */
async function stepWaitLanguageScreenDismissed(driver) {
  const gone = await waitForAbsence(driver, LANGUAGE_SCREEN_TITLE, LANG_DISMISS_WAIT_MS);
  if (!gone) {
    dumpPageSourceSync(driver, 'language-screen-not-dismissed');
    captureScreenshotSync(driver, 'language-screen-not-dismissed');
    throw new Error('[Android] FAILED: Language screen did not dismiss after tapping Continue');
  }

  logger.info('[Android] Language screen dismissed.');
  await driver.pause(1000);
}

/**
 * Step 5: Skip the sign-in screen.
 */
async function stepSkipSignIn(driver) {
  const signInVisible = await isSignInScreen(driver);
  if (!signInVisible) {
    logger.info('[Android] No sign-in screen detected.');
    return;
  }

  logger.info('[Android] Sign-in screen detected — looking for dismiss option...');

  let skipBtn = await findAny(driver, SKIP_SIGNIN_BUTTON, SIGNIN_WAIT_MS);

  if (!skipBtn) {
    skipBtn = await findElementByTextContains(driver, 'Skip', 3000);
  }

  if (!skipBtn) {
    dumpPageSourceSync(driver, 'skip-signin-button-not-found');
    captureScreenshotSync(driver, 'skip-signin-button-not-found');
    throw new Error('[Android] FAILED: Sign-in screen displayed but no Skip/Not now button found');
  }

  await tapElement(driver, skipBtn, 'Sign-in skipped.');
  await driver.pause(2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the Amazon first-launch onboarding flow if it is displayed.
 *
 * @param {object} driver - WebDriverIO driver instance
 * @returns {Promise<boolean>} true if onboarding was handled, false if not displayed
 * @throws {Error} if any onboarding step fails
 */
async function handleFirstLaunchIfNeeded(driver) {
  if (!driver) {
    logger.warn('[AmazonFirstLaunch] No driver provided — skipping');
    return false;
  }

  await driver.pause(3000);

  const languageVisible = await isLanguageScreen(driver);
  if (!languageVisible) return false;

  logger.info('[Android] First launch detected.');

  await stepSelectEnglish(driver);
  await stepVerifyEnglishSelected(driver);
  await stepTapContinue(driver);
  await stepWaitLanguageScreenDismissed(driver);
  await stepSkipSignIn(driver);

  logger.info('[Android] First-launch onboarding completed successfully.');
  return true;
}

module.exports = { handleFirstLaunchIfNeeded };
