@cart @regression
Feature: Amazon India Cart Page

  Background:
    Given I am on the Amazon cart page

  @smoke
  Scenario: 016 Verify cart page
    Then the Amazon cart page should be visible

  @smoke
  Scenario: 017 Verify cart title or empty cart message
    Then the Amazon cart title or empty cart message should be visible

  Scenario: 018 Verify proceed to buy button if cart has items
    Then the Amazon proceed to buy button should be visible if cart has items
