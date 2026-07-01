/**
 * Step definition for "I select the language" — resilient Amazon language selector.
 *
 * WEB-ONLY step. Automatically skipped for mobile (iOS/Android) execution.
 *
 * Amazon.in presents the language selector in two forms:
 *   1. Home page: An "EN" / flag link in the top nav bar (class icp-link-style-2)
 *      that either opens a flyout (#nav-flyout-icp) or links directly to the
 *      customer preferences page.
 *   2. Preferences page (/customer-preferences/edit): Radio buttons (name="lop")
 *      with language codes (en_IN, hi_IN, ta_IN, ...) plus a Save Changes button.
 *
 * This step tries multiple strategies with fallback:
 *   A — If already on the preferences page, click the target radio + Save.
 *   B — Click the "EN" nav link to navigate to preferences, then retry A.
 *   C — Navigate directly to the preferences URL, then retry A.
 *   D — Look for visible language links on the page and click matching text.
 *   E — Last-resort scroll to footer language selector and use dropdown.
 *
 * Usage in feature files:
 *   When I select the language "English"
 *   When I select the language "हिन्दी"
 *   When I select the language "HI"
 */

const { When } = require('@cucumber/cucumber');
const logger = require('../utils/logger');
const config = require('../config/env.config');
const { TEST_PLATFORMS } = require('../framework/common/platforms');

const LOG_PREFIX = '[LanguageStep]';

// ─────────────────────────────────────────────────────────────────────────────
// Language code mapping (lop radio values on preferences page)
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_CODES = {
  'english': 'en_IN',
  'en': 'en_IN',
  'eng': 'en_IN',
  'हिन्दी': 'hi_IN',
  'hindi': 'hi_IN',
  'hi': 'hi_IN',
  'தமிழ்': 'ta_IN',
  'tamil': 'ta_IN',
  'ta': 'ta_IN',
  'తెలుగు': 'te_IN',
  'telugu': 'te_IN',
  'te': 'te_IN',
  'ಕನ್ನಡ': 'kn_IN',
  'kannada': 'kn_IN',
  'kn': 'kn_IN',
  'മലയാളം': 'ml_IN',
  'malayalam': 'ml_IN',
  'ml': 'ml_IN',
  'বাংলা': 'bn_IN',
  'bengali': 'bn_IN',
  'bn': 'bn_IN',
  'मराठी': 'mr_IN',
  'marathi': 'mr_IN',
  'mr': 'mr_IN',
  'ગુજરાતી': 'gu_IN',
  'gujarati': 'gu_IN',
  'gu': 'gu_IN',
  'ଓଡ଼ିଆ': 'or_IN',
  'odia': 'or_IN',
  'or': 'or_IN',
  'ਪੰਜਾਬੀ': 'pa_IN',
  'punjabi': 'pa_IN',
  'pa': 'pa_IN',
};

// ─────────────────────────────────────────────────────────────────────────────
// Text patterns for each language (appears in the preferences page labels)
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_TEXT_PATTERNS = {
  'en_IN': [/english/i, /^EN$/],
  'hi_IN': [/हिन्दी/i, /hindi/i, /^HI$/],
  'ta_IN': [/தமிழ்/i, /tamil/i, /^TA$/],
  'te_IN': [/తెలుగు/i, /telugu/i, /^TE$/],
  'kn_IN': [/ಕನ್ನಡ/i, /kannada/i, /^KN$/],
  'ml_IN': [/മലയാളം/i, /malayalam/i, /^ML$/],
  'bn_IN': [/বাংলা/i, /bengali/i, /^BN$/],
  'mr_IN': [/मराठी/i, /marathi/i, /^MR$/],
};

// ─────────────────────────────────────────────────────────────────────────────
// Selectors used across strategies
// ─────────────────────────────────────────────────────────────────────────────

const SELECTORS = {
  // Home page language trigger in the top nav bar
  navLanguageLink: [
    'a.icp-link-style-2',
    'a[aria-label*="language" i]',
    'a[href*="customer-preferences"][href*="language"]',
    '#nav-icp a',
    'a.nav-a.nav-a-2.icp-link-style-2',
  ].join(','),

  // Flyout language links (appears on hover over nav language trigger)
  flyoutLanguageLink: [
    '#nav-flyout-icp a[href*="customer-preferences"]',
    '.nav-lang-link',
    '.icp-language-link',
    '#nav-flyout-icp a',
  ].join(','),

  // Preferences page radio button name attribute
  languageRadio: 'input[name="lop"]',

  // Save Changes button on preferences page
  saveButton: [
    'input[name="submit-preferences"]',
    'input[value="Save Changes"]',
    'span input[type="submit"]',
    'form[action*="customer-preferences"] input[type="submit"]',
    'span:has-text("Save Changes") input',
    'input[aria-label*="save" i]',
    'button:has-text("Save Changes")',
  ].join(','),

  // Cancel button on preferences page
  cancelButton: 'span:has-text("Cancel")',

  // Footer language area (last resort)
  footerLanguage: '#icp-language-settings, [id*="icp-language"], select[name="language"]',

  // Generic: any visible element containing language
  anyVisibleLanguage: [
    'a[href*="language" i]',
    'a[href*="icp" i]',
    '[aria-label*="language" i]',
    '[aria-label*="Language" i]',
  ].join(','),
};

const PREFERENCES_URL = '/customer-preferences/edit?ie=UTF8&preferencesReturnUrl=%2F&ref_=topnav_lang';
const SHORT_TIMEOUT = 5000;
const MEDIUM_TIMEOUT = 10000;
const CLICK_PAUSE = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied language name to its lop code (e.g. "HI" → "hi_IN").
 * Falls back to lower-casing the input and checking LANGUAGE_CODES.
 */
function resolveLanguageCode(language) {
  const cleaned = language.trim().toLowerCase();

  // Direct match in lookup table
  if (LANGUAGE_CODES[cleaned]) {
    return LANGUAGE_CODES[cleaned];
  }

  // Case-insensitive key search
  for (const [key, code] of Object.entries(LANGUAGE_CODES)) {
    if (key.toLowerCase() === cleaned) {
      return code;
    }
  }

  return null;
}

/**
 * Check whether the current page is the Amazon language preferences page.
 */
async function isOnPreferencesPage(page) {
  const url = page.url();
  return url.includes('customer-preferences/edit');
}

/**
 * Check whether the current page is the Amazon home page.
 */
async function isOnHomePage(page) {
  const url = page.url();
  return /amazon\.in(\/|(\/.*)?$)/.test(url) && !url.includes('customer-preferences');
}

/**
 * Wait briefly for the page to settle after navigation.
 */
async function settle(page, ms) {
  await page.waitForTimeout(ms || CLICK_PAUSE);
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: MEDIUM_TIMEOUT });
  } catch {
    // Non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy A: Select language radio on the preferences page and save
// ─────────────────────────────────────────────────────────────────────────────

async function strategySelectOnPreferencesPage(page, languageCode) {
  logger.info(`${LOG_PREFIX} Strategy A: Selecting language radio "${languageCode}" on preferences page`);

  // Locate the radio button
  const radio = page.locator(`${SELECTORS.languageRadio}[value="${languageCode}"]`).first();
  const radioVisible = await radio.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);

  if (!radioVisible) {
    logger.warn(`${LOG_PREFIX} Strategy A: Radio for "${languageCode}" not visible`);
    return false;
  }

  // Click the radio
  await radio.click({ force: true });
  logger.info(`${LOG_PREFIX} Strategy A: Radio "${languageCode}" clicked`);
  await settle(page);

  // Click Save Changes
  const save = page.locator(SELECTORS.saveButton).first();
  const saveVisible = await save.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);
  if (!saveVisible) {
    // Try submitting the form directly
    const formSubmitted = await page.evaluate(() => {
      const form = document.querySelector('form[action*="customer-preferences"]');
      if (form) { form.submit(); return true; }
      return false;
    }).catch(() => false);

    if (!formSubmitted) {
      logger.warn(`${LOG_PREFIX} Strategy A: Save button not found, and form submit failed`);
      return false;
    }
    logger.info(`${LOG_PREFIX} Strategy A: Form submitted via JS`);
  } else {
    await save.click();
    logger.info(`${LOG_PREFIX} Strategy A: Save Changes clicked`);
  }

  await settle(page, 3000);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy B: Click the "EN" nav language link to navigate to preferences
// ─────────────────────────────────────────────────────────────────────────────

async function strategyClickNavLanguageLink(page, languageCode) {
  logger.info(`${LOG_PREFIX} Strategy B: Clicking nav language link`);

  const link = page.locator(SELECTORS.navLanguageLink).first();
  const linkVisible = await link.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);

  if (!linkVisible) {
    logger.warn(`${LOG_PREFIX} Strategy B: Nav language link not visible`);
    return false;
  }

  // Click the link — this should navigate to the preferences page
  await link.click();
  logger.info(`${LOG_PREFIX} Strategy B: Nav language link clicked`);
  await settle(page, 2000);

  // Check if we navigated to preferences
  if (await isOnPreferencesPage(page)) {
    logger.info(`${LOG_PREFIX} Strategy B: Navigated to preferences page`);
    return strategySelectOnPreferencesPage(page, languageCode);
  }

  // Check if a flyout appeared instead of navigation
  const flyoutLink = page.locator(SELECTORS.flyoutLanguageLink).first();
  const flyoutVisible = await flyoutLink.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);

  if (flyoutVisible) {
    logger.info(`${LOG_PREFIX} Strategy B: Flyout appeared, clicking language link inside`);
    await flyoutLink.click();
    await settle(page, 2000);
    if (await isOnPreferencesPage(page)) {
      return strategySelectOnPreferencesPage(page, languageCode);
    }
  }

  // If we got redirected to home, try navigating directly
  logger.warn(`${LOG_PREFIX} Strategy B: Did not reach preferences page`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy C: Navigate directly to the customer preferences page
// ─────────────────────────────────────────────────────────────────────────────

async function strategyDirectNavigate(page, languageCode) {
  logger.info(`${LOG_PREFIX} Strategy C: Direct navigating to preferences page`);

  try {
    await page.goto(`${config.baseUrl}${PREFERENCES_URL}`, {
      waitUntil: 'domcontentloaded',
      timeout: MEDIUM_TIMEOUT,
    });
  } catch (err) {
    logger.warn(`${LOG_PREFIX} Strategy C: Navigation failed: ${err.message}`);
    return false;
  }

  await settle(page, 2000);

  if (!(await isOnPreferencesPage(page))) {
    logger.warn(`${LOG_PREFIX} Strategy C: Not on preferences page after navigation`);
    return false;
  }

  logger.info(`${LOG_PREFIX} Strategy C: On preferences page`);
  return strategySelectOnPreferencesPage(page, languageCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy D: Find any visible element with matching language text and click it
// ─────────────────────────────────────────────────────────────────────────────

async function strategyTextMatch(page, language) {
  logger.info(`${LOG_PREFIX} Strategy D: Looking for language text match for "${language}"`);

  const languageLower = language.trim().toLowerCase();
  const textPatterns = [
    new RegExp(languageLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    new RegExp(`^${languageLower}$`, 'i'),
  ];

  // Search clickable elements for matching text
  const clickableSelectors = 'a, button, span[role="button"], [role="radio"], label, div[role="link"]';
  const elements = page.locator(clickableSelectors);
  const count = await elements.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const el = elements.nth(i);
    const text = await el.textContent().catch(() => '');
    const trimmed = (text || '').trim();

    if (textPatterns.some((p) => p.test(trimmed)) || LANGUAGE_CODES[trimmed.toLowerCase()]) {
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        logger.info(`${LOG_PREFIX} Strategy D: Found matching element with text "${trimmed}"`);
        await el.click();
        await settle(page, 2000);
        return true;
      }
    }
  }

  logger.warn(`${LOG_PREFIX} Strategy D: No matching visible element found`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy E: Last resort — scroll to footer, find language dropdown/selector
// ─────────────────────────────────────────────────────────────────────────────

async function strategyFooterSelector(page, language) {
  logger.info(`${LOG_PREFIX} Strategy E: Trying footer language selector`);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle(page, 1000);

  // Try to find a language select/dropdown
  const select = page.locator('select[name*="language" i], select[id*="language" i], select[id*="icp" i]').first();
  const selectVisible = await select.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);

  if (selectVisible) {
    const languageCode = resolveLanguageCode(language);
    if (languageCode) {
      await select.selectOption(languageCode);
      logger.info(`${LOG_PREFIX} Strategy E: Selected "${languageCode}" in dropdown`);
      await settle(page, 2000);
      return true;
    }
  }

  // Try clicking any visible language link in the footer
  const footerLink = page.locator('#navFooter a[href*="language" i], footer a[href*="language" i]').first();
  const footerLinkVisible = await footerLink.isVisible({ timeout: SHORT_TIMEOUT }).catch(() => false);

  if (footerLinkVisible) {
    logger.info(`${LOG_PREFIX} Strategy E: Found footer language link`);
    await footerLink.click();
    await settle(page, 3000);
    if (await isOnPreferencesPage(page)) {
      const languageCode = resolveLanguageCode(language);
      if (languageCode) {
        return strategySelectOnPreferencesPage(page, languageCode);
      }
    }
    return true;
  }

  logger.warn(`${LOG_PREFIX} Strategy E: No footer language selector found`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestration: try strategies in order
// ─────────────────────────────────────────────────────────────────────────────

async function selectLanguage(page, language) {
  logger.info(`${LOG_PREFIX} Selecting language: "${language}"`);

  // Resolve the language to a lop code
  const languageCode = resolveLanguageCode(language);
  if (!languageCode) {
    logger.warn(`${LOG_PREFIX} Unknown language "${language}", will try text matching`);
  }

  // Strategy order:
  //   1. If already on preferences page, select radio + save directly
  //   2. Click nav language link → select radio + save
  //   3. Navigate directly to preferences URL → select radio + save
  //   4. Text-match any visible language element
  //   5. Footer dropdown / selector

  // Strategy A: Already on preferences page
  if (await isOnPreferencesPage(page)) {
    const done = await strategySelectOnPreferencesPage(page, languageCode);
    if (done) return true;
  }

  // Strategy B: Click the nav EN link
  if (await isOnHomePage(page)) {
    const done = await strategyClickNavLanguageLink(page, languageCode);
    if (done) return true;
  }

  // Strategy C: Direct navigate to preferences
  const doneC = await strategyDirectNavigate(page, languageCode);
  if (doneC) return true;

  // Strategy D: Text match any visible element
  const doneD = await strategyTextMatch(page, language);
  if (doneD) return true;

  // Strategy E: Footer selector (last resort)
  const doneE = await strategyFooterSelector(page, language);
  if (doneE) return true;

  logger.error(`${LOG_PREFIX} All strategies exhausted — could not select language "${language}"`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step definition — WEB-ONLY
// ─────────────────────────────────────────────────────────────────────────────

When('I select the language {string}', async function (language) {
  // Guard: skip if running on mobile (iOS/Android)
  const isMobilePlatform =
    this.platform === TEST_PLATFORMS.IOS || this.platform === TEST_PLATFORMS.ANDROID;
  if (isMobilePlatform) {
    logger.info(`${LOG_PREFIX} Skipping language selection on mobile platform: ${this.platform}`);
    return;
  }

  // Guard: verify we have a real Playwright page (not an Appium driver)
  const isPlaywrightPage = this.page && typeof this.page.locator === 'function' && typeof this.page.url === 'function';
  if (!isPlaywrightPage) {
    throw new Error(
      `${LOG_PREFIX} This step requires a Playwright page (web only). ` +
      `Current platform: ${this.platform || 'unknown'}. ` +
      `Use this step only in web test scenarios.`
    );
  }

  const success = await selectLanguage(this.page, language);

  if (!success) {
    // Take a diagnostic screenshot using Playwright API
    try {
      const fs = require('fs-extra');
      const path = require('path');
      const screenshotDir = path.join(config.reportDir, 'screenshots');
      fs.ensureDirSync(screenshotDir);
      await this.page.screenshot({
        path: path.join(screenshotDir, 'language-selector-failure.png'),
        fullPage: true,
      });
      logger.error(`${LOG_PREFIX} Diagnostic screenshot saved to language-selector-failure.png`);
    } catch {
      // Ignore screenshot errors
    }

    throw new Error(
      `${LOG_PREFIX} FAILED: Could not select language "${language}". ` +
      `Tried all 5 strategies (preferences radio, nav link, direct navigate, text match, footer selector).`
    );
  }

  logger.info(`${LOG_PREFIX} Language "${language}" selected successfully`);
});
