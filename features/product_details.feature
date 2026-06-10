@productDetails @regression
Feature: Amazon India Product Details Page

  Background:
    Given I open the first Amazon product from search results

  @smoke
  Scenario: 011 Verify product details page
    Then the Amazon product details page should be visible

  @smoke
  Scenario: 012 Verify product title is visible
    Then the Amazon product title should be visible

  Scenario: 013 Verify product price or offer information is visible
    Then the Amazon product price should be visible if available

  Scenario: 014 Verify product rating is visible if available
    Then the Amazon product rating should be visible if available

  @smoke
  Scenario: 015 Add product to cart if possible
    When I add the Amazon product to cart if possible
    Then the Amazon add to cart flow should complete
