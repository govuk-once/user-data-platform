@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated as "flex"

    Scenario: Successfully add data
        When I send a post to '/topics/123' with the body '{"data":{"test":"data"}}'
        Then I should recieve a successful response
        Then The response will contain message 'Entity saved successfully'

    Scenario: Successfully Retrive data
        When i send a get to '/topics/123'
        Then I should recieve a successful response
