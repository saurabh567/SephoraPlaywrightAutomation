// Page object for Sephora home page locators and home page-specific actions.
const BasePage = require('./BasePage');

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    this.logo = page.locator("xpath=(//div[@id='image-wrap'] | //img[contains(@alt,'Sephora')])[1]");
    this.searchBox = page.locator("xpath=//input[@id='search']");
    this.searchIcon = page.locator("xpath=(//button[.//span[contains(@class,'search')] or @type='submit'] | //*[@role='button'][.//*[name()='svg']])[last()]");
    this.signInRegister = page.locator("xpath=(//*[contains(normalize-space(.),'Sign In') and contains(normalize-space(.),'Register')])[1]");
    this.beautyPass = page.locator("xpath=(//*[normalize-space(.)='Beauty Pass'])[1]");
    this.storesEvents = page.locator("xpath=(//*[normalize-space(.)='Stores & Events'])[1]");
    this.wishlist = page.locator("xpath=(//*[normalize-space(.)='Wishlist'])[1]");
    this.bag = page.locator("xpath=(//*[normalize-space(.)='Bag'])[1]");
    this.newMenu = page.locator("xpath=(//*[normalize-space(.)='NEW'])[1]");
    this.brandsMenu = page.locator("xpath=(//*[normalize-space(.)='BRANDS'])[1]");
    this.makeupMenu = page.locator("xpath=(//*[normalize-space(.)='MAKEUP'])[1]");
    this.skincareMenu = page.locator("xpath=(//*[normalize-space(.)='SKINCARE'])[1]");
    this.hairMenu = page.locator("xpath=(//*[normalize-space(.)='HAIR'])[1]");
    this.toolsBrushesMenu = page.locator("xpath=(//*[normalize-space(.)='TOOLS & BRUSHES'])[1]");
    this.bathBodyMenu = page.locator("xpath=(//*[normalize-space(.)='BATH & BODY'])[1]");
    this.fragranceMenu = page.locator("xpath=(//*[normalize-space(.)='FRAGRANCE'])[1]");
    this.cleanMenu = page.locator("xpath=(//*[normalize-space(.)='CLEAN'])[1]");
    this.giftsMenu = page.locator("xpath=(//*[normalize-space(.)='GIFTS'])[1]");
    this.saleMenu = page.locator("xpath=(//*[normalize-space(.)='SALE'])[1]");
    this.shopNowButton = page.locator("xpath=(//img[contains(@src,'theme-image')])[1]");
    this.rareBeautyPromotion = page.locator("xpath=(//*[contains(translate(normalize-space(.),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'),'RARE BEAUTY')])[1]");
    this.freeSamplesMessage = page.locator("xpath=//img[contains(@src,'free_samples_banner')]");
    this.footerLinks = page.locator("xpath=//footer//a[@href] | //*[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'footer')]//a[@href]");
  }

  async openHomePage() {
    await this.open('/');
  }

  async searchProduct(productName) {
    await this.fill(this.searchBox, productName);
    await this.page.keyboard.press('Enter');
  }

  async openMakeupFacePage() {
    await this.open('/collection/makeup-face');
  }

  async openBag() {
    await this.bag.click();
  }

  async getFooterLinks() {
    await this.scrollToBottom();
    await this.footerLinks.first().waitFor({ state: 'attached' });

    return this.footerLinks.evaluateAll((links) =>
      links
        .filter((link) => {
          const style = window.getComputedStyle(link);
          const isVisible =
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            link.getClientRects().length > 0 &&
            link.offsetParent !== null;
          return isVisible;
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
      throw new Error('No footer links were found on the home page.');
    }

    const invalidLinks = footerLinks.filter(
      (link) => !link.href || link.href === '#' || link.href.toLowerCase().startsWith('javascript:')
    );

    if (invalidLinks.length > 0) {
      throw new Error(`Invalid footer links found: ${JSON.stringify(invalidLinks, null, 2)}`);
    }
  }

  async verifyFooterLinksHaveUniqueUrls(footerLinks) {
    await this.verifyFooterLinksHaveValidUrls(footerLinks);
    const urls = footerLinks.map((link) => link.href);
    const duplicateUrls = urls.filter((url, index) => urls.indexOf(url) !== index);

    if (duplicateUrls.length > 0) {
      throw new Error(`Duplicate footer URLs found: ${[...new Set(duplicateUrls)].join(', ')}`);
    }
  }
}

module.exports = HomePage;
