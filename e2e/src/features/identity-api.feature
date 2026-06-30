@udp
Feature: identity Api
    As a UDP Authenticated Client
    I want to be able to save data identity records
    And link records to a single udpId for a user

    Background:
        Given I am authenticated

    Scenario: Successfully create initial app User
        When I send a post to '/v1/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should receive a successful response
        Then the response status should be 204

    Scenario: Successfully link initial app User to another service
        When I send a post to '/v1/identity/service2/321' with the body '{"appId":"123"}'
        Then I should receive a successful response
        Then the response status should be 200

    Scenario: Successfully re link a user
       When I send a post to '/v1/identity/service2/321' with the body '{"appId":"123"}'
       Then I should receive a successful response
       Then the response status should be 200

    Scenario: Returns a 404 if the appId isnt found when linking
        When I send a post to '/v1/identity/service2/321' with the body '{"appId":"doesnt-exist"}'
        Then the response status should be 404

    Scenario: Returns a 400 if the appId isnt set
        When I send a post to '/v1/identity/service2/321' with the body '{}'
        Then the response status should be 400

    Scenario: Successfully Retrieve identity Record
        When I send a get to '/v1/identity/app/123'
        Then I should receive a successful response

    Scenario: Successfully Retrieve linked identity Record
        When I send a get to '/v1/identity/service2/321'
        Then I should receive a successful response
        Then the response body contains '{"serviceId":"321", "serviceName": "service2"}'

    Scenario: Successfully link identity for exchange tests
        When I send a post to 'v1/identity/exchange-service/ex-456' with the body '{"appId": "123"}'
        Then the response status should be 200

    Scenario: Successfully exchange identity
        Given I set header 'requesting-service' to 'exchange-service'
        And I set header 'requesting-service-user-id' to 'ex-456'
        When I send a get to '/v1/identity/exchange?requiredService=app'
        Then I should receive a successful response
        Then the response status should be 200
        Then the response body contains '{"serviceId":"123", "serviceName":"app"}'

    Scenario: Returns 404 when exchanging with unknown identity
        Given I set header 'requesting-service' to 'exchange-service'
        And I set header 'requesting-service-user-id' to 'unknown'
        When I send a get to '/v1/identity/exchange?requiredService=app'
        Then the response status should be 404

    Scenario: Successfully retrieve linked services for a user
        When I send a get to '/v1/identity/linked-services/app/123'
        Then I should receive a successful response
        Then I should receive a successful response
        Then the response status should be 200
        Then the response body should contain '"linkedServices"'

    Scenario: Successfully Delete linked Record
        When I send a delete to '/v1/identity/service2/321'
        Then I should receive a successful response
        When I send a delete to '/v1/identity/exchange-service/ex-456'
        Then I should receive a successful response

    Scenario: Successfully Delete identity Record
        When I send a delete to '/v1/identity/app/123'
        Then I should receive a successful response

    Scenario: Returns a 404 if not found
        When I send a get to '/v1/identity/service2/unknown'
        Then the response status should be 404
