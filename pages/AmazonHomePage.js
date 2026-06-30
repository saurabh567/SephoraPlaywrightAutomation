// Amazon India home page locators and actions.
// Automatically detects Playwright (web) vs WebDriverIO (mobile) driver
// and delegates to the appropriate implementation.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');
const MobileAmazonHomePage = require('./MobileAmazonHomePage');

class AmazonHomePage {
  constructor(page) {
    // Detect mobile driver (WebDriverIO) vs Playwright page
    if (page && typeof page.locator !== 'function') {
      // WebDriverIO driver — delegate to mobile implementation
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
  _initPlaywright(page) {
    this.__base = new BasePage(page);
    // Copy BasePage methods
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

  async searchProduct(productName) {
    if (this._mobile) return this._mobile.searchProduct(productName);
    await this.__base.fill(this.searchBox, productName);
    await this.searchBox.press('Enter');
  }

  async openCart() {
    if (this._mobile) return this._mobile.openCart();
    await this.cartLink.click();
  }

  async getFooterLinks() {
    if (this._mobile) return [];
    await this.__base.scrollToBottom();
    await this.footerLinks.first().waitFor({ state: 'attached' });
    return this.footerLinks.evaluateAll((links) =>
      links
        .filter((link) => {
          const style = window.getComputedStyle(link);
          return style.visibility !== 'hidden' && style.display !== 'none' && link.getClientRects().length > 0;
        })
        .map((link) => ({
          text: link.innerText.trim() || link.getAttribute('aria-label') || link.getAttribute('title') || 'footer link',
          href: link.href || link.getAttribute('href') || ''
        }))
        .filter((link) => link.href)
    );
  }

  async verifyFooterLinksHaveValidUrls(footerLinks) {
    if (this._mobile) return; // Skip on mobile
    if (!footerLinks || footerLinks.length === 0) {
      throw new Error('No footer links were found on the Amazon home page.');
    }
    const invalidLinks = footerLinks.filter(
      (link) => !link.href || link.href === '#' || link.href.toLowerCase().startsWith('javascript:')
    );
    if (invalidLinks.length > 0) {
      throw new Error(`Invalid footer links found: ${JSON.stringify(invalidLinks, null, 2)}`);
    }
  }

  async verifyVisible(locator) {
    if (this._mobile) return this._mobile.verifyVisible(locator);
    await expect(locator).toBeVisible({ timeout: 60000 });
  }
}

module.exports = AmazonHomePage;
