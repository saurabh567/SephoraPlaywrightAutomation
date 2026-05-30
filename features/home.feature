@home @regression
Feature: Sephora Home Page

  Background:
    Given I am on the Sephora home page

  @smoke  @passed 
  Scenario: 001 Verify Sephora logo on home page
    Then the Sephora logo should be visible

  @smoke @passed
  Scenario: 002 Verify search box on home page
    Then the search box should be visible

  @smoke @login @passed
  Scenario: 003 Verify Sign In Register link on home page
    Then the Sign In Register link should be visible
   
   @passed
  Scenario: 004 Verify Beauty Pass link on home page
    Then the Beauty Pass link should be visible
   @passed
  Scenario: 005 Verify Stores and Events link on home page
    Then the Stores and Events link should be visible

  @passed
  Scenario: 006 Verify Wishlist link on home page
    Then the Wishlist link should be visible
   @passed
  Scenario: 007 Verify Bag link on home page
    Then the Bag link should be visible

  @smoke @passed
  Scenario: 008 Verify all top navigation menus on home page
    Then all main navigation menus should be visible
  
  @passed
  Scenario: 009 Verify hero banner Shop Now text on home page
    Then the hero banner Shop Now button should be visible

  @passed
  Scenario: 010 Verify Rare Beauty promotional text on home page
    Then the Rare Beauty promotional text should be visible
  @passed
  Scenario: 011 Verify Free Samples message on home page
    Then the Free Samples message should be visible
  @passed
  Scenario: 012 Verify user can search product from home page
    When I search for product from test data
    Then the page title should contain "Sephora"
