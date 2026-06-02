# Shopping bag page scenarios for empty bag, promotional banner, footer, and recovery-state validations.
@cart @regression
Feature: Sephora Shopping Bag Page

  Background:
    Given I am on the shopping bag page

  @smoke
  Scenario: 043 Verify shopping bag title
    Then the shopping bag title should be visible

  @smoke
  Scenario: 044 Verify empty cart details
    Then the cart item details should be visible

  Scenario: 045 Verify cart promotional banners
    Then the cart quantity controls should be visible

  Scenario: 046 Verify cart footer support sections
    Then the price summary should be visible

  @smoke
  Scenario: 047 Verify Beauty Pass rewards section
    Then the checkout button should be visible

  Scenario: 048 Verify APP10 coupon banner
    Then the apply coupon section should be visible

  Scenario: 049 Verify no items alert
    Then the change pincode button should be visible

  Scenario: 050 Verify cart coupon APP10 banner is visible
    Then the apply coupon section should be visible
