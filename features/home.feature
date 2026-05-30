@home @regression
Feature: Sephora Home Page

  Background:
    Given I am on the Sephora home page

  @smoke @single
  Scenario: 001 Verify Sephora logo on home page
    Then the Sephora logo should be visible

  @smoke
  Scenario: 002 Verify search box on home page
    Then I should see text "Search"

  @smoke @login
  Scenario: 003 Verify Sign In Register link on home page
    Then I should see text "Sign In / Register"

  Scenario: 004 Verify Beauty Pass link on home page
    Then I should see text "Beauty Pass"

  Scenario: 005 Verify Stores and Events link on home page
    Then I should see text "Stores & Events"

  Scenario: 006 Verify Wishlist link on home page
    Then I should see text "Wishlist"

  Scenario: 007 Verify Bag link on home page
    Then I should see text "Bag"

  @smoke
  Scenario: 008 Verify all top navigation menus on home page
    Then I should see text "New"
    And I should see text "Brands"
    And I should see text "Makeup"
    And I should see text "Skincare"
    And I should see text "Hair"
    And I should see text "Fragrance"

  Scenario: 009 Verify hero banner Shop Now text on home page
    Then I should see text "SHOP NOW"

  Scenario: 010 Verify Rare Beauty promotional text on home page
    Then I should see text "RARE BEAUTY"

  Scenario: 011 Verify Free Samples message on home page
    Then I should see text "FREE SAMPLES"

  Scenario: 012 Verify user can search product from home page
    When I search for product from test data
    Then the page title should contain "Sephora"
