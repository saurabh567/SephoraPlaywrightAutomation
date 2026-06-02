// Page object for Rare Beauty product details page locators and actions.
const BasePage = require('./BasePage');

class ProductDetailsPage extends BasePage {
  constructor(page) {
    super(page);
    this.productTitle = page.getByText('Soft Pinch Liquid Blush').first();
    this.brandName = page.getByText('RARE BEAUTY').first();
    this.rating = page.getByText(/4\.7|\(34275\)/).first();
    this.price = page.getByText('₹3,200').first();
    this.shadeBelieve = page.getByText('Shade: Believe');
    this.viewAllShade = page.getByText('VIEW ALL SHADE');
    this.pincodeInput = page.getByPlaceholder('Enter Pincode');
    this.checkDeliveryButton = page.getByText('CHECK DELIVERY');
    this.quantityDropdown = page.locator('select').first();
    this.addToBagButton = page.getByText('ADD TO BAG');
    this.wishlistIcon = page.locator('svg, button').filter({ hasText: /^$/ }).nth(0);
    this.thumbnailImages = page.locator('img');
  }

  async openProductPage() {
    await this.open('/product/rare-beauty-soft-pinch-liquid-blush-v-believe');
  }

  async checkDelivery(pincode) {
    await this.fill(this.pincodeInput, pincode);
    await this.checkDeliveryButton.click();
  }

  async addToBag() {
    await this.addToBagButton.click();
  }
}

module.exports = ProductDetailsPage;
