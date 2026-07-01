@home @regression @ios @android @web
Feature: Amazon India Home Page

  Background:
    Given I am on the Amazon home page

  @smoke
  Scenario: Verify home page loads successfully
    Then the Amazon home page should be loaded
    And the Amazon logo should be visible

  @smoke
  Scenario: Search for a product
    When I search for "laptop" in the search box
    Then the search results page should show at least one result
