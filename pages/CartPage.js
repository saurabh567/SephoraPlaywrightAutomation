// Page object for shopping bag page locators and cart-related actions.
const BasePage = require('./BasePage');

class CartPage extends BasePage {
  constructor(page) {
    super(page);
    this.shoppingBagTitle = page.getByText(/shopping bag|bag/i).first();
    this.noItemsAlert = page.getByText('No items in cart');
    this.emptyCartTitle = page.getByText('SORRY!');
    this.emptyCartMessage = page.getByText('Your Shopping Bag is empty.');
    this.freeSamplesBanner = page.locator("xpath=//img[contains(@src,'free_samples_banner')]");
    this.app10CouponBanner = page.locator("xpath=//img[contains(@src,'23ee3f70bb09') or contains(@src,'theme-image-1698835351634')]");
    this.beautyPassRewards = page.getByText('BEAUTY PASS REWARDS').first();
    this.customerCareSection = page.getByText('CUSTOMER CARE').first();
    this.paymentOptions = page.getByText('PAYMENT OPTIONS').first();
  }

  async openCartPage() {
    await this.open('/cart/bag');
  }
}

module.exports = CartPage;
