const BasePage = require('./BasePage');

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    this.logo = page.locator('#image-wrap').first();
    this.searchBox = page.getByPlaceholder('Search for brands and products');
    this.searchIcon = page.locator('button, [role="button"]').filter({ hasText: /^$/ }).last();
    this.signInRegister = page.getByText('Sign In / Register');
    this.beautyPass = page.getByText('Beauty Pass');
    this.storesEvents = page.getByText('Stores & Events');
    this.wishlist = page.getByText('Wishlist');
    this.bag = page.getByText('Bag').first();
    this.newMenu = page.getByText('NEW', { exact: true });
    this.brandsMenu = page.getByText('BRANDS', { exact: true });
    this.makeupMenu = page.getByText('MAKEUP', { exact: true });
    this.skincareMenu = page.getByText('SKINCARE', { exact: true });
    this.hairMenu = page.getByText('HAIR', { exact: true });
    this.toolsBrushesMenu = page.getByText('TOOLS & BRUSHES', { exact: true });
    this.bathBodyMenu = page.getByText('BATH & BODY', { exact: true });
    this.fragranceMenu = page.getByText('FRAGRANCE', { exact: true });
    this.cleanMenu = page.getByText('CLEAN', { exact: true });
    this.giftsMenu = page.getByText('GIFTS', { exact: true });
    this.saleMenu = page.getByText('SALE', { exact: true });
    this.shopNowButton = page.getByText('SHOP NOW');
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
