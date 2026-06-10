@home @regression
Feature: Amazon India Home Page

  Background:
    Given I am on the Amazon home page

  @smoke
  Scenario: 001 Verify Amazon home page loads successfully
    Then the Amazon home page should be loaded

  @smoke
  Scenario: 002 Verify Amazon logo is visible
    Then the Amazon logo should be visible

  @smoke
  Scenario: 003 Verify search box is visible
    Then the Amazon search box should be visible

  @smoke
  Scenario: 004 Search for a product
    When I search for product from test data
    Then the Amazon search results page should be visible

  Scenario: 005 Verify Amazon cart link is visible
    Then the Amazon cart link should be visible

  @footer
  Scenario: 006 Verify Amazon footer links have valid URLs
    When I collect all footer links
    Then each footer link should have a valid URL
