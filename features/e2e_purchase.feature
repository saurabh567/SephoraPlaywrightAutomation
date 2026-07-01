@e2e @regression @ios @android @web
Feature: End-to-End Product Purchase Flow

  @e2e
  Scenario: Complete end-to-end purchase flow
    Given I am on the Amazon home page
    When I search for "laptop" in the search box
    And I open the first product from search results
    And I add the product to the cart
    Then the product should be added to the cart successfully
    When I navigate to the cart page
    And I click on the Proceed to Buy button
    Then the checkout page should be loaded
