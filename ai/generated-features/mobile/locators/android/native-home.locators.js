// Android native home locators
// Supported strategies: accessibility-id, id, xpath, class name, -android uiautomator, -ios predicate string
module.exports = {
  homeScreenIndicator: '~home-screen',
  searchField: '~search-field',
  searchInput: 'id:in.amazon.mShop.android.shopping:id/rs_search_src_text',
  searchSubmitButton: '~search-submit',
  firstSearchResult: '(//android.view.ViewGroup[@clickable=true])[1]',
  cartButton: 'android=new UiSelector().descriptionContains("Cart")',
  productTitle: '~product-title',
  productPrice: '~product-price',
  productRating: '~product-rating'
};
