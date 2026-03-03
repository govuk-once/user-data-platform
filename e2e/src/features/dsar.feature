@udp
Feature: DSAR Api
    As a UDP Authenticated Client
    I want to be able to manage DSAR request

    Background:
        Given I am authenticated

    Scenario: Successfully create initial app User
        When I send a post to '/v1/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 204

    Scenario: Successfully create dsar request
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to '123'
        When I send a post to '/v1/dsar' with the body '{}'
        Then I should recieve a successful response
