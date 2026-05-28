@cart @regression
Feature: Sephora Shopping Bag Page

  Background:
    Given I am on the shopping bag page

  @smoke
  Scenario: 043 Verify shopping bag title
    Then the shopping bag title should be visible

  @smoke
  Scenario: 044 Verify cart item details
    Then the cart item details should be visible

  Scenario: 045 Verify cart quantity controls
    Then the cart quantity controls should be visible

  Scenario: 046 Verify price summary section
    Then the price summary should be visible

  @smoke
  Scenario: 047 Verify checkout button
    Then the checkout button should be visible

  Scenario: 048 Verify apply coupon section
    Then the apply coupon section should be visible

  Scenario: 049 Verify change pincode button
    Then the change pincode button should be visible

  Scenario: 050 Verify cart coupon APP10 banner is visible
    Then I should see text "APP10"
