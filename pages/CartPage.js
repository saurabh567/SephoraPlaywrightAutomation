const BasePage = require('./BasePage');

class CartPage extends BasePage {
  constructor(page) {
    super(page);
    this.shoppingBagTitle = page.getByText('SHOPPING BAG');
    this.itemCount = page.getByText('1 Item');
    this.productName = page.getByText('Soft Pinch Liquid Blush');
    this.productBrand = page.getByText('Rare Beauty');
    this.quantityMinus = page.getByText('−').first();
    this.quantityPlus = page.getByText('+').first();
    this.priceSummary = page.getByText('PRICE SUMMARY');
    this.totalMrp = page.getByText('Total MRP');
    this.subtotal = page.getByText('Subtotal');
    this.total = page.getByText('Total').last();
    this.checkoutButton = page.getByText('CHECKOUT');
    this.applyCoupons = page.getByText('Apply Coupons');
    this.changePincode = page.getByText('CHANGE PINCODE');
    this.deleteIcon = page.locator('svg, button').filter({ hasText: /^$/ }).last();
  }

  async openCartPage() {
    await this.open('/cart/bag');
  }
}

module.exports = CartPage;
