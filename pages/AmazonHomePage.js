// Amazon India home page locators and actions.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class AmazonHomePage extends BasePage {
  constructor(page) {
    super(page);
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
    await this.open('/');
    await this.continueShoppingIfPrompted();
    await this.waitForAmazonReady();
  }

  async waitForAmazonReady() {
    await expect(this.page.locator('body')).toBeVisible();
  }

  async continueShoppingIfPrompted() {
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
    await this.fill(this.searchBox, productName);
    await this.searchBox.press('Enter');
  }

  async openCart() {
    await this.cartLink.click();
  }

  async getFooterLinks() {
    await this.scrollToBottom();
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
}

module.exports = AmazonHomePage;
