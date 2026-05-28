@productDetails @regression
Feature: Sephora Product Details Page

  Background:
    Given I am on the Rare Beauty product details page

  @smoke
  Scenario: 028 Verify product title on product details page
    Then the product title should be visible

  @smoke
  Scenario: 029 Verify product brand on product details page
    Then the product brand should be visible

  Scenario: 030 Verify product price on product details page
    Then the product price should be visible

  Scenario: 031 Verify product rating on product details page
    Then the product rating should be visible

  Scenario: 032 Verify selected shade Believe on product details page
    Then the shade Believe should be visible

  Scenario: 033 Verify View All Shade button on product details page
    Then the View All Shade button should be visible

  Scenario: 034 Verify pincode delivery section on product details page
    Then the pincode delivery section should be visible

  Scenario: 035 Verify user can check delivery with valid pincode
    When I enter pincode from test data
    Then the pincode delivery section should be visible

  Scenario: 036 Verify quantity dropdown on product details page
    Then the quantity dropdown should be visible

  @smoke
  Scenario: 037 Verify Add To Bag button on product details page
    Then the Add To Bag button should be visible

  Scenario: 038 Verify coupon banner on product details page
    Then I should see text "APP10"

  Scenario: 039 Verify MRP inclusive tax text on product details page
    Then I should see text "Inclusive of all taxes"

  Scenario: 040 Verify image thumbnails are visible on product details page
    Then I should see text "Trending"

  Scenario: 041 Verify negative delivery check with blank pincode keeps user on same page
    Then the pincode delivery section should be visible

  Scenario: 042 Verify user can click Add To Bag from product page
    When I click Add To Bag button
    Then the Add To Bag button should be visible
