@udp @api
Feature: User Data API
    As a UDP Authenticated Client
    I want to be able to save data via the api
    So that i can retrieve it later

    Background:
        Given I am authenticated as "flex"

    Scenario: Successfully add data
        When I send a post to '/postData' with the body '{"test":"data"}'
        Then I should recieve an error response