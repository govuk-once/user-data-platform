@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated

    Scenario: Create user for tests
        When I send a post to '/v1/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 201

    Scenario: Successfully add data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When I send a post to '/v1/topics' with the body '{"data": {"test":"data"} }'
        Then I should recieve a successful response
        Then The response will contain message 'Entity saved successfully'

    Scenario: Successfully Retrive data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When i send a get to '/v1/topics'
        Then I should recieve a successful response
        Then The response body contain body '{"data":{"test":"data"}}'

    Scenario: Successfully delete data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When i send a delete to '/v1/topics'
        Then I should recieve a successful response

    Scenario: Successfully Delete identity Record
        When i send a delete to '/v1/identity/app/123'
        Then I should recieve a successful response
