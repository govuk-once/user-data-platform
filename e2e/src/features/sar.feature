@udp @sar
Feature: SAR Api
    As a UDP Authenticated Client
    I want to be able to request a Subject Access Request (SAR) to retrieve all my data

    Background:
        Given I am authenticated

    Scenario: Setup - Create User and store data
        When I send a post to '/v1/user' with the body '{"appId":"sar-e2e-user-1", "serviceName": "app"}'
        Then I should receive a successful response
        Then the response status should be 204

    Scenario: Setup - Add data for user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a post to '/v1/sar-test/data1' with the body '{"data": { "key":"value1", "testData": "important info" }}'
        Then I should receive a successful response

    Scenario: Setup - Add more data for the user
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a post to '/v1/sar-test/data2' with the body '{"data": { "key":"value2", "moreData": "additional info" }}'
        Then I should receive a successful response

    Scenario: Setup - Link a user identity
        When I send a post to '/v1/identity/service2/sar-user-321' with the body '{"appId":"sar-e2e-user-1"}'
        Then I should receive a successful response
        Then the response status should be 200

    Scenario: Setup - Verify Identity exists before SAR
        Given I send a get to '/v1/identity/app/sar-e2e-user-1'
        Then I should receive a successful response

    Scenario: Setup - Verify data exists before SAR
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a get to '/v1/sar-test/data1'
        Then I should receive a successful response
        And the response body should contain '"key":"value1"'

    Scenario: Trigger SAR request, wait for completion, and verify data
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a post to '/v1/sar' with the body '{}'
        Then the response status should be 202
        And the response body should contain 'sarID'
        When I wait for the SAR to complete
        Then I should receive a 200 response
        And the response should contain the presignedUrl
        When I call the presignedUrl
        Then a .json file should be downloaded
        And it should contain the expected user data

    Scenario: Verify data still exists after SAR (data should NOT be deleted)
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a get to '/v1/sar-test/data1'
        Then I should receive a successful response
        And the response body should contain '"key":"value1"'

    Scenario: Verify second data record still exists after SAR
        Given I set header 'requesting-service' to 'app'
        And I set header 'requesting-service-user-id' to 'sar-e2e-user-1'
        When I send a get to '/v1/sar-test/data2'
        Then I should receive a successful response
        And the response body should contain '"key":"value2"'

    Scenario: Verify identity still exists after SAR (identity should NOT be deleted)
        Given I send a get to '/v1/identity/app/sar-e2e-user-1'
        Then I should receive a successful response
        And the response status should be 200
