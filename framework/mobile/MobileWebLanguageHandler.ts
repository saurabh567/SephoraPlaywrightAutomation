import logger from '../../utils/logger';
/**
 * MobileWebLanguageHandler
 *
 * Handles the Amazon mobile web language selection PAGE.
 *
 * When Amazon.in detects a mobile browser, it REDIRECTS to a full language
 * selection page (amazon.in/?language-selector=1) instead of showing the
 * home page directly. This is NOT a popup — it is a full-page redirect.
 *
 * This handler:
 *   1. Detects the language selection page by URL and page content
 *   2. Selects "English" option
 *   3. Waits for redirect back to the Amazon home page
 *   4. Verifies the home page is loaded
 *
 * Usage (from hooks.js Before hook after page creation):
 *   const MobileWebLanguageHandler = require('../framework/mobile/MobileWebLanguageHandler');
 *   await MobileWebLanguageHandler.handleIfNeeded(page, config.baseUrl);
 */


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_SELECTOR_PARAM = 'language-selector';
const ENGLISH_TEXT = 'English';
const LOG_PREFIX = '[MobileWebLanguage]';

// Timeouts (ms)
const NAVIGATION_TIMEOUT = 30000;
const LANGUAGE_PAGE_WAIT = 5000;
const REDIRECT_WAIT = 15000;
const HOME_PAGE_WAIT = 10000;
const POST_CLICK_PAUSE = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the current page is the Amazon language selection page.
 * Detects by URL (language-selector param) and page heading.
 */
async function isLanguageSelectionPage(page: any) {
  const currentUrl = page.url();
  if (currentUrl.includes(LANGUAGE_SELECTOR_PARAM)) {
    logger.info(`${LOG_PREFIX} Detected language selection page via URL: ${currentUrl}`);
    return true;
  }

  // Check page heading text
  try {
    const headingVisible = await page.getByText(/choose your language/i).first().isVisible({
      timeout: LANGUAGE_PAGE_WAIT
    }).catch(() => false);
    if (headingVisible) {
      logger.info(`${LOG_PREFIX} Detected language selection page via heading text`);
      return true;
    }
  } catch {
    // Not found — not the language page
  }

  return false;
}

/**
 * Check if the current page is the Amazon home page (not language page).
 */
async function isAmazonHomePage(page: any) {
  const currentUrl = page.url();
  // Home page URL patterns: amazon.in, amazon.in/, amazon.in/?ref_=...
  const isHomeUrl = /amazon\.in(\/|(\/.*)?$)/.test(currentUrl) &&
    !currentUrl.includes(LANGUAGE_SELECTOR_PARAM);

  if (!isHomeUrl) return false;

  // Verify page has loaded with visible content
  try {
    const bodyVisible = await page.locator('body').isVisible({ timeout: 3000 });
    return bodyVisible;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Language selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find and click the "English" language option on the language page.
 * Tries multiple selector strategies.
 */
async function selectEnglishOption(page: any) {
  logger.info(`${LOG_PREFIX} Looking for "English" language option...`);

  // Strategy 1: Locate by aria-label or role
  const englishSelector = page.locator([
    `a:has-text("${ENGLISH_TEXT}")`,
    `button:has-text("${ENGLISH_TEXT}")`,
    `span:has-text("${ENGLISH_TEXT}")`,
    `div:has-text("${ENGLISH_TEXT}")`,
    `[aria-label*="${ENGLISH_TEXT}"]`,
    `[aria-labelledby*="${ENGLISH_TEXT}"]`,
    `label:has-text("${ENGLISH_TEXT}")`,
    // Radio button or checkbox styled options
    `input[type="radio"][value*="english" i]`,
    `input[type="radio"] + span:has-text("${ENGLISH_TEXT}")`,
    // Links with language query params
    `a[href*="language" i]`,
    `a[href*="en" i]`,
    // Generic fallback
    `text="${ENGLISH_TEXT}"`,
  ].join(',')).first();

  try {
    await englishSelector.waitFor({ state: 'visible', timeout: 5000 });
    await englishSelector.click();
    logger.info(`${LOG_PREFIX} Clicked "English" language option`);
    await page.waitForTimeout(POST_CLICK_PAUSE);
    return true;
  } catch (err: any) {
    logger.warn(`${LOG_PREFIX} First-click strategy failed: ${err.message}`);
  }

  // Strategy 2: Broader text match — find ANY element containing "English"
  try {
    const allEnglish = page.locator(`:has-text("${ENGLISH_TEXT}")`).first();
    await allEnglish.waitFor({ state: 'visible', timeout: 3000 });
    await allEnglish.click();
    logger.info(`${LOG_PREFIX} Clicked element containing "English"`);
    await page.waitForTimeout(POST_CLICK_PAUSE);
    return true;
  } catch (err: any) {
    logger.warn(`${LOG_PREFIX} Broad text-match strategy failed: ${err.message}`);
  }

  // Strategy 3: Get all clickable elements, find the one with English text
  try {
    const allLinks = page.locator('a, button, [role="button"], [role="link"], [role="radio"], label');
    const count = await allLinks.count();
    for (let i = 0; i < count; i++) {
      const el = allLinks.nth(i);
      const text = await el.textContent().catch(() => '');
      if (text && text.trim().toLowerCase() === 'english') {
        await el.click();
        logger.info(`${LOG_PREFIX} Clicked English option via exhaustive search`);
        await page.waitForTimeout(POST_CLICK_PAUSE);
        return true;
      }
    }
  } catch (err: any) {
    logger.warn(`${LOG_PREFIX} Exhaustive search failed: ${err.message}`);
  }

  return false;
}

/**
 * Wait for redirect from language page back to Amazon home page.
 */
async function waitForRedirectToHomePage(page: any) {
  logger.info(`${LOG_PREFIX} Waiting for redirect to Amazon home page...`);

  try {
    await page.waitForURL(/amazon\.in(\/|$)/, {
      timeout: REDIRECT_WAIT
    });
    logger.info(`${LOG_PREFIX} Redirected to Amazon home page`);
    return true;
  } catch (err: any) {
    logger.warn(`${LOG_PREFIX} URL redirect wait timed out: ${err.message}`);
    // Try waiting for load state instead
    try {
      await page.waitForLoadState('networkidle', { timeout: REDIRECT_WAIT });
      logger.info(`${LOG_PREFIX} Page load state reached`);
      return true;
    } catch {
      logger.error(`${LOG_PREFIX} Page did not settle after language selection`);
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the mobile web language selection page if present.
 *
 * Call this from the Before hook AFTER creating the page, BEFORE executing
 * any step definitions. This method navigates to the base URL, checks for
 * the language page, handles it, and waits for the home page to load.
 *
 * If no language page is detected, returns false immediately (no-op).
 *
 * @param {object} page - Playwright Page instance
 * @param {string} baseUrl - Amazon base URL (e.g. https://www.amazon.in)
 * @returns {Promise<boolean>} - true if language page was handled, false otherwise
 */
async function handleIfNeeded(page: any, baseUrl: any) {
  if (!page || !baseUrl) {
    logger.warn(`${LOG_PREFIX} Missing page or baseUrl — skipping`);
    return false;
  }

  logger.info(`${LOG_PREFIX} Checking for language selection page...`);

  // Step 1: Navigate to Amazon
  try {
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT
    });
    logger.info(`${LOG_PREFIX} Navigated to ${baseUrl}`);
  } catch (err: any) {
    logger.warn(`${LOG_PREFIX} Initial navigation failed: ${err.message}`);
    // Try once more
    try {
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT
      });
    } catch (err2: any) {
      logger.error(`${LOG_PREFIX} Second navigation also failed: ${err2.message}`);
      return false;
    }
  }

  // Small pause to let any redirects (language page) settle
  await page.waitForTimeout(1500);

  // Step 2: Check if we're on the language selection page
  const isLanguagePage = await isLanguageSelectionPage(page);
  if (!isLanguagePage) {
    logger.info(`${LOG_PREFIX} Not on language selection page — no action needed`);
    return false;
  }

  logger.info(`${LOG_PREFIX} Language selection page detected — handling...`);

  // Step 3: Select English
  const selected = await selectEnglishOption(page);
  if (!selected) {
    logger.error(`${LOG_PREFIX} Could not find or click English option`);
    // Take a screenshot for debugging
    try {
      const screenshotDir = require('path').join(process.cwd(), 'reports', 'screenshots');
      require('fs-extra').ensureDirSync(screenshotDir);
      await page.screenshot({
        path: require('path').join(screenshotDir, 'mobile-language-page-failure.png'),
        fullPage: true
      });
    } catch {
      // ignore screenshot errors
    }
    throw new Error(`${LOG_PREFIX} FAILED: Could not select English on language selection page`);
  }

  // Step 4: Wait for redirect to home page
  const redirected = await waitForRedirectToHomePage(page);
  if (!redirected) {
    logger.warn(`${LOG_PREFIX} Redirect may not have completed — continuing`);
  }

  // Step 5: Verify we're on the home page
  const onHomePage = await isAmazonHomePage(page);
  if (!onHomePage) {
    logger.warn(`${LOG_PREFIX} May not be on home page after language selection (URL: ${page.url()})`);
    // Wait a bit more
    await page.waitForTimeout(3000);
  }

  // Wait for page to be fully interactive
  try {
    await page.waitForLoadState('networkidle', { timeout: HOME_PAGE_WAIT });
  } catch {
    // Non-critical
  }

  logger.info(`${LOG_PREFIX} Language page handling complete`);
  return true;
}

export { handleIfNeeded };
export default { handleIfNeeded: handleIfNeeded };
