@udp
Feature: identity Api
    As a UDP Authenticated Client
    I want to be able to save data identity records
    And link records to a single udpId for a user

    Background:
        Given I am authenticated

    Scenario: Successfully create initial app User
        When I send a post to '/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 201

    Scenario: Avoid duplicate app user creation
        When I send a post to '/user' with the body '{"appId":"123", "serviceName": "app"}'
        Then I should recieve a successful response
        Then the response status should be 200

    #Scenario: Successfully link initial app User to another service
    #    When I send a post to '/identity/321' with the body '{"appId":"123", "serviceName": "service2", "accessToken":"test", "idToken":"test", "refreshToken":"test"}'
    #    Then I should recieve a successful response
    #    Then the response status should be 201

    #Scenario: Successfully re link a user
    #    When I send a post to '/identity/321' with the body '{"appId":"123", "serviceName": "service2", "accessToken":"token_updated", "idToken":"test", "refreshToken":"test"}'
    #    Then I should recieve a successful response
    #    Then the response status should be 201

    #Scenario: Returns a 404 if the appId isnt found when linking
    #    When I send a post to '/identity/321' with the body '{"appId":"doesnt-exist", "serviceName": "service2", "accessToken":"test", "idToken":"test", "refreshToken":"test"}'
    #    Then the response status should be 404

    #Scenario: Returns a 400 if the appId isnt set
    #    When I send a post to '/identity/321' with the body '{ "serviceName": "service2", "accessToken":"test", "idToken":"test", "refreshToken":"test"}'
    #    Then the response status should be 400

    #Scenario: Returns a 400 if the serviceName isnt set
    #    When I send a post to '/identity/321' with the body '{ "appId":"123", "accessToken":"test", "idToken":"test", "refreshToken":"test"}'
    #    Then the response status should be 400

    #Scenario: Successfully Retrieve identity Record
    #    When i send a get to '/identity/123'
    #    Then I should recieve a successful response

    #Scenario: Successfully Retrieve linked identity Record
    #    When i send a get to '/identity/321'
    #    Then I should recieve a successful response
    #    Then The response body contain body '{"serviceId":"321", "serviceName": "service2", "accessToken":"token_updated", "idToken":"test", "refreshToken":"test"}'

    #Scenario: Successfully Delete linked Record
    #    When i send a delete to '/identity/321'
    #    Then I should recieve a successful response

    #Scenario: Successfully Delete identity Record
    #    When i send a delete to '/identity/123'
    #    Then I should recieve a successful response

    #Scenario: Returns a 404 if not found
    #    When i send a get to '/identity/unknown'
    #    Then the response status should be 404

    #Scenario: Reutrns a 404 if url is invalid
    #    When i send a get to '/identity/'
    #    Then the response status should be 404
