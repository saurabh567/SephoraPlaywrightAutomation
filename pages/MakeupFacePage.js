// Page object for the Makeup Face product listing page.
const BasePage = require('./BasePage');

class MakeupFacePage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByText('SHOP MAKEUP');
    this.faceTab = page.getByText('FACE', { exact: true }).first();
    this.allTab = page.getByText('ALL', { exact: true }).first();
    this.eyesTab = page.getByText('EYES', { exact: true }).first();
    this.lipsTab = page.getByText('LIPS', { exact: true }).first();
    this.nailsTab = page.getByText('NAILS', { exact: true }).first();
    this.sortDropdown = page.locator('select').first();
    this.clearAllFilters = page.getByText('CLEAR ALL FILTERS');
    this.productTypesFilter = page.getByText('PRODUCT TYPES');
    this.productsFilter = page.getByText('PRODUCTS', { exact: true });
    this.brandsFilter = page.getByText('BRANDS', { exact: true }).last();
    this.ratingFilter = page.getByText('RATING');
    this.firstProduct = page.locator('a, div').filter({ hasText: /Soft Pinch Liquid Blush|Easy Bake Loose Powder|Blush Filter/i }).first();
  }

  async openMakeupFacePage() {
    await this.open('/collection/makeup-face');
  }

  async openFirstProduct() {
    await this.page.getByText('Soft Pinch Liquid Blush').first().click();
  }
}

module.exports = MakeupFacePage;
