// Amazon India cart page locators and actions.
const { expect } = require('@playwright/test');
const BasePage = require('./BasePage');

class AmazonCartPage extends BasePage {
  constructor(page) {
    super(page);
    this.cartTitle = page.getByRole('heading', { name: /shopping cart|cart/i }).first();
    this.continueShoppingButton = page
      .locator('input[type="submit"], .a-button-input, button')
      .filter({ hasText: /continue shopping/i })
      .or(page.locator('input[type="submit"][aria-labelledby], .a-button-input').first())
      .first();
    this.emptyCartMessage = page.getByText(/your amazon cart is empty|cart is empty|shopping cart is empty/i).first();
    this.cartItems = page.locator('[data-name="Active Items"] [data-asin], .sc-list-item');
    this.proceedToBuyButton = page.locator('input[name="proceedToRetailCheckout"], input[value*="Proceed to Buy"]').first();
  }

  async openCartPage() {
    await this.open('/gp/cart/view.html');
    await this.continueShoppingIfPrompted();
  }

  async verifyCartPageVisible() {
    await expect(this.page).toHaveURL(/cart|gp\/cart/i, { timeout: 60000 });
    await expect(this.cartTitle.or(this.emptyCartMessage).first()).toBeVisible({ timeout: 60000 });
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
}

module.exports = AmazonCartPage;
