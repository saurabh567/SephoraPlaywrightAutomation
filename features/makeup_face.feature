@makeupFace @regression
Feature: Sephora Makeup Face Product Listing Page

  Background:
    Given I am on the Makeup Face listing page

  @smoke
  Scenario: 013 Verify Shop Makeup banner
    Then I should see text "SHOP MAKEUP"

  @smoke
  Scenario: 014 Verify Face category tab
    Then I should see text "Face"

  Scenario: 015 Verify all makeup category tabs
    Then I should see text "Face"
    And I should see text "Eye"
    And I should see text "Lip"

  Scenario: 016 Verify Face page item count text
    Then I should see text "FACE"

  Scenario: 017 Verify sort dropdown is visible
    Then I should see text "Sort"

  Scenario: 018 Verify product filter sections are visible
    Then I should see text "Filters"

  Scenario: 019 Verify clear all filters button is visible
    Then I should see text "CLEAR ALL FILTERS"

  Scenario: 020 Verify Rare Beauty product card is visible
    Then I should see text "RARE BEAUTY"

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
