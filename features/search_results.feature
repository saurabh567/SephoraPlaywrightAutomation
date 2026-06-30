@searchResults @regression
Feature: Amazon India Search Results Page

  Background:
    Given I search for "laptop" in the search box

  @smoke
  Scenario: Verify search results appear
    Then the search results page should show at least one result
    And the search result items should be visible

  @regression
  Scenario: Apply a filter to results
    When I apply a product filter
    Then the search results should update based on the applied filter
