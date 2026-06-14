// Android hybrid home locators
// Supported strategies: accessibility-id, id, xpath, class name, -android uiautomator, -ios predicate string
module.exports = {
  homeScreenIndicator: '~hybrid-home-screen',
  searchField: '~hybrid-search-field',
  searchInput: 'xpath://input[@type="search"]',
  searchSubmitButton: '~hybrid-search-submit',
  firstSearchResult: '(//android.view.ViewGroup[@clickable=true])[1]',
  cartButton: '~hybrid-cart-button',
  usernameInput: 'xpath://input[@name="username"]',
  passwordInput: 'xpath://input[@name="password"]',
  loginButton: '~hybrid-login-button'
};
