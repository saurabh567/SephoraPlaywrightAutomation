@cart @regression @ios @android @web
Feature: Amazon India Cart Page

  Background:
    Given I am on the Amazon home page

  @smoke
  Scenario: Add a product to cart
    When I search for "laptop" in the search box
    And I open the first product from search results
    And I add the product to the cart
    Then the product should be added to the cart successfully

  @regression
  Scenario: Remove a product from cart
    Given a product is added to the cart
    When I navigate to the cart page
    And I remove the product from the cart
    Then the cart should show the empty cart message
