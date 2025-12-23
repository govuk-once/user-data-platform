@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated as "flex"

    Scenario: Successfully add data
        When I send a post to '/user/123/topics' with the body '{"data":{"test":"data"}}'
        Then I should recieve a successful response
        Then The response will contain message 'Entity saved successfully'

    Scenario: Successfully Retrive data
        When i send a get to '/user/123/topics'
        Then I should recieve a successful response
        Then The response body contain body '{"data":{"test":"data"}, "pk":"123","sk":"topics"}'

    Scenario: Successfully delete data
        When i send a delete to '/user/123/topics'
        Then I should recieve a successful response
