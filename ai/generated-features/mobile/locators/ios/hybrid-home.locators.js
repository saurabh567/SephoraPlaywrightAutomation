// iOS hybrid home locators
// Supported strategies: accessibility-id, id, xpath, class name, -ios predicate string, -ios class chain
module.exports = {
  homeScreenIndicator: '~hybrid-home-screen',
  searchField: '-ios predicate string:type == "XCUIElementTypeSearchField"',
  searchInput: '-ios predicate string:type == "XCUIElementTypeSearchField"',
  searchSubmitButton: '~Search',
  firstSearchResult: '-ios predicate string:type == "XCUIElementTypeCell"',
  cartButton: '-ios predicate string:name CONTAINS[c] "basket"',
  usernameInput: '-ios predicate string:type == "XCUIElementTypeTextField" AND name CONTAINS[c] "username"',
  passwordInput: '-ios predicate string:type == "XCUIElementTypeSecureTextField" AND name CONTAINS[c] "password"',
  loginButton: '~Login'
};
