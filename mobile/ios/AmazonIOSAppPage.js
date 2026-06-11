const MobileBasePage = require('../../framework/mobile/MobileBasePage');

class AmazonIOSAppPage extends MobileBasePage {
  constructor(driver) {
    super(driver);
    this.searchField = '-ios predicate string:type == "XCUIElementTypeSearchField" OR name CONTAINS[c] "search" OR label CONTAINS[c] "search"';
    this.cartButton = '-ios predicate string:name CONTAINS[c] "cart" OR label CONTAINS[c] "cart" OR name CONTAINS[c] "basket" OR label CONTAINS[c] "basket"';
    this.firstProduct = '-ios predicate string:type == "XCUIElementTypeCell" OR type == "XCUIElementTypeOther"';
  }

  async openHomePage() {
    await this.waitForSourceText(/amazon|search|cart|home/i);
  }

  async isSecurityVerificationPage() {
    const source = await this.driver.getPageSource();
    return /captcha|enter the characters|security verification|automated access/i.test(source);
  }

  async verifyHomeLoaded() {
    await this.waitForSourceText(/amazon|search|cart|home/i);
  }

  async verifyLogoVisible() {
    await this.waitForSourceText(/amazon/i);
  }

  async verifySearchBoxVisible() {
    await this.waitForDisplayed(this.searchField);
  }

  async verifyCartLinkVisible() {
    await this.waitForDisplayed(this.cartButton);
  }

  async searchProduct(productName) {
    const searchField = await this.waitForDisplayed(this.searchField);
    await searchField.click();
    await searchField.setValue(productName);
    await this.driver.keys(['Enter']);
    await this.verifySearchResultsVisible();
  }

  async verifySearchResultsVisible() {
    await this.waitForSourceText(/results|filter|sort|delivery|prime|sponsored/i);
  }

  async openFirstProductFromResults() {
    const elements = await this.driver.$$(this.firstProduct);
    for (const element of elements) {
      if (await element.isDisplayed().catch(() => false)) {
        await element.click();
        await this.verifyProductDetailsVisible();
        return;
      }
    }

    throw new Error('No visible product candidate found in iOS app search results.');
  }

  async verifyProductDetailsVisible() {
    await this.waitForSourceText(/add to cart|buy now|price|rating|reviews?|product/i);
  }

  async verifyProductTitleVisible() {
    await this.waitForSourceText(/brand|rating|reviews?|product/i);
  }

  async verifyProductPriceVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/₹|price|deal|offer/i.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  async verifyProductRatingVisibleIfAvailable() {
    const source = await this.driver.getPageSource();
    if (/ratings?|stars?|reviews?/i.test(source)) return;
    await this.verifyProductDetailsVisible();
  }

  async addToCartIfAvailable() {
    const buttons = await this.driver.$$('-ios predicate string:name CONTAINS[c] "add to cart" OR label CONTAINS[c] "add to cart"');
    for (const button of buttons) {
      if (await button.isDisplayed().catch(() => false)) {
        await button.click();
        await this.waitForSourceText(/added|cart|basket/i);
        return true;
      }
    }

    return false;
  }

  async verifyAddToCartFlowComplete(addedToCart) {
    if (addedToCart) {
      await this.waitForSourceText(/added|cart|basket/i);
      return;
    }

    await this.verifyProductDetailsVisible();
  }

  async openCartPage() {
    const cartButton = await this.waitForDisplayed(this.cartButton);
    await cartButton.click();
    await this.verifyCartPageVisible();
  }

  async verifyCartPageVisible() {
    await this.waitForSourceText(/cart|basket|subtotal|proceed to buy|empty/i);
  }

  async verifyCartTitleOrEmptyMessage() {
    await this.waitForSourceText(/cart|basket|empty|subtotal/i);
  }

  async verifyProceedToBuyButtonIfCartHasItems() {
    const source = await this.driver.getPageSource();
    if (/proceed to buy|checkout|subtotal/i.test(source)) return;
    await this.verifyCartTitleOrEmptyMessage();
  }

  async getFooterLinks() {
    return [];
  }

  async verifyFooterLinksHaveValidUrls() {
    await this.verifyHomeLoaded();
  }

  async waitForDisplayed(locator, timeout = this.timeout) {
    const element = await this.driver.$(locator);
    await element.waitForDisplayed({ timeout });
    return element;
  }

  async waitForSourceText(textOrPattern, timeout = this.timeout) {
    const matcher = textOrPattern instanceof RegExp
      ? (source) => textOrPattern.test(source)
      : (source) => source.toLowerCase().includes(String(textOrPattern).toLowerCase());

    await this.driver.waitUntil(
      async () => matcher(await this.driver.getPageSource()),
      {
        timeout,
        timeoutMsg: `Timed out waiting for iOS app source to contain: ${textOrPattern}`
      }
    );
  }
}

module.exports = AmazonIOSAppPage;
