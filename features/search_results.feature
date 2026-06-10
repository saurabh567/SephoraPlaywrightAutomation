@searchResults @regression
Feature: Amazon India Search Results Page

  Background:
    Given I search for product from test data on Amazon

  @smoke
  Scenario: 007 Verify search results page
    Then the Amazon search results page should be visible

  @smoke
  Scenario: 008 Verify search results contain products
    Then Amazon product results should be visible

  Scenario: 009 Verify search sort dropdown is visible
    Then the Amazon search sort dropdown should be visible

  @smoke
  Scenario: 010 Open first product from search result
    When I open the first product from Amazon search results
    Then the Amazon product details page should be visible
