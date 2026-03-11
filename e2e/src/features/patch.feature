@udp @path
Feature: Patch data
    As a UDP Authenticated Client
    I want to be able to patch the data on a resource

    Background:
        Given I am authenticated

    Scenario: Setup - Create User and store data
        When I send a post to '/v1/user' with the body '{"appId":"patch-e2e-user-1", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 204

    Scenario: Setup - Add data for user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        When I send a post to '/v1/patch-test' with the body '{"data": { "key":"value1" }}'
        Then I should recieve a successful response

    Scenario: Patch the data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        When I send a patch to '/v1/patch-test' with the body '{"data": { "key2":"value2" }}'
        Then I should recieve a successful response
        Then the response body contains '{"data": { "key":"value1", "key2":"value2" }}'

    Scenario: Patch to invalid path
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        When I send a patch to '/v1/patch-missing' with the body '{"data": { "key2":"value2" }}'
        Then the response status should be 404

    Scenario: Patch with invalid user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-unknown'
        When I send a patch to '/v1/patch-test' with the body '{"data": { "key2":"value2" }}'
        Then the response status should be 404

    Scenario: Successfully Retrive data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        When I send a get to '/v1/patch-test'
        Then I should recieve a successful response
        Then the response body contains '{"data": { "key":"value1", "key2":"value2" }}'

    Scenario: Successfully delete data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'patch-e2e-user-1'
        When I send a delete to '/v1/patch-test'
        Then I should recieve a successful response

    Scenario: Successfully Delete identity Record
        When I send a delete to '/v1/identity/app/patch-e2e-user-1'
        Then I should recieve a successful response
