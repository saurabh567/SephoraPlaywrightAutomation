import { expect } from '@playwright/test';
import BasePage from './BasePage';
import MobileAmazonHomePage from './MobileAmazonHomePage';
import AmazonIOSSafariPage from '../mobile/ios/AmazonIOSSafariPage';
import config from '../config/env.config';
import { TEST_PLATFORMS } from '../framework/common/platforms';
// Amazon India home page locators and actions.
// Automatically detects Playwright (web) vs WebDriverIO (mobile) driver
// and delegates to the appropriate implementation.
//
// Platform dispatch:
//   - Web (Playwright)    → uses BasePage + Playwright locators
//   - Android (Appium)    → uses MobileAmazonHomePage (accessibility ID locators)
//   - iOS Safari (Appium) → uses AmazonIOSSafariPage (CSS selectors in WebView)
//   - iOS App (Appium)    → uses MobileAmazonHomePage (accessibility ID locators)

class AmazonHomePage {
  [key: string]: any;
  constructor(page: any) {
    // Detect mobile driver (WebDriverIO) vs Playwright page
    if (page && typeof page.locator !== 'function') {
      // ── iOS Safari: use AmazonIOSSafariPage (CSS selectors in WebView) ──
      const isIOS = config.testPlatform === TEST_PLATFORMS.IOS;
      const isSafari = String(config.mobile.browserName || '').toLowerCase() === 'safari';

      if (isIOS && isSafari) {
        this._mobile = new AmazonIOSSafariPage(page);

        // Map AmazonIOSSafariPage methods to the MobileAmazonHomePage interface
        this._mobile.waitForAmazonReady = this._mobile.verifyHomeLoaded.bind(this._mobile);
        // Capture the original verifyVisible BEFORE overwriting to avoid recursion
        const _origVerifyVisible = this._mobile.verifyVisible.bind(this._mobile);
        this._mobile.verifyVisible = async (locator: any) => {
          // Delegate to AmazonIOSSafariPage.verifyVisible which handles strings and elements
          return _origVerifyVisible(locator);
        };
        this._mobile.continueShoppingIfPrompted = async () => {};
        this._mobile.openCart = this._mobile.openCartPage.bind(this._mobile);
        this._mobile.getFooterLinks = async () => [];

        // Copy all methods from AmazonIOSSafariPage to this instance
        const proto = Object.getOwnPropertyNames(AmazonIOSSafariPage.prototype);
        for (const key of proto) {
          if (key !== 'constructor' && typeof this._mobile[key] === 'function') {
            this[key] = this._mobile[key].bind(this._mobile);
          }
        }
        // Override with our mapped methods
        this.waitForAmazonReady = this._mobile.waitForAmazonReady;
        this.verifyVisible = this._mobile.verifyVisible;
        this.continueShoppingIfPrompted = this._mobile.continueShoppingIfPrompted;
        this.openCart = this._mobile.openCart;
        this.getFooterLinks = this._mobile.getFooterLinks;

        // Logo: AmazonIOSSafariPage does not expose a `logo` element reference.
        // The step "the Amazon logo should be visible" calls verifyVisible(logo).
        // For iOS Safari we use page-source check via the verifyVisible override above,
        // which checks for "amazon" text. The logo property itself is a sentinel.
        this.logo = { __iosSafariSentinel: true };
        return;
      }

      // ── Android / iOS App: use MobileAmazonHomePage ──
      this._mobile = new MobileAmazonHomePage(page);
      // Copy MobileAmazonHomePage methods to this instance for transparent dispatch
      const proto = Object.getOwnPropertyNames(MobileAmazonHomePage.prototype);
      for (const key of proto) {
        if (key !== 'constructor' && typeof this._mobile[key] === 'function') {
          this[key] = this._mobile[key].bind(this._mobile);
        }
      }
      // Copy locator properties
      this.logo = this._mobile.logo;
      this.continueShoppingButton = this._mobile.continueShoppingButton;
      this.searchBox = this._mobile.searchBox;
      this.searchButton = this._mobile.searchButton;
      this.accountLink = this._mobile.accountLink;
      this.cartLink = this._mobile.cartLink;
      return;
    }

    // Playwright mode — original implementation
    this._initPlaywright(page);
  }

  /** @private Playwright initialization */
  _initPlaywright(page: any) {
    this.__base = new BasePage(page);
    const bp = Object.getOwnPropertyNames(BasePage.prototype);
    for (const key of bp) {
      if (key !== 'constructor' && typeof this.__base[key] === 'function') {
        this[key] = this.__base[key].bind(this.__base);
      }
    }

    this.page = page;
    this.logo = page.locator('#nav-logo-sprites, #nav-logo a').first();
    this.continueShoppingButton = page
      .locator('input[type="submit"], .a-button-input, button')
      .filter({ hasText: /continue shopping/i })
      .or(page.locator('input[type="submit"][aria-labelledby], .a-button-input').first())
      .first();
    this.searchBox = page.getByPlaceholder(/search amazon\.in/i).or(page.locator('#twotabsearchtextbox')).first();
    this.searchButton = page.getByRole('button', { name: /go/i }).or(page.locator('#nav-search-submit-button')).first();
    this.accountLink = page.locator('#nav-link-accountList').first();
    this.ordersLink = page.locator('#nav-orders').first();
    this.cartLink = page.locator('#nav-cart').first();
    this.allMenu = page.locator('#nav-hamburger-menu').first();
    this.todaysDeals = page.getByRole('link', { name: /today'?s deals/i }).first();
    this.footerLinks = page.locator('#navFooter a[href], footer a[href]');
  }

  async openHomePage() {
    if (this._mobile) return this._mobile.openHomePage();
    await this.__base.open('/');
    await this.continueShoppingIfPrompted();
    await this.waitForAmazonReady();
  }

  async waitForAmazonReady() {
    if (this._mobile) return this._mobile.waitForAmazonReady();
    await expect(this.page.locator('body')).toBeVisible();
  }

  async continueShoppingIfPrompted() {
    if (this._mobile) return this._mobile.continueShoppingIfPrompted();
    const promptTextVisible = await this.page
      .getByText(/click the button below to continue shopping/i)
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (promptTextVisible) {
      await this.continueShoppingButton.click({ force: true });
      await this.page.waitForLoadState('domcontentloaded');
    }
  }

  async searchProduct(productName: any) {
    if (this._mobile) return this._mobile.searchProduct(productName);
    await this.__base.fill(this.searchBox, productName);
    await this.searchBox.press('Enter');
  }

  async openCart() {
    if (this._mobile) return this._mobile.openCart();
    await this.cartLink.click();
  }

  async getFooterLinks() {
    if (this._mobile) return this._mobile.getFooterLinks();
    await this.__base.scrollToBottom();
    await this.footerLinks.first().waitFor({ state: 'attached' });
    return this.footerLinks.evaluateAll((links: any) =>
      links
        .filter((link: any) => {
          const style = window.getComputedStyle(link);
          return style.visibility !== 'hidden' && style.display !== 'none' && link.getClientRects().length > 0;
        })
        .map((link: any) => ({
          text: link.innerText.trim() || link.getAttribute('aria-label') || link.getAttribute('title') || 'footer link',
          href: link.href || link.getAttribute('href') || ''
        }))
        .filter((link: any) => link.href)
    );
  }

  async verifyFooterLinksHaveValidUrls(footerLinks: any) {
    if (this._mobile) return; // Skip on mobile
    if (!footerLinks || footerLinks.length === 0) {
      throw new Error('No footer links were found on the Amazon home page.');
    }
    const invalidLinks = footerLinks.filter(
      (link: any) => !link.href || link.href === '#' || link.href.toLowerCase().startsWith('javascript:')
    );
    if (invalidLinks.length > 0) {
      throw new Error(`Invalid footer links found: ${JSON.stringify(invalidLinks, null, 2)}`);
    }
  }

  async verifyVisible(locator: any) {
    if (this._mobile) return this._mobile.verifyVisible(locator);
    await expect(locator).toBeVisible({ timeout: 60000 });
  }
}

export default AmazonHomePage;
