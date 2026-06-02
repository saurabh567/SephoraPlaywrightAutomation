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
}

module.exports = HomePage;
