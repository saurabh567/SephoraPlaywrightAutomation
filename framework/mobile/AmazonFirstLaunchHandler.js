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
 *   1. Dismiss any system notifications/overlays (notification shade,
 *      Google Play Services update prompt, setup wizard, etc.)
 *   2. Detect "Choose your language" screen
 *   3. Select the "English" tile
 *   4. Verify English is selected (checkmark / highlight)
 *   5. Tap "Continue in English"
 *   6. Wait until the language screen disappears entirely
 *   7. ONLY THEN look for and click "Skip Sign In" (or equivalent)
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
//
// NOTE: WebDriverIO v9's driver.$$() does NOT support the "xpath=" prefix.
//       Plain XPath strings starting with "//" are auto-detected as XPath.
//       Using "xpath=//..." causes the entire string to be treated as a raw
//       XPath expression, producing broken queries like ".//xpath[...]".
//       All XPath locators below use bare "//" syntax.
// ─────────────────────────────────────────────────────────────────────────────

/** Detect Android system notification shade / panel */
const NOTIFICATION_SHADE = [
  '//android.widget.FrameLayout[@content-desc="Notification shade"]',
  '//android.widget.FrameLayout[contains(@content-desc, "notification")]',
  '//android.widget.ScrollView[contains(@content-desc, "notification")]',
  '//*[contains(@content-desc, "Notifications")]',
  '//*[contains(@text, "Notifications")]',
  '//android.widget.FrameLayout[@content-desc="Notifications"]',
  // UiSelector fallbacks for notification icons/entries
  'android=new UiSelector().descriptionContains("notification")',
  'android=new UiSelector().descriptionContains("Notification")',
  'android=new UiSelector().textContains("notification")',
  'android=new UiSelector().className("android.widget.FrameLayout").descriptionContains("Notification")',
];

/** Detect common system dialogs that may overlay the app */
const SYSTEM_DIALOGS = [
  // Google Play Services update prompt
  '//*[@text="Update" and contains(@resource-id, "play")]',
  '//*[contains(@text, "Google Play Services")]',
  '//*[contains(@text, "Update Google Play")]',
  // System update dialog
  '//*[contains(@text, "System update")]',
  '//*[contains(@text, "Software update")]',
  // Setup wizard / welcome screens
  '//*[contains(@text, "Welcome") and contains(@text, "Android")]',
  '//*[contains(@text, "Set up your")]',
  '//*[contains(@text, "Copy apps & data")]',
  '//*[contains(@text, "Get started")]',
  '//*[contains(@text, "Skip") and contains(@text, "setup")]',
  // Permission dialogs (generic)
  '//*[@text="Allow"]',
  '//*[@text="Deny"]',
  '//*[@text="While using the app"]',
  '//*[@text="Only this time"]',
  '//*[@text="Don\'t allow"]',
  // System alert / dialog containers
  '//android.widget.AlertDialog',
  '//android:id/alertTitle',
  '//android:id/parentPanel',
  '//android:id/button1',  // OK / Accept button
  '//android:id/button2',  // Cancel / Decline button
  // Generic "OK" button
  '//*[@text="OK"]',
  // UiSelector fallbacks
  'android=new UiSelector().text("Update")',
  'android=new UiSelector().textContains("Google Play")',
  'android=new UiSelector().textContains("Allow")',
];

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
  '//android.widget.TextView[contains(@text, "Choose your language")]',
  '//android.widget.TextView[contains(@text, "Select your language")]',
  '//*[contains(@text, "language")]',
  'id:in.amazon.mShop.android.shopping:id/language_title',
];

const ENGLISH_TILE = [
  // Priority 1: Clickable parent containing English text (handles compound views)
  '//*[@clickable="true"]//*[contains(@text, "English")]',
  // Priority 2: UiAutomator2 with contains (most flexible)
  'android=new UiSelector().textContains("English")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("English"))',
  // Priority 3: Accessibility ID
  '~English',
  '~English (India)',
  '~English – English',
  // Priority 4: Exact text match via UiAutomator2
  'android=new UiSelector().text("English")',
  'android=new UiSelector().text("English – English")',
  'android=new UiSelector().text("English (India)")',
  'android=new UiSelector().className("android.widget.TextView").text("English")',
  'android=new UiSelector().className("android.widget.RadioButton").text("English")',
  'android=new UiSelector().className("android.widget.CheckedTextView").text("English")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text("English"))',
  // Priority 5: XPath with exact class + text
  '//android.widget.RadioButton[@text="English"]',
  '//android.widget.CheckedTextView[@text="English"]',
  '//android.widget.TextView[@text="English"]',
  // Priority 6: XPath generic text match
  '//*[@text="English"]',
  '//*[@text="English – English"]',
  '//*[contains(@text, "English")]',
  // Priority 7: Resource IDs
  'id:in.amazon.mShop.android.shopping:id/language_english',
  'id:in.amazon.mShop.android.shopping:id/english_radio',
  'id:in.amazon.mShop.android.shopping:id/english_option',
  'id:in.amazon.mShop.android.shopping:id/english_language',
];

const ENGLISH_SELECTED_INDICATOR = [
  'android=new UiSelector().className("android.widget.RadioButton").text("English").selected(true)',
  'android=new UiSelector().className("android.widget.RadioButton").text("English").checked(true)',
  'android=new UiSelector().className("android.widget.CheckedTextView").text("English").checked(true)',
  '//android.widget.RadioButton[@text="English" and (@checked="true" or @selected="true")]',
  '//android.widget.CheckedTextView[@text="English" and @checked="true"]',
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
  '//android.widget.Button[@text="Continue"]',
  '//android.widget.Button[contains(@text, "Continue")]',
  '//*[@clickable="true" and contains(@text, "Continue")]',
  '//*[contains(@text, "Continue")]',
  'id:in.amazon.mShop.android.shopping:id/continue_button',
  'id:in.amazon.mShop.android.shopping:id/continue_btn',
  'id:in.amazon.mShop.android.shopping:id/continue_english_btn',
];

const SKIP_SIGNIN_BUTTON = [
  // Priority 1: Clickable elements containing skip text (handles TextView links)
  '//*[@clickable="true" and contains(@text, "Skip")]',
  '//*[@clickable="true" and contains(@text, "skip")]',
  '//*[@clickable="true" and contains(@text, "Not now")]',
  '//*[@clickable="true" and contains(@text, "Continue without")]',
  // Priority 2: UiAutomator2 scroll-into-view (handles off-screen elements)
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Skip"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Not now"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Continue without"))',
  // Priority 3: UiAutomator2 textContains (flexible matching)
  'android=new UiSelector().textContains("Skip")',
  'android=new UiSelector().textContains("Not now")',
  'android=new UiSelector().textContains("Continue without signing")',
  // Priority 4: Accessibility IDs
  '~Skip sign in',
  '~Skip',
  '~Not now',
  '~Continue without signing in',
  // Priority 5: Exact text via UiAutomator2
  'android=new UiSelector().text("Skip sign in")',
  'android=new UiSelector().text("Skip")',
  'android=new UiSelector().text("Not now")',
  'android=new UiSelector().text("Continue without signing in")',
  // Priority 6: XPath general (catches any element type with text)
  '//*[contains(@text, "Skip")]',
  '//*[contains(@text, "Not now")]',
  '//*[contains(@text, "Continue without")]',
  // Priority 7: Resource IDs
  'id:in.amazon.mShop.android.shopping:id/skip_sign_in_button',
  'id:in.amazon.mShop.android.shopping:id/skip_btn',
];

// ── Home page / dashboard indicators ──────────────────────────────────
// Used after onboarding to verify we reached the Amazon app dashboard.
const HOME_PAGE_INDICATORS = [
  'id:in.amazon.mShop.android.shopping:id/chrome_search_box',
  'id:in.amazon.mShop.android.shopping:id/rs_search_src_text',
  'android=new UiSelector().descriptionContains("Cart")',
  'android=new UiSelector().descriptionContains("cart")',
  'android=new UiSelector().textContains("Amazon")',
  '~Search',
  '//*[contains(@content-desc, "Search")]',
  '//*[contains(@content-desc, "Cart")]',
  'class name:android.webkit.WebView',
];

const SIGNIN_SCREEN_INDICATORS = [
  '~Sign-In',
  '~Sign in',
  'android=new UiSelector().textContains("Sign in")',
  'android=new UiSelector().textContains("Sign-In")',
  'android=new UiSelector().textContains("Email")',
  'android=new UiSelector().textContains("phone number")',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Sign in"))',
  'android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().textContains("Sign-In"))',
  // NOTE: //android.widget.EditText is intentionally NOT included here because
  // the Amazon HOME PAGE also has an EditText (search box), causing false
  // positive sign-in detection. We rely on text-based indicators instead.
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
      // NOTE: bare "//" prefix — no "xpath=" — so WebDriverIO auto-detects XPath
      const xpathLocators = [
        `//*[contains(text(), "${text}")]`,
        `//*[@text="${text}"]`,
        `//*[contains(@text, "${text}")]`,
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

  // Strategy 1: mobile: clickGesture (most reliable — taps element center coordinates)
  // This works even for compound views where the clickable parent is different
  // from the child element that was located (e.g., RadioButton inside LinearLayout).
  try {
    const elementId = element.elementId || element.ELEMENT;
    if (elementId) {
      await driver.execute('mobile: clickGesture', { elementId: elementId });
      logger.info(`[Android] ${label}`);
      await driver.pause(300);
      return;
    }
  } catch (err) {
    // Fall through to strategy 2
  }

  // Strategy 2: Standard element.click()
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
// Notification / overlay dismissal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dismiss the Android notification shade if it is pulled down/visible.
 * Uses the BACK key as the primary strategy, with coordinate tap as fallback.
 */
async function dismissNotificationShade(driver) {
  const shade = await findAny(driver, NOTIFICATION_SHADE, 2000);
  if (shade) {
    logger.info('[Android] Notification shade detected — dismissing via BACK key');
    // Strategy 1: Press BACK to close the shade
    try {
      await driver.pressKeyCode(4); // KEYCODE_BACK
      await driver.pause(500);
      return;
    } catch { /* fall through */ }

    // Strategy 2: Tap outside the shade (top-left corner works for most devices)
    try {
      await driver.execute('mobile: clickGesture', { x: 1, y: 100 });
      await driver.pause(500);
    } catch { /* fall through */ }
  }
}

/**
 * Dismiss common Android system dialogs (Google Play Services, permissions,
 * setup wizard, etc.) by finding and tapping their dismiss buttons.
 *
 * Handles:
 *   - Google Play Services update prompt → tap "Update" or dismiss
 *   - Permission dialogs → tap "Allow" or "Don't allow"
 *   - System alert dialogs → tap "OK"/"Cancel" or press BACK
 *   - Welcome / setup wizard → look for "Skip" or "Get started"
 *   - Any visible AlertDialog → press BACK to dismiss
 */
async function dismissSystemDialogs(driver) {
  const dialog = await findAny(driver, SYSTEM_DIALOGS, 2000);
  if (!dialog) return false;

  logger.info('[Android] System dialog detected — attempting to dismiss');

  // Strategy 1: Try tapping common dismiss buttons
  const dismissButtons = [
    '//*[@text="Skip"]',
    '//*[@text="Not now"]',
    '//*[@text="Later"]',
    '//*[@text="Cancel"]',
    '//*[@text="Dismiss"]',
    '//*[@text="Remind me later"]',
    '//*[@text="No thanks"]',
    '//*[@text="Update"]',
    '//*[@text="OK"]',
    '//android:id/button2',  // Cancel/decline button in standard AlertDialog
    '//android:id/button1',  // OK/accept button
  ];

  for (const btnLoc of dismissButtons) {
    try {
      const btns = await driver.$$(btnLoc);
      if (btns && btns.length > 0) {
        const displayed = await btns[0].isDisplayed().catch(() => false);
        if (displayed) {
          await btns[0].click();
          logger.info(`[Android] Tapped dismiss button: ${btnLoc}`);
          await driver.pause(1000);
          return true;
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 2: Press BACK key to dismiss dialog
  try {
    await driver.pressKeyCode(4); // KEYCODE_BACK
    logger.info('[Android] Pressed BACK to dismiss dialog');
    await driver.pause(1000);
    return true;
  } catch { /* fall through */ }
}

/**
 * Detect and dismiss any system notification overlays, notification shade,
 * or system dialogs that might be covering the Amazon app on a fresh
 * emulator boot.  This runs before the language-screen detection.
 *
 * Uses a short overall timeout so it does not delay normal flow.
 */
async function dismissSystemNotificationsAndOverlays(driver) {
  const deadline = Date.now() + 6000;

  while (Date.now() < deadline) {
    const dismissedShade = await dismissNotificationShade(driver);
    const dismissedDialog = await dismissSystemDialogs(driver);

    if (!dismissedShade && !dismissedDialog) {
      // No overlay found — screen is clear
      break;
    }
    await driver.pause(400);
  }

  logger.info('[Android] System notification/overlay check complete');
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

  // Strategy C: Coordinate-based tap as last resort
  // The English tile is typically the first option at the top of the language list.
  // On most 1080p+ devices, it's around (540, 350-400). Tapping by coordinates
  // works even when locators fail due to custom compound views or non-standard
  // element hierarchies.
  if (!english) {
    logger.info('[Android] All locator strategies failed — trying coordinate tap at English tile position...');
    try {
      await driver.execute('mobile: clickGesture', { x: 540, y: 380 });
      await driver.pause(1500);
      // Verify the tap worked by checking if a Continue button appeared
      const continueBtn = await findAny(driver, CONTINUE_BUTTON, 2000);
      if (continueBtn) {
        logger.info('[Android] Coordinate tap on English tile succeeded (Continue button now visible)');
        // The language was selected via coordinate tap, Continue button appeared.
        // Return early to skip tapElement below — the coordinate tap already did the job.
        logger.info('[Android] Language selected via coordinate tap.');
        await driver.pause(500);
        return; // skip the tapElement call below
      } else {
        logger.info('[Android] Coordinate tap did not reveal Continue button, trying one more position...');
        // Try tapping slightly lower (some UIs have English as the second option)
        try {
          await driver.execute('mobile: clickGesture', { x: 540, y: 450 });
          await driver.pause(1500);
          logger.info('[Android] Second coordinate tap attempted');
        } catch (_) {}
      }
    } catch (coordsErr) {
      logger.warn('[Android] Coordinate tap failed: ' + coordsErr.message);
    }
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
 * Step 6: Verify Amazon dashboard is loaded after onboarding completes.
 * Waits for common home page elements (search box, cart icon, etc.)
 * to confirm we're past all onboarding screens.
 */
async function stepVerifyDashboardLoaded(driver) {
  logger.info('[Android] Waiting for Amazon dashboard to load...');

  // Wait up to 15 seconds for any home page indicator
  const dashboardReady = await findAny(driver, HOME_PAGE_INDICATORS, 15000);

  if (!dashboardReady) {
    // Dashboard not detected — try navigating via deeplink or home action
    logger.warn('[Android] Dashboard indicators not found — attempting to navigate home...');
    try {
      // Try pressing HOME key then re-launching the Amazon app
      await driver.pressKeyCode(3); // KEYCODE_HOME
      await driver.pause(1000);
      await driver.execute('mobile: shell', [{
        command: 'am',
        args: ['start', '-n', 'in.amazon.mShop.android.shopping/com.amazon.mShop.home.HomeActivity']
      }]);
      await driver.pause(5000);
      // Check again for indicators
      const retryDashboard = await findAny(driver, HOME_PAGE_INDICATORS, 10000);
      if (!retryDashboard) {
        logger.warn('[Android] Dashboard still not confirmed — tests may fail');
      } else {
        logger.info('[Android] Dashboard loaded after navigation retry');
      }
    } catch (navErr) {
      logger.warn('[Android] Dashboard navigation retry failed: ' + navErr.message);
    }
  } else {
    logger.info('[Android] Amazon dashboard is visible');
  }

  await driver.pause(1000);
}

/**
 * Handle the Amazon first-launch onboarding flow if it is displayed.
 *
 * Before checking for the language screen, dismisses any Android system
 * notification overlays (notification shade, Google Play Services update
 * prompt, setup wizard, permission dialogs) that may have appeared on a
 * fresh emulator boot.
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

  // ── Dismiss system notification overlays before checking for language screen ──
  // This handles:
  //   - Notification shade pulled down at boot
  //   - Google Play Services update dialog
  //   - System update prompts
  //   - Permission dialogs (Allow/Deny)
  //   - Android setup wizard fragments
  //   - Any standard AlertDialog on screen
  await dismissSystemNotificationsAndOverlays(driver);

  const languageVisible = await isLanguageScreen(driver);
  if (!languageVisible) return false;

  logger.info('[Android] First launch detected.');

  await stepSelectEnglish(driver);
  await stepVerifyEnglishSelected(driver);
  await stepTapContinue(driver);
  await stepWaitLanguageScreenDismissed(driver);
  await stepSkipSignIn(driver);

  // Step 6: Verify we've reached the Amazon dashboard (home page)
  await stepVerifyDashboardLoaded(driver);

  logger.info('[Android] First-launch onboarding completed successfully.');
  return true;
}

module.exports = { handleFirstLaunchIfNeeded };
