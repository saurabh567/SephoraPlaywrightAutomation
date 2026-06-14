// iOS native home locators
// Supported strategies: accessibility-id, id, xpath, class name, -ios predicate string, -ios class chain
module.exports = {
  homeScreenIndicator: '~home-screen',
  searchField: '-ios predicate string:type == "XCUIElementTypeSearchField"',
  searchInput: '-ios predicate string:type == "XCUIElementTypeSearchField"',
  searchSubmitButton: '~Search',
  firstSearchResult: '-ios predicate string:type == "XCUIElementTypeCell"',
  cartButton: '-ios predicate string:name CONTAINS[c] "cart"',
  productTitle: '~product-title',
  productPrice: '~product-price',
  productRating: '~product-rating'
};
