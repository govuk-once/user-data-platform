@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated

    #Scenario: Create user for tests
    #    When I send a post to '/user' with the body '{"appId":"123", "serviceName": "app"}'
    #    Then I should recieve a successful response
    #    Then the response status should be 201

    #Scenario: Successfully add data
    #    When I send a post to '/identity/123/topics' with the body '{"test":"data"}'
    #    Then I should recieve a successful response
    #    Then The response will contain message 'Entity saved successfully'

    #Scenario: Successfully Retrive data
    #    When i send a get to '/identity/123/topics'
    #    Then I should recieve a successful response
    #    Then The response body contain body '{"data":{"test":"data"}}'

    #Scenario: Successfully delete data
    #    When i send a delete to '/identity/123/topics'
    #    Then I should recieve a successful response

    #Scenario: Successfully Delete identity Record
    #    When i send a delete to '/identity/123'
    #    Then I should recieve a successful response
