@api @crud @regression
Feature: CRUD API Validation

  As a test engineer
  I want to validate CRUD endpoints of the JSONPlaceholder API
  So that I can ensure the API behaves correctly for both success and error scenarios

  Background:
    Given I set API base URL to "https://jsonplaceholder.typicode.com"
    And I set default request headers

  # --------------------------------------------------------------------------
  # Positive — GET
  # --------------------------------------------------------------------------
  @api-get @smoke @positive
  Scenario: GET — Fetch a single post by valid ID
    When I send a GET request to "/posts/1"
    Then the response status code should be 200
    And the response should contain field "userId"
    And the response should contain field "id"
    And the response should contain field "title"
    And the response should contain field "body"

  # --------------------------------------------------------------------------
  # Positive — POST
  # --------------------------------------------------------------------------
  @api-post @smoke @positive
  Scenario: POST — Create a new post with valid payload
    Given I set request body from test data "createPost"
    When I send a POST request to "/posts"
    Then the response status code should be 201
    And the response should contain a generated id
    And the response should contain field "title"
    And the response should contain field "body"

  # --------------------------------------------------------------------------
  # Positive — PUT
  # --------------------------------------------------------------------------
  @api-put @smoke @positive
  Scenario: PUT — Replace an existing post completely
    Given I set request body from test data "updatePost"
    When I send a PUT request to "/posts/1"
    Then the response status code should be 200
    And the response should contain updated title
    And the response should contain updated body
    And the response should contain field "id"

  # --------------------------------------------------------------------------
  # Positive — PATCH
  # --------------------------------------------------------------------------
  @api-patch @smoke @positive
  Scenario: PATCH — Partially update a single field of a post
    Given I set request body from test data "patchPost"
    When I send a PATCH request to "/posts/1"
    Then the response status code should be 200
    And the response should contain the patched value "title"
    And the response should contain field "body"
    And the response should contain field "id"

  # --------------------------------------------------------------------------
  # Positive — DELETE
  # --------------------------------------------------------------------------
  @api-delete @smoke @positive
  Scenario: DELETE — Delete an existing post
    When I send a DELETE request to "/posts/1"
    Then the response status code should be 200 or 204

  # --------------------------------------------------------------------------
  # Negative — 404 Not Found
  # --------------------------------------------------------------------------
  @api-negative
  Scenario: GET — Fetch a non-existent endpoint returns 404
    When I send a GET request to "/nonexistent"
    Then the response status code should be 404

  @api-negative
  Scenario: GET — Fetch a post with an invalid ID returns 404
    When I send a GET request to "/posts/invalid"
    Then the response status code should be 404

  @api-negative
  Scenario: DELETE — Delete a non-existent resource returns 404
    When I send a DELETE request to "/nonexistent"
    Then the response status code should be 200 or 404
