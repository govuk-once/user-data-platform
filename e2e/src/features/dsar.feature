@udp @dsar
Feature: DSAR Api
    As a UDP Authenticated Client
    I want to be able to manage DSAR request

    Background:
        Given I am authenticated

    Scenario: Setup - Create User and store data
        When I send a post to '/v1/user' with the body '{"appId":"dsar-e2e-user-1", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 204

    Scenario: Setup - Add data for user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'dsar-e2e-user-1'
        When I send a post to '/v1/dsar-test/data1' with the body '{"data": { "key":"value1" }}'
        Then I should recieve a successful response

    Scenario: Setup - Add more data for the user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'dsar-e2e-user-1'
        When I send a post to '/v1/dsar-test/data2' with the body '{"data": { "key":"value2" }}'
        Then I should recieve a successful response

    Scenario: Setup - Verify Identity exists before DSAR
        Given I send a get to '/v1/identity/app/dsar-e2e-user-1'
        Then I should recieve a successful response

    Scenario: Setup - Verify data exists before DSAR
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'dsar-e2e-user-1'
        When I send a get to '/v1/dsar-test/data2'
        Then I should recieve a successful response

    Scenario: Trigger DSAR delete request
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'dsar-e2e-user-1'
        When I send a post to '/v1/dsar' with the body '{}'
        Then the response status should be 202

    Scenario: Verify data is deleted after DSAR
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'dsar-e2e-user-1'
        Then the response at '/v1/dsar-test/data1' should eventually return status 404 within 120 seconds

    Scenario: Verify identity is deleted asfter DSAR
        Then the response at '/v1/identity/app/dsar-e2e-user-1' should eventually return status 404 within 120 seconds
