@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated

    Scenario: Create user for tests
        When I send a post to '/v1/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should receive a successful response
        Then the response status should be 204

    Scenario: Successfully add data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        And I set header 'requested-at' to '2026-04-09T12:00:00.000Z'
        When I send a post to '/v1/topics' with the body '{"data": {"test":"data"} }'
        Then I should receive a successful response
        Then the response body contains '{"data":{"test":"data"}}'

    Scenario: Successfully Retrive data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When I send a get to '/v1/topics'
        Then I should receive a successful response
        Then the response body contains '{"data":{"test":"data"}}'

    Scenario: Successfully delete data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When I send a delete to '/v1/topics'
        Then I should receive a successful response

    Scenario: Successfully Delete identity Record
        When I send a delete to '/v1/identity/app/123'
        Then I should receive a successful response
