@productDetails @regression
Feature: Amazon India Product Details Page

  Background:
    Given I search for "laptop" in the search box

  @smoke
  Scenario: Verify product details are displayed
    When I open the first product from search results
    Then the product details page should be visible
    And the product title should be displayed
    And the product price should be displayed if available

  @smoke
  Scenario: Add product to cart from details page
    When I open the first product from search results
    And I add the product to the cart
    Then the product should be added to the cart successfully
