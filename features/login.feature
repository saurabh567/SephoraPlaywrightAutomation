@login @regression
Feature: Amazon India Login

  Background:
    Given I am on the Amazon home page

  @smoke
  Scenario: Successful login with valid credentials
    When I click on the Sign In link
    And I enter a valid email address
    And I click on the Continue button
    And I enter a valid password
    And I click on the Sign In submit button
    Then I should be logged in successfully

  @smoke
  Scenario: Login failure with invalid credentials
    When I click on the Sign In link
    And I enter an invalid email address
    And I click on the Continue button
    Then I should see an error message indicating the account could not be found
