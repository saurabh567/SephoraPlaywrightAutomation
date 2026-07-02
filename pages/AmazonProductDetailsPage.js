// Amazon India product details page locators and actions.
// Auto-detects Playwright (web) vs WebDriverIO (mobile) driver.
// For iOS Safari, delegates to AmazonIOSSafariPage which uses WebView CSS selectors.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonProductDetailsPage = require('./MobileAmazonProductDetailsPage');
const AmazonIOSSafariPage = require('../mobile/ios/AmazonIOSSafariPage');
const config = require('../config/env.config');
const logger = require("../utils/logger");
const { TEST_PLATFORMS } = require('../framework/common/platforms');

class AmazonProductDetailsPage {
  constructor(page) {
    // Detect mobile driver (WebDriverIO) vs Playwright page
    if (page && typeof page.locator !== 'function') {
      // ── iOS Safari: delegate to AmazonIOSSafariPage ──
      const isIOS = config.testPlatform === TEST_PLATFORMS.IOS;
      const isSafari = String(config.mobile.browserName || '').toLowerCase() === 'safari';

      if (isIOS && isSafari) {
        this._iosSafari = new AmazonIOSSafariPage(page);
        this.page = page;

        // Map methods to match MobileAmazonProductDetailsPage interface
        this.openProductPage = async (productUrl) => {
          await this._iosSafari.openUrlAndWaitForAmazon(
            productUrl || config.baseUrl,
            'product page'
          );
        };

        this.selectQuantity = async (quantity) => {
          // Amazon mobile web quantity dropdown selector
          const qtySelectors = [
            '#quantity',
            'select[name="quantity"]',
            'select[id*="quantity"]',
            '.a-button-dropdown[aria-label*="Quantity"]',
            'span[data-action="a-dropdown-button"]',
          ];
          let qtyFound = false;
          for (const sel of qtySelectors) {
            try {
              const els = await page.$$(sel);
              for (const el of els) {
                if (await el.isDisplayed().catch(() => false)) {
                  await el.click();
                  await page.pause(500);
                  // Try selecting option by value
                  const optValue = await page.$(sel + ' option[value="' + quantity + '"]');
                  if (optValue && await optValue.isDisplayed().catch(() => false)) {
                    await optValue.click();
                    await page.pause(500);
                    qtyFound = true;
                    break;
                  }
                  // Fallback: try all options and find by text
                  const allOpts = await page.$$(sel + ' option');
                  for (const opt of allOpts) {
                    const text = await opt.getText().catch(() => '');
                    if (text.includes(String(quantity))) {
                      await opt.click();
                      await page.pause(500);
                      qtyFound = true;
                      break;
                    }
                  }
                  if (qtyFound) break;
                }
              }
            } catch (_) {}
            if (qtyFound) break;
          }
          if (!qtyFound) {
            logger.warn('[AmazonProductDetailsPage] iOS Safari: Quantity selector not found for value ' + quantity);
          }
        };

        this.addToCartIfAvailable = () =>
          this._iosSafari.addToCartIfAvailable();

        this.openCartFromHeader = () =>
          this._iosSafari.openCartPage();

        this.verifyProductDetailsVisible = async () => {
          // AmazonIOSSafariPage does not have a dedicated verifyProductDetailsVisible method.
          // Use page source check for product page indicators instead.
          const source = await this.page.getPageSource().catch(() => '');
          const productPattern = /add to cart|buy now|productTitle|buybox|merchant-info|#dp|deal of the day|offer expires|available from these sellers|other sellers on amazon/i;
          if (!productPattern.test(source)) {
            // Fallback: wait a moment and try URL check
            await this.page.pause(2000);
            const currentUrl = await this.page.getUrl().catch(() => '');
            const isProductUrl = /\/dp\/|\/gp\/product\/|\/product\//i.test(currentUrl);
            if (!isProductUrl) {
              throw new Error('[AmazonProductDetailsPage] Product details page not visible on iOS Safari');
            }
          }
        };

        return;
      }

      // ── Android / iOS App: use MobileAmazonProductDetailsPage ──
      this._mobile = new MobileAmazonProductDetailsPage(page);
      this.page = page;
      return;
    }

    // Playwright mode
    this.__base = new BasePage(page);
    const bp = Object.getOwnPropertyNames(BasePage.prototype);
    for (const key of bp) {
      if (key !== 'constructor' && typeof this.__base[key] === 'function') {
        this[key] = this.__base[key].bind(this.__base);
      }
    }

    this.page = page;
    this.productTitle = page.locator('#productTitle').first();
    this.price = page.locator('.a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen').first();
    this.rating = page.locator('#acrPopover, span[data-hook="rating-out-of-text"]').first();
    this.quantityDropdown = page.locator('#quantity').first();
    this.addToCartButton = page.locator('#add-to-cart-button').first();
    this.buyNowButton = page.locator('#buy-now-button').first();
    this.cartConfirmation = page.getByText(/added to cart|added to basket/i).first();
    this.cartLink = page.locator('#nav-cart').first();
  }

  async openProductPage(productUrl) {
    if (this._mobile) return this._mobile.openProductPage(productUrl);
    await this.__base.open(productUrl || '/s?k=laptop');
  }

  async selectQuantity(quantity) {
    if (this._mobile) return this._mobile.selectQuantity(quantity);
    const visible = await this.quantityDropdown.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await this.quantityDropdown.selectOption(String(quantity));
    }
  }

  async addToCartIfAvailable() {
    if (this._mobile) return this._mobile.addToCartIfAvailable();
    const canAddToCart = await this.addToCartButton.isVisible({ timeout: 10000 }).catch(() => false);
    if (!canAddToCart) {
      return false;
    }
    await this.addToCartButton.click();
    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
    return true;
  }

  async openCartFromHeader() {
    if (this._mobile) return this._mobile.openCartFromHeader();
    await this.cartLink.click();
  }

  async verifyProductDetailsVisible() {
    if (this._mobile) return this._mobile.verifyProductDetailsVisible();
    await expect(this.productTitle).toBeVisible({ timeout: 60000 });
  }
}

module.exports = AmazonProductDetailsPage;
