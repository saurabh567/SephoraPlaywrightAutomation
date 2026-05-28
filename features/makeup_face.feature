@makeupFace @regression
Feature: Sephora Makeup Face Product Listing Page

  Background:
    Given I am on the Makeup Face listing page

  @smoke
  Scenario: 013 Verify Shop Makeup banner
    Then the Makeup Face page banner should be visible

  @smoke
  Scenario: 014 Verify Face category tab
    Then the face category tab should be selected or visible

  Scenario: 015 Verify all makeup category tabs
    Then all makeup category tabs should be visible

  Scenario: 016 Verify Face page item count text
    Then I should see text "FACE"

  Scenario: 017 Verify sort dropdown is visible
    Then the product listing sort dropdown should be visible

  Scenario: 018 Verify product filter sections are visible
    Then the product filters should be visible

  Scenario: 019 Verify clear all filters button is visible
    Then I should see text "CLEAR ALL FILTERS"

  Scenario: 020 Verify Rare Beauty product card is visible
    Then the Rare Beauty product should be visible in listing

  Scenario: 021 Verify Huda Beauty product card is visible
    Then I should see text "HUDA BEAUTY"

  Scenario: 022 Verify product rating stars area is visible
    Then I should see text "★"

  Scenario: 023 Verify Recommended sort option is visible
    Then I should see text "Recommended"

  Scenario: 024 Verify Face breadcrumb is visible
    Then I should see text "Home / Makeup / Face"

  Scenario: 025 Verify BB CC Cream side category is visible
    Then I should see text "BB & CC Cream"

  Scenario: 026 Verify Blush side category is visible
    Then I should see text "Blush"

  Scenario: 027 Verify Foundation side category is visible
    Then I should see text "Foundation"
