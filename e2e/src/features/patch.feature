@udp @path
Feature: Patch data
    As a UDP Authenticated Client
    I want to be able to patch the data on a resource

    Background:
        Given I am authenticated

    Scenario: Setup - Create User and store data
        When I send a post to '/v1/user' with the body '{"appId":"patch-e2e-user-1", "serviceName": "app"}'
        Then I should receive a successful response
        Then the response status should be 204

    Scenario: Setup - Add data for user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T10:00:00.000Z'
        When I send a post to '/v1/patch-test' with the body '{"data": { "key":"value1" }}'
        Then I should receive a successful response

    Scenario: Patch the data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T11:00:00.000Z'
        When I send a patch to '/v1/patch-test' with the body '{"data": { "key2":"value2" }}'
        Then I should receive a successful response
        Then the response body should contain '"key"'
        Then the response body should contain '"key2"'

    Scenario: Reject out-of-sequence patch
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T09:00:00.000Z'
        When I send a patch to '/v1/patch-test' with the body '{"data": { "key2":"value2" }}'
        Then the response status should be 409

    Scenario: Patch to invalid path
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T12:00:00.000Z'
        When I send a patch to '/v1/patch-missing' with the body '{"data": { "key2":"value2" }}'
        Then the response status should be 404

    Scenario: Patch with invalid user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-unknown'
        And I set header 'requested-at' to '2026-04-09T12:00:00.000Z'
        When I send a patch to '/v1/patch-test' with the body '{"data": { "key2":"value2" }}'
        Then the response status should be 404

    Scenario: Successfully Retrive data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T12:00:01.000Z'
        When I send a get to '/v1/patch-test'
        Then I should receive a successful response
        Then the response body should contain '"key"'
        Then the response body should contain '"key2"'

    Scenario: Successfully delete data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        And I set header 'requested-at' to '2026-04-09T12:00:02.000Z'
        When I send a delete to '/v1/patch-test'
        Then I should receive a successful response

    Scenario: Successfully Delete identity Record
        When I send a delete to '/v1/identity/app/patch-e2e-user-1'
        Then I should receive a successful response
