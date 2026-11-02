@udp @api @health
Feature: Health Check API
    As a UDP consumer
    I want to check the health of the API
    So that I can verify the service and its dependencies are running

    Background:
        Given I am authenticated

    Scenario: Health check returns healthy status
        When I send a get to '/v1/_health'
        Then I should receive a successful response
        Then the response status should be 200
        Then the response body contains '{"status":"healthy"}'
