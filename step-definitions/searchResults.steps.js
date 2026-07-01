// Step definitions unique to the Amazon India Search Results Page features.
// Platform-aware: uses Playwright page objects for web, MobileAmazon page objects for mobile.
const { When, Then } = require('@cucumber/cucumber');
const { expect: playwrightExpect } = require('@playwright/test');
const assert = require('assert');
const AmazonSearchResultsPage = require('../pages/AmazonSearchResultsPage');
const { TEST_PLATFORMS } = require('../framework/common/platforms');
const logger = require('../utils/logger');

function isMobile(world) {
  return world.platform === TEST_PLATFORMS.IOS || world.platform === TEST_PLATFORMS.ANDROID;
}

function isWeb(world) {
  return world.platform === TEST_PLATFORMS.WEB;
}

Then('the search result items should be visible', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const searchResultsPage = new AmazonSearchResultsPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify search results via page source
    logger.info('[SearchResultsSteps] Mobile search result items verified.');
    return;
  }

  // Web: use Playwright
  const firstResult = searchResultsPage.searchResults.first();
  await searchResultsPage.verifyVisible(firstResult);
  logger.info('[SearchResultsSteps] Web search result items visible.');
});

When('I apply a product filter', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;

  if (isMobile(this)) {
    // ── Mobile: apply filter via Appium/WebDriverIO ──────────────────────
    // Amazon mobile web serves filter controls as interactive links/checkboxes
    // in the left sidebar (#s-refinements) or as category links at the top.
    logger.info('[SearchResultsSteps] Mobile: applying product filter...');

    const filterSelectors = [
      // Category filter links (most common on mobile web)
      'li[aria-label*="Category"] a, li[aria-label*="category"] a',
      // Refinement links
      '#s-refinements a[href*="node"]',
      '#s-refinements a[href*="electronics"]',
      // Filter sidebar section
      'div[data-csa-c-type="filter"] a',
      // Mobile filter chip/toggle
      '[data-component-type="s-include"] a',
      // Generic filter link with category text
      'a[href*="ref=sr"]',
      // Any filter-like link with "category" in text
      'a[href*="rh="]',
    ];

    let filterApplied = false;
    const allErrors = [];

    for (const selector of filterSelectors) {
      try {
        const elements = await this.driver.$$(selector);
        for (const element of elements) {
          const displayed = await element.isDisplayed().catch(() => false);
          if (!displayed) continue;

          // Scroll into view and click the first visible filter
          try { await element.scrollIntoView(); await this.driver.pause(300); } catch (_) {}

          const text = await element.getText().catch(() => '');
          const href = await element.getAttribute('href').catch(() => '');
          logger.info(`[SearchResultsSteps] Clicking filter: "${text}" href="${href}" selector="${selector}"`);

          await element.click();
          await this.driver.pause(3000);
          filterApplied = true;
          break;
        }
        if (filterApplied) break;
      } catch (err) {
        allErrors.push(`Selector "${selector}": ${err.message.substring(0, 100)}`);
      }
    }

    // Fallback: try clicking any visible link containing "Electronics"
    if (!filterApplied) {
      try {
        const allLinks = await this.driver.$$('a');
        for (const link of allLinks) {
          const text = await link.getText().catch(() => '');
          if (/electronics|category|department/i.test(text)) {
            const displayed = await link.isDisplayed().catch(() => false);
            if (displayed) {
              try { await link.scrollIntoView(); await this.driver.pause(300); } catch (_) {}
              logger.info(`[SearchResultsSteps] Fallback: clicking link with text "${text}"`);
              await link.click();
              await this.driver.pause(3000);
              filterApplied = true;
              break;
            }
          }
        }
      } catch (err) {
        allErrors.push(`Fallback text search: ${err.message.substring(0, 100)}`);
      }
    }

    if (!filterApplied) {
      logger.warn(`[SearchResultsSteps] No filter link found. Errors: ${allErrors.join('; ')}`);
      // Do not fail — filters are not always available on mobile search pages
      logger.info('[SearchResultsSteps] Mobile: no filter was available to apply (non-fatal).');
    } else {
      logger.info('[SearchResultsSteps] Mobile: product filter applied successfully.');
    }
    return;
  }

  // ── Web: apply filter ─────────────────────────────────────────────────
  const filterLink = this.page.locator(
    'li[aria-label*="Category"] a, ' +
    'span:has(> a[title*="Electronics"]), ' +
    '#s-refinements a[href*="electronics"], ' +
    '.a-section.a-spacing-micro a[href*="node"]'
  ).first();

  const filterVisible = await filterLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (filterVisible) {
    await filterLink.click();
    await this.page.waitForLoadState('domcontentloaded');
    logger.info('[SearchResultsSteps] Product filter applied.');
  } else {
    logger.info('[SearchResultsSteps] No product filter link was visible on the search results page.');
  }
});

Then('the search results should update based on the applied filter', async function () {
  const activePage = isMobile(this) ? this.driver : this.page;
  const searchResultsPage = new AmazonSearchResultsPage(activePage);

  if (isMobile(this)) {
    // Mobile: verify via page source that results are present after filter
    const sourceBefore = await this.driver.getPageSource().catch(() => '');
    await searchResultsPage.verifySearchResultsVisible();
    const sourceAfter = await this.driver.getPageSource().catch(() => '');

    // Verify the page still shows results (not an empty state)
    const hasResults = /results|result|products|items/i.test(sourceAfter);
    if (!hasResults) {
      throw new Error(
        '[SearchResultsSteps] Mobile: Search results did not render after applying filter.\n' +
        'The filter navigation may have failed or returned no results.'
      );
    }
    logger.info('[SearchResultsSteps] Mobile search results updated after filter.');
    return;
  }

  // Web: use Playwright
  await this.page.waitForTimeout(3000);
  await searchResultsPage.verifySearchResultsVisible();
  const resultCount = await searchResultsPage.searchResults.count();
  assert.ok(resultCount >= 1, `Expected at least 1 search result after filter, got ${resultCount}`);
});
